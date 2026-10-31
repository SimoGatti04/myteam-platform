import type { CsiKickoff } from "../types.js";

const LEGAL_FORM_TOKENS = new Set(["asd", "ssd", "as", "ss", "aps", "odv", "srl", "pol", "dil"]);

/** Diacritic-insensitive, punctuation-free, lowercase comparison form. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Team comparison form. Legal forms (ASD/SSD/…) are dropped because CSI and
 * local anagraphics rarely agree on them; nothing else is stripped, to avoid
 * merging genuinely different clubs.
 */
export function normalizeTeamName(input: string): string {
  const tokens = normalizeText(input).split(" ").filter((token) => token.length > 0);
  const meaningful = tokens.filter((token) => token.length > 1 && !LEGAL_FORM_TOKENS.has(token));
  const chosen = meaningful.length > 0 ? meaningful : tokens;
  return chosen.join(" ");
}

export function tokenSet(input: string): Set<string> {
  return new Set(normalizeTeamName(input).split(" ").filter((token) => token.length > 1));
}

/** Dice coefficient over token sets, 0..1, deterministic. */
export function tokenSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/**
 * Season label from the source path segment.
 *
 * The convention is a *configuration* value, not an assumption in code: CSI
 * publishes two-digit segments and different committees have used different
 * conventions over time. Explicit overrides always win.
 */
export function seasonLabelFromSegment(
  segment: string,
  convention: "start-year" | "end-year" | "explicit",
  overrides: Readonly<Record<string, string>> = {},
): string | null {
  const override = overrides[segment];
  if (override !== undefined) return override;
  if (convention === "explicit") return null;

  const trimmed = segment.trim();
  if (!/^\d{2}$|^\d{4}$/.test(trimmed)) return null;
  const year = trimmed.length === 2 ? 2000 + Number.parseInt(trimmed, 10) : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(year)) return null;
  const start = convention === "start-year" ? year : year - 1;
  const end = start + 1;
  const label = (value: number): string => String(value % 100).padStart(2, "0");
  return `${start}/${label(end)}`;
}

export function parseInteger(raw: string | null): number | null {
  if (raw === null) return null;
  const match = /-?\d+/.exec(raw.replace(/[\u00a0\u202f]/g, " "));
  if (match === null) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
}

export function parseScore(raw: string | null): { home: number; away: number } | null {
  if (raw === null) return null;
  const match = /(\d{1,3})\s*[-–:]\s*(\d{1,3})/.exec(raw);
  if (match === null) return null;
  const home = Number.parseInt(match[1] ?? "", 10);
  const away = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

function isCalendarDate(utcMs: number, year: number, month: number, day: number): boolean {
  const check = new Date(utcMs);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const read = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    return part === undefined ? Number.NaN : Number.parseInt(part.value, 10);
  };
  const hour = read("hour") === 24 ? 0 : read("hour");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"));
  return (asUtc - utcMs) / 60_000;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Builds an ISO-8601 timestamp with offset for a wall-clock date/time in a
 * zone. Returns null when the inputs are not a valid calendar date/time.
 */
export function toIsoKickoff(date: string, time: string | null, timeZone: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (dateMatch === null) return null;
  const year = Number.parseInt(dateMatch[1] ?? "", 10);
  const month = Number.parseInt(dateMatch[2] ?? "", 10);
  const day = Number.parseInt(dateMatch[3] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hour = 0;
  let minute = 0;
  if (time !== null) {
    const timeMatch = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
    if (timeMatch === null) return null;
    hour = Number.parseInt(timeMatch[1] ?? "", 10);
    minute = Number.parseInt(timeMatch[2] ?? "", 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  if (!isCalendarDate(localAsUtc, year, month, day)) return null;
  const firstOffset = zoneOffsetMinutes(localAsUtc, timeZone);
  if (!Number.isFinite(firstOffset)) return null;
  const utcMs = localAsUtc - firstOffset * 60_000;
  const finalOffset = zoneOffsetMinutes(utcMs, timeZone);
  if (!Number.isFinite(finalOffset)) return null;

  const sign = finalOffset >= 0 ? "+" : "-";
  const absolute = Math.abs(finalOffset);
  const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`;
}

export function buildKickoff(date: string, time: string | null, timeZone: string): CsiKickoff | null {
  const iso = toIsoKickoff(date, time, timeZone);
  if (iso === null) return null;
  return { date, time, timeZone, iso };
}

/** Normalizes the many date spellings a portal may publish to `YYYY-MM-DD`. */
export function parsePublishedDate(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw.replace(/[\u00a0\u202f]/g, " ").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso !== null) return text;
  const italian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (italian === null) return null;
  const day = Number.parseInt(italian[1] ?? "", 10);
  const month = Number.parseInt(italian[2] ?? "", 10);
  const rawYear = Number.parseInt(italian[3] ?? "", 10);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (!isCalendarDate(Date.UTC(year, month - 1, day), year, month, day)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parsePublishedTime(raw: string | null): string | null {
  if (raw === null) return null;
  const match = /(\d{1,2})[:.](\d{2})/.exec(raw);
  if (match === null) return null;
  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}
