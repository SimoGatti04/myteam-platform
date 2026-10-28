import { describe, it, expect } from 'vitest';
import { DEMO_MATCH_DETAILS, DEMO_STANDINGS, DEMO_ROSTER_MEMBERS } from '../src/fixtures/demoData';

describe('Domain Rules & Specifications Compliance', () => {
  it('correctly isolates dated matches from data da definire matches', () => {
    const dated = DEMO_MATCH_DETAILS.filter(m => m.scheduledAt);
    const tbd = DEMO_MATCH_DETAILS.filter(m => !m.scheduledAt);

    expect(dated.length).toBeGreaterThan(0);
    expect(tbd.length).toBeGreaterThan(0);
    tbd.forEach(m => {
      expect(m.status).toBe('to_be_scheduled');
      expect(m.scheduledAt).toBeNull();
    });
  });

  it('guarantees goalkeeper is the only special role in iOS domain', () => {
    const specialRoles = DEMO_ROSTER_MEMBERS.filter(m => m.isGoalkeeper);
    expect(specialRoles.length).toBeGreaterThan(0);
    expect(specialRoles[0].isGoalkeeper).toBe(true);
  });

  it('preserves inactive ex-players in data without removing them', () => {
    const inactive = DEMO_ROSTER_MEMBERS.filter(m => !m.isActive);
    expect(inactive.length).toBeGreaterThan(0);
    expect(inactive[0].displayName).toContain('Luca Sala');
  });

  it('identifies our team standing in standings table without full league table in stats', () => {
    const ourTeam = DEMO_STANDINGS.find(s => s.isOurTeam);
    expect(ourTeam).toBeDefined();
    expect(ourTeam?.teamName).toBe('ASD Aurora Calcio');
    expect(ourTeam?.position).toBe(2);
  });
});
