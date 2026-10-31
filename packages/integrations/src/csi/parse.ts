import { diagnostic, type Diagnostic } from "../diagnostics.js";
import type { DomElement } from "../html/dom.js";
import { getAttribute, parseHtml, textContent, type DomDocument } from "../html/dom.js";
import { selectAll, selectOne } from "../html/selector.js";
import type { CsiLocator, CsiMatch, CsiResultStatus, CsiSnapshot, CsiStandingRow, CsiStandingsStatus, CsiTeamRef } from "../types.js";
import { extractIdentifier, matchKey } from "./ids.js";
import {
  buildKickoff,
  parseInteger,
  parsePublishedDate,
  parsePublishedTime,
  parseScore,
} from "./normalize.js";
import type { CsiExtractionProfile } from "./profile.js";

export interface ParseContext {
  profile: CsiExtractionProfile;
  /** Page URL, used to resolve relative logos only. */
  baseUrl: string;
  timeZone: string;
  /** `YYYY-MM-DD` used to distinguish scheduled from unknown for scoreless rows. */
  referenceDate: string;
  locator: CsiLocator;
}

export interface ParsedCompetition {
  competitionTitle: string | null;
  groupLabel: string | null;
  teams: CsiTeamRef[];
  matches: CsiMatch[];
  standings: CsiStandingRow[];
  standingsStatus: CsiStandingsStatus;
  diagnostics: Diagnostic[];
}

function classList(element: DomElement): string[] {
  return (getAttribute(element, "class") ?? "").split(/\s+/).filter((name) => name.length > 0);
}

function matchesPattern(element: DomElement, pattern: string | null): boolean {
  if (pattern === null) return false;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return false;
  }
  return classList(element).some((name) => regex.test(name));
}

function readText(root: DomElement | DomDocument, selector: string | null): string | null {
  if (selector === null) return null;
  const node = selectOne(root, selector);
  if (node === null) return null;
  const text = textContent(node);
  return text.length === 0 ? null : text;
}

function resolveLogo(source: string | null, baseUrl: string): string | null {
  if (source === null || source.trim().length === 0) return null;
  try {
    const url = new URL(source.trim(), baseUrl);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readTeamId(root: DomElement, attribute: string | null, pattern: string): string | null {
  if (attribute !== null) {
    const value = getAttribute(root, attribute);
    if (value !== null && value.trim().length > 0) return value.trim();
  }
  const anchor = selectOne(root, "a[href]");
  if (anchor !== null) {
    const href = getAttribute(anchor, "href");
    if (href !== null) return extractIdentifier(href, pattern);
  }
  return null;
}

function parseTeams(document: DomDocument, context: ParseContext, diagnostics: Diagnostic[]): CsiTeamRef[] {
  const { profile } = context;
  const rows = selectAll(document, profile.teams.rowSelector);
  const teams = new Map<string, CsiTeamRef>();

  rows.forEach((row, index) => {
    const name = readText(row, profile.teams.nameSelector) ?? textContent(row);
    if (name.length === 0) {
      diagnostics.push(diagnostic("team_row_without_name", "warning", "Team row has no readable name", { path: `teams[${index}]` }));
      return;
    }
    const csiTeamId = readTeamId(row, profile.teams.idAttribute, profile.patterns.teamId);
    const logoElement = profile.teams.logoSelector === null ? null : selectOne(row, profile.teams.logoSelector);
    const logoRaw = logoElement === null ? null : getAttribute(logoElement, profile.teams.logoAttribute);
    const logoUrl = resolveLogo(logoRaw, context.baseUrl);
    if (logoRaw !== null && logoUrl === null) {
      diagnostics.push(
        diagnostic("team_logo_ignored", "info", "Logo URL is not an absolute HTTPS URL and was ignored", {
          path: `teams[${index}].logo`,
          value: logoRaw,
        }),
      );
    }
    const key = csiTeamId ?? `name:${name.toLowerCase()}`;
    if (!teams.has(key)) teams.set(key, { csiTeamId, name, logoUrl });
  });

  return [...teams.values()];
}

function parseMatchTeams(
  row: DomElement,
  context: ParseContext,
  matchday: number | null,
  diagnostics: Diagnostic[],
): { home: CsiTeamRef; away: CsiTeamRef } | null {
  const { profile } = context;
  const homeCell = selectOne(row, profile.matches.homeSelector);
  const awayCell = selectOne(row, profile.matches.awaySelector);
  if (homeCell === null || awayCell === null) return null;

  const homeName = textContent(homeCell);
  const awayName = textContent(awayCell);
  if (homeName.length === 0 || awayName.length === 0) return null;

  const home: CsiTeamRef = {
    csiTeamId: readTeamId(homeCell, profile.matches.homeIdAttribute, profile.patterns.teamId),
    name: homeName,
    logoUrl: null,
  };
  const away: CsiTeamRef = {
    csiTeamId: readTeamId(awayCell, profile.matches.awayIdAttribute, profile.patterns.teamId),
    name: awayName,
    logoUrl: null,
  };

  if (home.csiTeamId === null || away.csiTeamId === null) {
    diagnostics.push(
      diagnostic("team_identifier_missing", "warning", "Match row lacks one or both team identifiers", {
        path: `matches[matchday=${matchday ?? "?"}]`,
      }),
    );
  }
  return { home, away };
}

function deriveStatus(
  row: DomElement,
  scoreCell: DomElement,
  hasScore: boolean,
  date: string | null,
  referenceDate: string,
): { status: CsiResultStatus; hints: string[] } {
  const hints = [...classList(row).map((name) => `row:${name}`), ...classList(scoreCell).map((name) => `score:${name}`)];
  if (matchesPattern(row, "^(rinviata|rinviato|posticipata)$")) return { status: "postponed", hints };
  if (matchesPattern(row, "^(annullata|annullato|cancellata)$")) return { status: "cancelled", hints };
  if (!hasScore) {
    const inFuture = date !== null && date >= referenceDate;
    return { status: inFuture ? "scheduled" : "unknown", hints };
  }
  if (matchesPattern(scoreCell, "^(omologat[oa]|ufficial[ei])$") || matchesPattern(row, "^(omologat[oa]|ufficial[ei])$")) {
    return { status: "official", hints };
  }
  if (matchesPattern(scoreCell, "^(ufficios[oa]|provvisor[ia])$") || matchesPattern(row, "^(ufficios[oa]|provvisor[ia])$")) {
    return { status: "unofficial", hints };
  }
  // No marker: the portal states that results are unofficial until homologated.
  return { status: "unofficial", hints: [...hints, "inferred:no-marker"] };
}

function parseMatches(document: DomDocument, context: ParseContext, diagnostics: Diagnostic[]): CsiMatch[] {
  const { profile } = context;
  const rows = selectAll(document, profile.matches.rowSelector);
  const matches: CsiMatch[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const matchday = parseInteger(readText(row, profile.matches.matchdaySelector));
    const date = parsePublishedDate(readText(row, profile.matches.dateSelector));
    const time = profile.matches.timeSelector === null ? null : parsePublishedTime(readText(row, profile.matches.timeSelector));
    const venue = profile.matches.venueSelector === null ? null : readText(row, profile.matches.venueSelector);
    const teams = parseMatchTeams(row, context, matchday, diagnostics);
    if (teams === null) {
      diagnostics.push(
        diagnostic("match_row_incomplete", "warning", "Match row has no readable home/away teams and was skipped", {
          path: `matches[${index}]`,
        }),
      );
      return;
    }

    const scoreCell = selectOne(row, profile.matches.scoreSelector);
    const rawScore = scoreCell === null ? null : textContent(scoreCell);
    const score = parseScore(rawScore);
    const { status, hints } = deriveStatus(row, scoreCell ?? row, score !== null, date, context.referenceDate);
    if (score !== null && hints.includes("inferred:no-marker")) {
      diagnostics.push(
        diagnostic("result_status_inferred_unofficial", "warning", "Result without homologation marker treated as unofficial", {
          path: `matches[${index}]`,
        }),
      );
    }
    if (date === null) {
      diagnostics.push(
        diagnostic("match_date_missing", "warning", "Match row has no readable date", { path: `matches[${index}]` }),
      );
    }

    const idFromAttribute = profile.matches.idAttribute === null ? null : getAttribute(row, profile.matches.idAttribute);
    const anchor = selectOne(row, "a[href]");
    const idFromLink = anchor === null ? null : extractIdentifier(getAttribute(anchor, "href") ?? "", profile.patterns.matchId);
    const csiMatchId = (idFromAttribute ?? idFromLink ?? "").trim() || null;

    const match: CsiMatch = {
      csiMatchId,
      idConfidence: csiMatchId === null ? "derived" : "observed",
      matchday,
      kickoff: date === null ? null : buildKickoff(date, time, context.timeZone),
      venue,
      home: teams.home,
      away: teams.away,
      score,
      resultStatus: status,
      statusHints: hints,
    };

    const key = matchKey(match);
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic("duplicate_match_identifier", "error", "Two rows resolved to the same match key", {
          path: `matches[${index}]`,
          value: key,
        }),
      );
      return;
    }
    seen.add(key);
    matches.push(match);
  });

  return matches;
}

function parseStandings(
  document: DomDocument,
  context: ParseContext,
  diagnostics: Diagnostic[],
): { rows: CsiStandingRow[]; status: CsiStandingsStatus } {
  const { profile } = context;
  const table = selectOne(document, profile.standings.tableSelector);
  if (table === null) {
    diagnostics.push(diagnostic("standings_absent", "info", "No standings table found on the page"));
    return { rows: [], status: "absent" };
  }

  let status: CsiStandingsStatus = "unknown";
  if (matchesPattern(table, profile.standings.officialTableClassPattern)) status = "official";
  else if (matchesPattern(table, profile.standings.unofficialTableClassPattern)) status = "unofficial";

  const rows = selectAll(table, profile.standings.rowSelector);
  const standings: CsiStandingRow[] = [];
  rows.forEach((row, index) => {
    const teamCell = selectOne(row, profile.standings.teamSelector);
    const name = teamCell === null ? "" : textContent(teamCell);
    if (name.length === 0) return;
    const csiTeamId = teamCell === null ? null : readTeamId(teamCell, profile.standings.teamIdAttribute, profile.patterns.teamId);
    standings.push({
      position: parseInteger(readText(row, profile.standings.positionSelector)),
      team: { csiTeamId, name, logoUrl: null },
      points: parseInteger(readText(row, profile.standings.columns.points)),
      played: parseInteger(readText(row, profile.standings.columns.played)),
      won: parseInteger(readText(row, profile.standings.columns.won)),
      drawn: parseInteger(readText(row, profile.standings.columns.drawn)),
      lost: parseInteger(readText(row, profile.standings.columns.lost)),
      goalsFor: parseInteger(readText(row, profile.standings.columns.goalsFor)),
      goalsAgainst: parseInteger(readText(row, profile.standings.columns.goalsAgainst)),
      goalDifference: parseInteger(readText(row, profile.standings.columns.goalDifference)),
    });
  });

  if (standings.length === 0) {
    diagnostics.push(diagnostic("standings_empty", "warning", "Standings table found but no readable rows"));
  }
  if (status !== "official") {
    diagnostics.push(
      diagnostic(
        "standings_not_official",
        "info",
        "Standings are not marked as homologated by the source and must not be published as official",
        { value: status },
      ),
    );
  }
  return { rows: standings, status };
}

export function parseCompetitionPage(html: string, context: ParseContext): ParsedCompetition {
  const diagnostics: Diagnostic[] = [];
  const document = parseHtml(html);
  const { profile } = context;

  const title = readText(document, profile.competition.titleSelector);
  const groupLabel = readText(document, profile.competition.groupLabelSelector);
  const teams = parseTeams(document, context, diagnostics);
  const matches = parseMatches(document, context, diagnostics);
  const standings = parseStandings(document, context, diagnostics);

  if (teams.length === 0) {
    diagnostics.push(diagnostic("teams_absent", "warning", "No participating teams found on the page"));
  }
  if (matches.length === 0) {
    diagnostics.push(diagnostic("matches_absent", "warning", "No matches found on the page"));
  }
  if (title === null) {
    diagnostics.push(diagnostic("competition_title_missing", "info", "Competition title not found"));
  }

  return {
    competitionTitle: title,
    groupLabel,
    teams,
    matches,
    standings: standings.rows,
    standingsStatus: standings.status,
    diagnostics,
  };
}

export function snapshotFromParsed(
  parsed: ParsedCompetition,
  context: ParseContext,
  fetchedAt: string,
): Omit<CsiSnapshot, "digest"> {
  return {
    schemaVersion: 1,
    sourceId: context.locator.sourceId,
    fetchedAt,
    locator: { ...context.locator, groupLabel: context.locator.groupLabel ?? parsed.groupLabel },
    competitionTitle: parsed.competitionTitle,
    teams: parsed.teams,
    matches: parsed.matches,
    standings: parsed.standings,
    standingsStatus: parsed.standingsStatus,
    parserProfile: { id: context.profile.id, version: context.profile.version },
    warnings: parsed.diagnostics,
  };
}
