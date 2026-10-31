import { DEFAULT_MATCH_ID_PATTERN, DEFAULT_TEAM_ID_PATTERN } from "./ids.js";

/**
 * Declarative extraction profile.
 *
 * Everything that depends on CSI markup lives here, not in the parser. When a
 * real sample becomes available (or CSI changes its templates) only the profile
 * changes; the pipeline, snapshot format and diff logic stay untouched.
 *
 * `verifiedAgainstLiveSource` must remain false until a live sample has been
 * acquired through an authorised channel and reviewed.
 */
export interface CsiExtractionProfile {
  id: string;
  version: string;
  verifiedAgainstLiveSource: boolean;
  notes: string;
  patterns: { teamId: string; matchId: string };
  competition: {
    titleSelector: string | null;
    groupLabelSelector: string | null;
  };
  teams: {
    rowSelector: string;
    nameSelector: string;
    idAttribute: string | null;
    logoSelector: string | null;
    logoAttribute: string;
  };
  matches: {
    rowSelector: string;
    idAttribute: string | null;
    matchdaySelector: string;
    dateSelector: string;
    timeSelector: string | null;
    venueSelector: string | null;
    homeSelector: string;
    awaySelector: string;
    scoreSelector: string;
    homeIdAttribute: string | null;
    awayIdAttribute: string | null;
    postponedClassPattern: string | null;
    cancelledClassPattern: string | null;
    officialClassPattern: string | null;
    unofficialClassPattern: string | null;
  };
  standings: {
    tableSelector: string;
    rowSelector: string;
    positionSelector: string;
    teamSelector: string;
    teamIdAttribute: string | null;
    columns: {
      points: string;
      played: string;
      won: string;
      drawn: string;
      lost: string;
      goalsFor: string;
      goalsAgainst: string;
      goalDifference: string;
    };
    officialTableClassPattern: string | null;
    unofficialTableClassPattern: string | null;
  };
  discovery: {
    itemSelector: string;
    hrefAttribute: string;
    valueAttribute: string;
    labelAttribute: string | null;
  };
}

export const CSI_PROFILE_V0: CsiExtractionProfile = {
  id: "csi-live-table",
  version: "0.1.0-unverified",
  verifiedAgainstLiveSource: false,
  notes:
    "Provisional DOM contract used by synthetic fixtures. Calibrate against a lawfully obtained live sample before enabling any automatic acquisition.",
  patterns: { teamId: DEFAULT_TEAM_ID_PATTERN, matchId: DEFAULT_MATCH_ID_PATTERN },
  competition: {
    titleSelector: "h1.competizione",
    groupLabelSelector: "select.girone option[selected]",
  },
  teams: {
    rowSelector: "table.squadre tr",
    nameSelector: "a.squadra",
    idAttribute: "data-team",
    logoSelector: "img.stemma",
    logoAttribute: "src",
  },
  matches: {
    rowSelector: "table.calendario tr.gara",
    idAttribute: "data-gara",
    matchdaySelector: "td.giornata",
    dateSelector: "td.data",
    timeSelector: "td.ora",
    venueSelector: "td.campo",
    homeSelector: "td.casa",
    awaySelector: "td.trasferta",
    scoreSelector: "td.risultato",
    homeIdAttribute: "data-team",
    awayIdAttribute: "data-team",
    postponedClassPattern: "^rinviata$",
    cancelledClassPattern: "^annullata$",
    officialClassPattern: "^omologat[oa]$",
    unofficialClassPattern: "^ufficios[oa]$",
  },
  standings: {
    tableSelector: "table.classifica",
    rowSelector: "tr",
    positionSelector: "td.pos",
    teamSelector: "td.squadra",
    teamIdAttribute: "data-team",
    columns: {
      points: "td.pt",
      played: "td.pg",
      won: "td.v",
      drawn: "td.n",
      lost: "td.p",
      goalsFor: "td.gf",
      goalsAgainst: "td.gs",
      goalDifference: "td.dr",
    },
    officialTableClassPattern: "^omologata$",
    unofficialTableClassPattern: "^ufficiosa$",
  },
  discovery: {
    itemSelector: "select.stagioni option",
    hrefAttribute: "data-href",
    valueAttribute: "value",
    labelAttribute: null,
  },
};

/** Profile with a different season-dropdown markup, used to prove configurability. */
export const CSI_PROFILE_V0_LINKED_DISCOVERY: CsiExtractionProfile = {
  ...CSI_PROFILE_V0,
  id: "csi-live-table-linked-discovery",
  discovery: {
    itemSelector: "ul.stagioni li a",
    hrefAttribute: "href",
    valueAttribute: "data-segment",
    labelAttribute: null,
  },
};
