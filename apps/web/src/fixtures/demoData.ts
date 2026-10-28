/**
 * DEMO FIXTURES (Esplicitamente contrassegnate come DEMO)
 * 
 * Usate come fallback trasparente quando l'API backend non è raggiungibile o non contiene
 * ancora dati sufficienti. Rispettano fedelmente i contratti definiti in @myteam/contracts.
 */

import type {
  PublicTeam,
  AdminTeam,
  Season,
  Player,
  Opponent,
  Competition,
  PublicMatch,
  MatchDetail,
  StandingRow,
  PlayerStats,
  TeamSeasonStats,
} from '../types/domain';

export const IS_DEMO_DATA = true;

export const DEMO_SEASON: Season = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  label: '2026/2027',
  startsOn: '2026-09-01',
  endsOn: '2027-06-30',
};

export const DEMO_PAST_SEASON: Season = {
  id: '2fa85f64-5717-4562-b3fc-2c963f66afa5',
  label: '2025/2026',
  startsOn: '2025-09-01',
  endsOn: '2026-06-30',
};

export const DEMO_PUBLIC_TEAM: PublicTeam = {
  name: 'ASD Aurora Calcio',
  crestUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=160&auto=format&fit=crop&q=80',
  primaryColor: '#1e3a8a', // Deep navy
  secondaryColor: '#f59e0b', // Amber/Gold
  currentSeason: DEMO_SEASON,
};

export const DEMO_ADMIN_TEAM: AdminTeam = {
  id: 1,
  name: 'ASD Aurora Calcio',
  crestUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=160&auto=format&fit=crop&q=80',
  primaryColor: '#1e3a8a',
  secondaryColor: '#f59e0b',
  currentSeasonId: DEMO_SEASON.id,
  publishedAt: '2026-09-01T10:00:00.000Z',
};

export const DEMO_COMPETITIONS: Competition[] = [
  {
    id: 'c1-campionato-csi',
    name: 'Campionato CSI Open',
    category: 'league',
    isOfficial: true,
  },
  {
    id: 'c2-coppa-lombardia',
    name: 'Coppa Provinciale',
    category: 'cup',
    isOfficial: true,
  },
  {
    id: 'c3-torneo-autunno',
    name: 'Torneo d\'Autunno',
    category: 'tournament',
    isOfficial: true,
  },
  {
    id: 'c4-amichevoli',
    name: 'Amichevoli Pre-Stagione',
    category: 'friendly',
    isOfficial: false,
  },
];

export const DEMO_OPPONENTS: Opponent[] = [
  { id: 'op-1', name: 'Virtus Brianza' },
  { id: 'op-2', name: 'Real Bovisa' },
  { id: 'op-3', name: 'Stella Rossa Milano' },
  { id: 'op-4', name: 'Atletico Barona' },
  { id: 'op-5', name: 'Polisportiva Quarto' },
  { id: 'op-6', name: 'Nuova Baranzate' },
];

export const DEMO_PLAYERS: Player[] = [
  { id: 'pl-1', displayName: 'Marco Villa (P)' },
  { id: 'pl-2', displayName: 'Matteo Colombo' },
  { id: 'pl-3', displayName: 'Alessandro Ferri' },
  { id: 'pl-4', displayName: 'Lorenzo Fontana' },
  { id: 'pl-5', displayName: 'Simone Gatti' },
  { id: 'pl-6', displayName: 'Davide Moretti' },
  { id: 'pl-7', displayName: 'Federico De Luca' },
  { id: 'pl-8', displayName: 'Luca Sala (Ex)' },
];

export const DEMO_ROSTER_MEMBERS = [
  { id: 'rm-1', playerId: 'pl-1', displayName: 'Marco Villa', jerseyNumber: 1, isGoalkeeper: true, isActive: true },
  { id: 'rm-2', playerId: 'pl-2', displayName: 'Matteo Colombo', jerseyNumber: 3, isGoalkeeper: false, isActive: true },
  { id: 'rm-3', playerId: 'pl-3', displayName: 'Alessandro Ferri', jerseyNumber: 5, isGoalkeeper: false, isActive: true },
  { id: 'rm-4', playerId: 'pl-4', displayName: 'Lorenzo Fontana', jerseyNumber: 8, isGoalkeeper: false, isActive: true },
  { id: 'rm-5', playerId: 'pl-5', displayName: 'Simone Gatti', jerseyNumber: 10, isGoalkeeper: false, isActive: true },
  { id: 'rm-6', playerId: 'pl-6', displayName: 'Davide Moretti', jerseyNumber: 9, isGoalkeeper: false, isActive: true },
  { id: 'rm-7', playerId: 'pl-7', displayName: 'Federico De Luca', jerseyNumber: 11, isGoalkeeper: false, isActive: true },
  { id: 'rm-8', playerId: 'pl-8', displayName: 'Luca Sala', jerseyNumber: 7, isGoalkeeper: false, isActive: false }, // Left during season
];

export const DEMO_MATCH_DETAILS: MatchDetail[] = [
  // 1. Ultima partita conclusa (25 Ottobre 2026)
  {
    id: 'm-last',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Virtus Brianza',
    competitionName: 'Campionato CSI Open',
    isOfficial: true,
    scheduledAt: '2026-10-25T20:30:00.000Z',
    status: 'completed',
    homeTeamName: 'ASD Aurora Calcio',
    awayTeamName: 'Virtus Brianza',
    homeScore: 3,
    awayScore: 2,
    isHome: true,
    field: 'Centro Sportivo Comunale, Campo A',
    round: 'Giornata 5',
    potmPlayerName: 'Simone Gatti',
    homeStandingPosition: 2,
    awayStandingPosition: 4,
    events: [
      { id: 'ev-1', minute: 14, period: '1T', type: 'goal', playerName: 'Davide Moretti', assistPlayerName: 'Simone Gatti', team: 'home' },
      { id: 'ev-2', minute: 28, period: '1T', type: 'goal', playerName: 'Virtus Attaccante', team: 'away' },
      { id: 'ev-3', minute: 34, period: '1T', type: 'yellow_card', playerName: 'Alessandro Ferri', team: 'home' },
      { id: 'ev-4', minute: 52, period: '2T', type: 'goal', playerName: 'Simone Gatti', team: 'home' },
      { id: 'ev-5', minute: 68, period: '2T', type: 'goal', playerName: 'Virtus Centrocampista', team: 'away' },
      { id: 'ev-6', minute: 86, period: '2T', type: 'goal', playerName: 'Federico De Luca', assistPlayerName: 'Simone Gatti', team: 'home' },
    ],
  },
  // 2. Prossima partita (31 Ottobre 2026)
  {
    id: 'm-next',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Real Bovisa',
    competitionName: 'Campionato CSI Open',
    isOfficial: true,
    scheduledAt: '2026-10-31T15:00:00.000Z',
    status: 'scheduled',
    homeTeamName: 'Real Bovisa',
    awayTeamName: 'ASD Aurora Calcio',
    homeScore: null,
    awayScore: null,
    isHome: false,
    field: 'Stadio Bovisa Sport, Via Candiani 12',
    round: 'Giornata 6',
    homeStandingPosition: 1,
    awayStandingPosition: 2,
    events: [],
  },
  // 3. Partita futura (7 Novembre 2026)
  {
    id: 'm-future-1',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Stella Rossa Milano',
    competitionName: 'Campionato CSI Open',
    isOfficial: true,
    scheduledAt: '2026-11-07T18:00:00.000Z',
    status: 'scheduled',
    homeTeamName: 'ASD Aurora Calcio',
    awayTeamName: 'Stella Rossa Milano',
    homeScore: null,
    awayScore: null,
    isHome: true,
    field: 'Centro Sportivo Comunale, Campo A',
    round: 'Giornata 7',
    homeStandingPosition: 2,
    awayStandingPosition: 6,
    events: [],
  },
  // 4. Partita passata (18 Ottobre 2026)
  {
    id: 'm-past-2',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Polisportiva Quarto',
    competitionName: 'Campionato CSI Open',
    isOfficial: true,
    scheduledAt: '2026-10-18T16:30:00.000Z',
    status: 'completed',
    homeTeamName: 'Polisportiva Quarto',
    awayTeamName: 'ASD Aurora Calcio',
    homeScore: 1,
    awayScore: 4,
    isHome: false,
    field: 'Campo Quarto Oggiaro',
    round: 'Giornata 4',
    potmPlayerName: 'Davide Moretti',
    homeStandingPosition: 8,
    awayStandingPosition: 2,
    events: [
      { id: 'ev-11', minute: 8, period: '1T', type: 'goal', playerName: 'Davide Moretti', team: 'away' },
      { id: 'ev-12', minute: 22, period: '1T', type: 'goal', playerName: 'Federico De Luca', team: 'away' },
      { id: 'ev-13', minute: 40, period: '1T', type: 'goal', playerName: 'Davide Moretti', team: 'away' },
      { id: 'ev-14', minute: 61, period: '2T', type: 'goal', playerName: 'Quarto Numero 9', team: 'home' },
      { id: 'ev-15', minute: 75, period: '2T', type: 'goal', playerName: 'Simone Gatti', team: 'away' },
    ],
  },
  // 5. Partita DATA DA DEFINIRE (rinvio / calendario aperto)
  {
    id: 'm-tbd-1',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Atletico Barona',
    competitionName: 'Coppa Provinciale',
    isOfficial: true,
    scheduledAt: null,
    status: 'to_be_scheduled',
    homeTeamName: 'ASD Aurora Calcio',
    awayTeamName: 'Atletico Barona',
    homeScore: null,
    awayScore: null,
    isHome: true,
    field: 'Da confermare',
    round: 'Ottavi di finale (Gara secca)',
    homeStandingPosition: null,
    awayStandingPosition: null,
    events: [],
  },
  // 6. Amichevole conclusa (esclusa dai totali ufficiali predefiniti)
  {
    id: 'm-friendly-1',
    seasonId: DEMO_SEASON.id,
    opponentName: 'Nuova Baranzate',
    competitionName: 'Amichevoli Pre-Stagione',
    isOfficial: false,
    scheduledAt: '2026-09-12T17:00:00.000Z',
    status: 'completed',
    homeTeamName: 'ASD Aurora Calcio',
    awayTeamName: 'Nuova Baranzate',
    homeScore: 2,
    awayScore: 2,
    isHome: true,
    field: 'Centro Sportivo Comunale',
    round: 'Amichevole',
    potmPlayerName: null,
    homeStandingPosition: null,
    awayStandingPosition: null,
    events: [],
  },
];

export const DEMO_STANDINGS: StandingRow[] = [
  { position: 1, teamName: 'Real Bovisa', played: 5, won: 4, drawn: 1, lost: 0, goalsFor: 12, goalsAgainst: 4, goalDiff: 8, points: 13 },
  { position: 2, teamName: 'ASD Aurora Calcio', played: 5, won: 4, drawn: 0, lost: 1, goalsFor: 14, goalsAgainst: 7, goalDiff: 7, points: 12, isOurTeam: true },
  { position: 3, teamName: 'Nuova Baranzate', played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 6, goalDiff: 3, points: 10 },
  { position: 4, teamName: 'Virtus Brianza', played: 5, won: 2, drawn: 2, lost: 1, goalsFor: 10, goalsAgainst: 8, goalDiff: 2, points: 8 },
  { position: 5, teamName: 'Stella Rossa Milano', played: 5, won: 2, drawn: 0, lost: 3, goalsFor: 8, goalsAgainst: 10, goalDiff: -2, points: 6 },
  { position: 6, teamName: 'Polisportiva Quarto', played: 5, won: 1, drawn: 1, lost: 3, goalsFor: 6, goalsAgainst: 12, goalDiff: -6, points: 4 },
  { position: 7, teamName: 'Atletico Barona', played: 5, won: 0, drawn: 1, lost: 4, goalsFor: 4, goalsAgainst: 16, goalDiff: -12, points: 1 },
];

export const DEMO_TEAM_STATS_OFFICIAL: TeamSeasonStats = {
  seasonLabel: '2026/2027',
  isOfficialOnly: true,
  played: 5,
  won: 4,
  drawn: 0,
  lost: 1,
  goalsFor: 14,
  goalsAgainst: 7,
  goalDiff: 7,
  winPercentage: 80,
  standingPosition: 2,
  form: ['W', 'W', 'L', 'W', 'W'],
};

export const DEMO_TEAM_STATS_ALL: TeamSeasonStats = {
  seasonLabel: '2026/2027',
  isOfficialOnly: false,
  played: 6,
  won: 4,
  drawn: 1,
  lost: 1,
  goalsFor: 16,
  goalsAgainst: 9,
  goalDiff: 7,
  winPercentage: 66.7,
  standingPosition: 2,
  form: ['D', 'W', 'W', 'L', 'W', 'W'],
};

export const DEMO_PLAYER_STATS: PlayerStats[] = [
  { id: 'pl-1', displayName: 'Marco Villa', jerseyNumber: 1, isGoalkeeper: true, isActive: true, appearances: 5, goals: 0, potmCount: 0 },
  { id: 'pl-2', displayName: 'Matteo Colombo', jerseyNumber: 3, isGoalkeeper: false, isActive: true, appearances: 5, goals: 0, potmCount: 0 },
  { id: 'pl-3', displayName: 'Alessandro Ferri', jerseyNumber: 5, isGoalkeeper: false, isActive: true, appearances: 4, goals: 0, potmCount: 0 },
  { id: 'pl-4', displayName: 'Lorenzo Fontana', jerseyNumber: 8, isGoalkeeper: false, isActive: true, appearances: 5, goals: 1, potmCount: 0 },
  { id: 'pl-5', displayName: 'Simone Gatti', jerseyNumber: 10, isGoalkeeper: false, isActive: true, appearances: 5, goals: 5, potmCount: 2 },
  { id: 'pl-6', displayName: 'Davide Moretti', jerseyNumber: 9, isGoalkeeper: false, isActive: true, appearances: 5, goals: 6, potmCount: 1 },
  { id: 'pl-7', displayName: 'Federico De Luca', jerseyNumber: 11, isGoalkeeper: false, isActive: true, appearances: 4, goals: 2, potmCount: 1 },
  { id: 'pl-8', displayName: 'Luca Sala', jerseyNumber: 7, isGoalkeeper: false, isActive: false, appearances: 2, goals: 0, potmCount: 0 },
];
