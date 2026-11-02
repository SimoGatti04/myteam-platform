import { createRemoteJWKSet, jwtVerify } from "jose";
import { DomainError } from "./errors.js";

export interface AdminActor {
  subject: string;
}

export interface AdminTokenVerifierConfig {
  issuer: string;
  audience: string;
  requiredScope: string;
  jwksUrl?: string;
}

export type AdminTokenVerifier = (authorizationHeader: string | undefined) => Promise<AdminActor>;

export async function createLogtoAdminTokenVerifier(config: AdminTokenVerifierConfig): Promise<AdminTokenVerifier> {
  const issuer = config.issuer;
  const jwksUrl = config.jwksUrl ?? (await discoverJwksUrl(issuer));
  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  return async (authorizationHeader) => {
    const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader ?? "");
    if (!match) throw new DomainError(401, "authentication_required");

    let payload;
    try {
      ({ payload } = await jwtVerify(match[1]!, jwks, {
        issuer,
        audience: config.audience,
        requiredClaims: ["exp"],
      }));
    } catch {
      throw new DomainError(401, "invalid_access_token");
    }

    if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
      throw new DomainError(401, "invalid_access_token");
    }

    const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
    if (!scopes.includes(config.requiredScope)) {
      throw new DomainError(403, "insufficient_permissions");
    }

    return { subject: payload.sub };
  };
}

async function discoverJwksUrl(issuer: string): Promise<string> {
  const issuerBase = issuer.endsWith("/") ? issuer : `${issuer}/`;
  const discoveryUrl = new URL(".well-known/openid-configuration", issuerBase);
  const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Logto OIDC discovery returned HTTP ${response.status}`);

  const metadata: unknown = await response.json();
  if (typeof metadata !== "object" || metadata === null || !("issuer" in metadata) || !("jwks_uri" in metadata)) {
    throw new Error("Logto OIDC discovery is missing issuer or jwks_uri");
  }
  const issuerValue = metadata.issuer;
  const jwksValue = metadata.jwks_uri;
  if (issuerValue !== issuer || typeof jwksValue !== "string") {
    throw new Error("Logto OIDC discovery issuer does not match configured issuer");
  }
  const jwksUrl = new URL(jwksValue);
  if (jwksUrl.protocol !== "https:") throw new Error("Logto JWKS URI must use HTTPS");
  return jwksUrl.toString();
}
