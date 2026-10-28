import type {
  AdminTeamDto,
  PublicTeamDto,
  PublicMatchDto,
  PublicRosterDto,
  MatchStatus,
  PlayerDto,
  SeasonDto,
  OpponentDto,
  CompetitionDto,
  MatchDto,
} from '@myteam/contracts';

export type AdminTeam = AdminTeamDto;
export type PublicTeam = PublicTeamDto;
export type PublicMatch = PublicMatchDto;
export type PublicRoster = PublicRosterDto;
export type Player = PlayerDto;
export type Season = SeasonDto;
export type Opponent = OpponentDto;
export type Competition = CompetitionDto;
export type Match = MatchDto;
export type { MatchStatus };

export interface TeamBrandColors {
  primary: string;
  secondary: string;
  accent?: string;
  bgDark?: string;
  cardDark?: string;
  border?: string;
}

export interface MatchDetailEvent {
  id: string;
  minute: number;
  period: '1T' | '2T';
  type: 'goal' | 'yellow_card' | 'red_card';
  playerName: string;
  assistPlayerName?: string;
  team: 'home' | 'away';
}

export interface MatchDetail extends PublicMatch {
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isHome: boolean;
  field?: string | null;
  round?: string | null;
  potmPlayerName?: string | null;
  events?: MatchDetailEvent[];
  homeStandingPosition?: number | null;
  awayStandingPosition?: number | null;
}

export interface StandingRow {
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  isOurTeam?: boolean;
}

export interface PlayerStats {
  id: string;
  displayName: string;
  jerseyNumber: number | null;
  isGoalkeeper: boolean;
  isActive: boolean;
  appearances: number;
  goals: number;
  potmCount: number;
}

export interface TeamSeasonStats {
  seasonLabel: string;
  isOfficialOnly: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  winPercentage: number;
  standingPosition?: number | null;
  form: ('W' | 'D' | 'L')[];
}
