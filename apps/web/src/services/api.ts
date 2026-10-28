import type {
  PublicTeamDto,
  AdminTeamDto,
  PublicMatchDto,
  PublicMatchesDto,
  PublicRosterDto,
  TeamConfigurationRequest,
  SeasonCreateRequest,
  SeasonDto,
  PlayerCreateRequest,
  PlayerDto,
  RosterMembershipCreateRequest,
  RosterMembershipDto,
  OpponentCreateRequest,
  OpponentDto,
  CompetitionCreateRequest,
  CompetitionDto,
  MatchCreateRequest,
  MatchSchedulePatchRequest,
  MatchDto,
} from '@myteam/contracts';
import { authService } from './auth';
import {
  DEMO_PUBLIC_TEAM,
  DEMO_ADMIN_TEAM,
  DEMO_SEASON,
  DEMO_COMPETITIONS,
  DEMO_OPPONENTS,
  DEMO_PLAYERS,
  DEMO_ROSTER_MEMBERS,
  DEMO_MATCH_DETAILS,
  DEMO_STANDINGS,
  DEMO_TEAM_STATS_OFFICIAL,
  DEMO_TEAM_STATS_ALL,
  DEMO_PLAYER_STATS,
} from '../fixtures/demoData';

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; status: number; errorCode: string; message: string };

class ApiService {
  /**
   * Helper generico per fetch con gestione rigida degli errori HTTP.
   * Restituisce sempre un ApiResult tipizzato senza fallback silenziosi.
   */
  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    try {
      const headers = new Headers(options.headers || {});
      // Inietta Authorization header se disponibile
      const authHeaders = authService.getAuthHeaders();
      for (const [k, v] of Object.entries(authHeaders)) {
        if (!headers.has(k)) {
          headers.set(k, v);
        }
      }

      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.ok) {
        if (res.status === 204) {
          return { success: true, data: undefined as unknown as T };
        }
        const data = await res.json();
        return { success: true, data };
      }

      // Risposta di errore HTTP (400, 401, 403, 404, 409, 500, 503)
      let errorCode = `http_${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson && typeof errorJson.error === 'string') {
          errorCode = errorJson.error;
        }
      } catch {
        // Nessun body json d'errore
      }

      return {
        success: false,
        status: res.status,
        errorCode,
        message: this.mapErrorMessage(res.status, errorCode),
      };
    } catch (networkError: any) {
      // Backend offline o errore di rete
      return {
        success: false,
        status: 0,
        errorCode: 'network_offline',
        message: 'Server non raggiungibile (offline o connessione assente)',
      };
    }
  }

  private mapErrorMessage(status: number, code: string): string {
    switch (status) {
      case 401:
        return 'Autenticazione richiesta. Effettua l\'accesso.';
      case 403:
        return 'Accesso negato. Permessi insufficienti.';
      case 404:
        if (code === 'public_team_not_found') {
          return 'Squadra non ancora pubblicata. Il sito è attualmente in bozza.';
        }
        return 'Risorsa non trovata.';
      case 409:
        return 'Conflitto nei dati inviati.';
      case 503:
        return 'Servizio momentaneamente non disponibile o configurazione incompleta.';
      default:
        if (status >= 500) {
          return 'Errore interno del server.';
        }
        return `Errore HTTP ${status} (${code})`;
    }
  }

  // ==========================================
  // LETTURE PUBBLICHE REALI (Core Platform C0/C1)
  // ==========================================

  async getPublicTeam(): Promise<ApiResult<PublicTeamDto>> {
    return this.request<PublicTeamDto>('/api/v1/public/team');
  }

  async getPublicRoster(): Promise<ApiResult<PublicRosterDto>> {
    return this.request<PublicRosterDto>('/api/v1/public/roster');
  }

  async getPublicMatches(): Promise<ApiResult<PublicMatchesDto>> {
    return this.request<PublicMatchesDto>('/api/v1/public/matches');
  }

  // ==========================================
  // AMMINISTRAZIONE REALE (Core Platform C0/C1)
  // Richiedono Bearer token Logto
  // ==========================================

  async getAdminTeam(): Promise<ApiResult<AdminTeamDto | null>> {
    return this.request<AdminTeamDto | null>('/api/v1/admin/team');
  }

  async configureTeam(req: TeamConfigurationRequest): Promise<ApiResult<AdminTeamDto>> {
    return this.request<AdminTeamDto>('/api/v1/admin/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async publishTeam(): Promise<ApiResult<AdminTeamDto>> {
    return this.request<AdminTeamDto>('/api/v1/admin/team/publish', {
      method: 'POST',
    });
  }

  async createSeason(req: SeasonCreateRequest): Promise<ApiResult<SeasonDto>> {
    return this.request<SeasonDto>('/api/v1/admin/seasons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async createPlayer(req: PlayerCreateRequest): Promise<ApiResult<PlayerDto>> {
    return this.request<PlayerDto>('/api/v1/admin/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async createRosterMembership(req: RosterMembershipCreateRequest): Promise<ApiResult<RosterMembershipDto>> {
    return this.request<RosterMembershipDto>('/api/v1/admin/roster-memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async createOpponent(req: OpponentCreateRequest): Promise<ApiResult<OpponentDto>> {
    return this.request<OpponentDto>('/api/v1/admin/opponents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async createCompetition(req: CompetitionCreateRequest): Promise<ApiResult<CompetitionDto>> {
    return this.request<CompetitionDto>('/api/v1/admin/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async createMatch(req: MatchCreateRequest): Promise<ApiResult<MatchDto>> {
    return this.request<MatchDto>('/api/v1/admin/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async updateMatchSchedule(id: string, req: MatchSchedulePatchRequest): Promise<ApiResult<MatchDto>> {
    return this.request<MatchDto>(`/api/v1/admin/matches/${encodeURIComponent(id)}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  }

  async publishMatch(id: string): Promise<ApiResult<MatchDto>> {
    return this.request<MatchDto>(`/api/v1/admin/matches/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
  }

  // ==========================================
  // FORNITURA DATI DEMO ESPLICITA
  // Richiamata SOLO ed ESCLUSIVAMENTE quando dataMode === 'demo'
  // ==========================================

  getDemoPublicTeam(): PublicTeamDto {
    return DEMO_PUBLIC_TEAM;
  }

  getDemoAdminTeam(): AdminTeamDto {
    return DEMO_ADMIN_TEAM;
  }

  getDemoRoster(): PublicRosterDto {
    return {
      season: { id: DEMO_SEASON.id, label: DEMO_SEASON.label },
      players: DEMO_ROSTER_MEMBERS.map(m => ({
        id: m.playerId,
        displayName: m.displayName,
        jerseyNumber: m.jerseyNumber,
      })),
    };
  }

  getDemoMatches(): PublicMatchesDto {
    const scheduled: PublicMatchDto[] = [];
    const toBeScheduled: PublicMatchDto[] = [];

    for (const m of DEMO_MATCH_DETAILS) {
      const publicItem: PublicMatchDto = {
        id: m.id,
        seasonId: m.seasonId,
        opponentName: m.isHome ? m.awayTeamName : m.homeTeamName,
        competitionName: m.competitionName || null,
        isOfficial: m.isOfficial,
        scheduledAt: m.scheduledAt,
        status: m.status,
      };
      if (m.status === 'to_be_scheduled' || !m.scheduledAt) {
        toBeScheduled.push(publicItem);
      } else {
        scheduled.push(publicItem);
      }
    }

    return { scheduled, toBeScheduled };
  }

  getDemoMatchDetails(): typeof DEMO_MATCH_DETAILS {
    return DEMO_MATCH_DETAILS;
  }

  getDemoStandings(): typeof DEMO_STANDINGS {
    return DEMO_STANDINGS;
  }

  getDemoTeamStats(isOfficialOnly: boolean) {
    return isOfficialOnly ? DEMO_TEAM_STATS_OFFICIAL : DEMO_TEAM_STATS_ALL;
  }

  getDemoPlayerStats() {
    return DEMO_PLAYER_STATS;
  }

  getDemoSeasons() {
    return [DEMO_SEASON];
  }

  getDemoCompetitions() {
    return DEMO_COMPETITIONS;
  }

  getDemoOpponents() {
    return DEMO_OPPONENTS;
  }
}

export const apiService = new ApiService();
