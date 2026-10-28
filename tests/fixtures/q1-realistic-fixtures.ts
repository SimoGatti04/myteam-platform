/**
 * Realistic synthetic fixtures for Q1 Checkpoint verification.
 * No real personal data or confidential production information included.
 */

export const realisticSeasonFixture = {
  label: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-06-30",
};

export const realisticTeamProfileFixture = {
  name: "ASD Real Aurora",
  crestUrl: "https://assets.example.org/crests/real-aurora.png",
  primaryColor: "#1E3A8A",
  secondaryColor: "#F59E0B",
};

export const realisticPlayersFixture = [
  { displayName: "Lorenzo De Luca", jerseyNumber: 1, role: "Portiere" },
  { displayName: "Marco Galli", jerseyNumber: 5, role: "Difensore" },
  { displayName: "Andrea Conti", jerseyNumber: 8, role: "Centrocampista" },
  { displayName: "Matteo Colombo", jerseyNumber: 10, role: "Attaccante" },
];

export const formerPlayerFixture = {
  displayName: "Federico Rota",
  jerseyNumber: 4,
  activeFrom: "2024-09-01",
  activeUntil: "2025-06-30",
};

export const futurePlayerFixture = {
  displayName: "Davide Villa",
  jerseyNumber: 99,
  activeFrom: "2028-01-01",
  activeUntil: "2028-06-30",
};

export const realisticOpponentsFixture = [
  { name: "Polisportiva San Donato" },
  { name: "Virtus Brianza" },
  { name: "Città di Monza Calcio" },
];

export const realisticCompetitionsFixture = [
  {
    name: "CSI Open a 7 - Campionato Eccellenza",
    category: "league" as const,
    isOfficial: true,
  },
  {
    name: "Coppa Brianza CSI",
    category: "cup" as const,
    isOfficial: true,
  },
  {
    name: "Amichevole Pre-Campionato",
    category: "friendly" as const,
    isOfficial: false,
  },
];
