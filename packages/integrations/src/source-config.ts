import { IntegrationError } from "./errors.js";
import type { AcquisitionLimits } from "./acquire/client.js";
import type { SourceUrlPolicy } from "./security/url-policy.js";
import { CSI_LIVE_HOST, validateSourceUrl } from "./security/url-policy.js";
import type { CsiSourceConfig } from "./types.js";

export const DEFAULT_CSI_LIMITS: AcquisitionLimits = {
  timeoutMs: 8_000,
  maxBytes: 512 * 1024,
  maxRedirects: 2,
  requestsPerMinute: 6,
  cacheTtlMs: 5 * 60_000,
};

export function defaultCsiSourceConfig(): CsiSourceConfig {
  return {
    id: "csi-live",
    enabled: false,
    allowedHosts: [CSI_LIVE_HOST],
    baseUrl: `https://${CSI_LIVE_HOST}/`,
    seasonLabelConvention: "start-year",
    seasonLabelOverrides: {},
    timeZone: "Europe/Rome",
    limits: { ...DEFAULT_CSI_LIMITS },
  };
}

const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function invalid(issues: string[]): never {
  throw new IntegrationError("configuration_invalid", "CSI source configuration is invalid", {
    details: { issues },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLimits(input: unknown, issues: string[]): AcquisitionLimits {
  if (!isRecord(input)) {
    issues.push("limits must be an object");
    return { ...DEFAULT_CSI_LIMITS };
  }
  const bounds: Record<keyof AcquisitionLimits, readonly [number, number]> = {
    timeoutMs: [1_000, 60_000],
    maxBytes: [1_024, 5 * 1024 * 1024],
    maxRedirects: [0, 5],
    requestsPerMinute: [1, 60],
    cacheTtlMs: [0, 24 * 60 * 60 * 1000],
  };
  const result = { ...DEFAULT_CSI_LIMITS };
  for (const key of Object.keys(input)) {
    if (!(key in bounds)) issues.push(`limits.${key} is not a supported limit`);
  }
  for (const key of Object.keys(bounds) as Array<keyof AcquisitionLimits>) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      issues.push(`limits.${key} must be an integer`);
      continue;
    }
    const [min, max] = bounds[key];
    if (raw < min || raw > max) issues.push(`limits.${key} must be between ${min} and ${max}`);
    else result[key] = raw;
  }
  return result;
}

/**
 * Validates the admin-provided source configuration. Never throws on parse of
 * untrusted input other than through `IntegrationError` with issue details.
 */
export function validateSourceConfig(input: unknown): CsiSourceConfig {
  const issues: string[] = [];
  if (!isRecord(input)) invalid(["configuration must be an object"]);

  const id = input["id"];
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) issues.push("id must be a lowercase slug (2-41 chars)");

  const enabled = input["enabled"];
  if (typeof enabled !== "boolean") issues.push("enabled must be a boolean");

  const allowedHostsRaw = input["allowedHosts"];
  const allowedHosts: string[] = [];
  if (!Array.isArray(allowedHostsRaw) || allowedHostsRaw.length === 0) {
    issues.push("allowedHosts must be a non-empty array");
  } else {
    for (const entry of allowedHostsRaw) {
      if (typeof entry !== "string" || !HOSTNAME.test(entry.toLowerCase())) {
        issues.push(`allowedHosts entry is not a valid hostname: ${String(entry)}`);
        continue;
      }
      allowedHosts.push(entry.toLowerCase());
    }
    if (!allowedHosts.includes(CSI_LIVE_HOST)) {
      issues.push(`allowedHosts must include ${CSI_LIVE_HOST} for the CSI source`);
    }
  }

  const baseUrl = input["baseUrl"];
  if (typeof baseUrl !== "string") issues.push("baseUrl must be a string");

  const convention = input["seasonLabelConvention"];
  if (convention !== "start-year" && convention !== "end-year" && convention !== "explicit") {
    issues.push("seasonLabelConvention must be start-year, end-year or explicit");
  }

  const overridesRaw = input["seasonLabelOverrides"];
  const seasonLabelOverrides: Record<string, string> = {};
  if (overridesRaw !== undefined) {
    if (!isRecord(overridesRaw)) issues.push("seasonLabelOverrides must be an object");
    else {
      for (const [key, value] of Object.entries(overridesRaw)) {
        if (typeof value !== "string" || !/^\d{4}\/\d{2}$/.test(value)) {
          issues.push(`seasonLabelOverrides.${key} must look like YYYY/YY`);
          continue;
        }
        seasonLabelOverrides[key] = value;
      }
    }
  }

  const timeZone = input["timeZone"];
  if (typeof timeZone !== "string") issues.push("timeZone must be a string");
  else {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      issues.push(`timeZone is not a valid IANA zone: ${timeZone}`);
    }
  }

  const limits = readLimits(input["limits"], issues);
  if (issues.length > 0) invalid(issues);

  const config: CsiSourceConfig = {
    id: id as string,
    enabled: enabled as boolean,
    allowedHosts,
    baseUrl: baseUrl as string,
    seasonLabelConvention: convention as CsiSourceConfig["seasonLabelConvention"],
    seasonLabelOverrides,
    timeZone: timeZone as string,
    limits,
  };

  const policy = policyFromConfig(config);
  try {
    validateSourceUrl(config.baseUrl, policy);
  } catch (error) {
    const reason = error instanceof IntegrationError ? error.message : "invalid URL";
    invalid([`baseUrl is not allowed by the source policy: ${reason}`]);
  }
  return config;
}

export function policyFromConfig(config: CsiSourceConfig): SourceUrlPolicy {
  return {
    allowedHosts: config.allowedHosts,
    allowSubdomains: false,
    allowHttp: false,
    allowedPorts: [443],
    maxUrlLength: 2048,
    sameHostRedirectsOnly: true,
  };
}
