/**
 * Utility per la risoluzione del branding e del nome della squadra.
 *
 * REGOLA DI BRANDING:
 * Nelle viste reali, non deve essere imposto alcun nome societario hardcoded ('MAPI GROUP').
 * Se il nome non è ancora stato configurato dall'amministratore (o non è ancora pubblicato),
 * l'interfaccia deve adottare un nome tecnico neutro ('La Mia Squadra').
 * Il riferimento 'MAPI GROUP' è ammesso esclusivamente nei dati di fixture / collaudo dimostrativo locale.
 */

export const NEUTRAL_TEAM_NAME = 'La Mia Squadra';
export const DEMO_DEFAULT_TEAM_NAME = 'MAPI GROUP';

export function getTeamDisplayName(
  teamName: string | null | undefined,
  isDemo: boolean = false,
): string {
  if (teamName && teamName.trim().length > 0) {
    return teamName.trim();
  }
  return isDemo ? DEMO_DEFAULT_TEAM_NAME : NEUTRAL_TEAM_NAME;
}
