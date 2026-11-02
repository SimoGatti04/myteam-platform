import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveThemeTokens, isValidHexColor, NEUTRAL_THEME } from '../src/services/theme';
import { apiService } from '../src/services/api';

describe('W3 MVP Functional Advancement: Branding & Dynamic Theming (Mode A)', () => {
  it('validates hex color strings strictly in #RRGGBB format', () => {
    expect(isValidHexColor('#1e3a8a')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('1e3a8a')).toBe(false);
    expect(isValidHexColor('#123')).toBe(false);
    expect(isValidHexColor('#gggggg')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });

  it('generates technical default when colors are null or empty', () => {
    const tokens = deriveThemeTokens(null, null, null);
    expect(tokens.isNeutralDefault).toBe(true);
    expect(tokens.primary).toBe(NEUTRAL_THEME.primary);
    expect(tokens.secondary).toBe(NEUTRAL_THEME.secondary);
    expect(tokens.textOnPrimary).toBe('#ffffff');
  });

  it('correctly calculates contrast and derived tones from valid primary/secondary', () => {
    const darkTokens = deriveThemeTokens('#0f172a', '#38bdf8', null);
    expect(darkTokens.isNeutralDefault).toBe(false);
    expect(darkTokens.primary).toBe('#0f172a');
    expect(darkTokens.secondary).toBe('#38bdf8');
    expect(darkTokens.textOnPrimary).toBe('#ffffff');

    // Light primary color should get dark text contrast
    const lightTokens = deriveThemeTokens('#f8fafc', '#0284c7', null);
    expect(lightTokens.textOnPrimary).toBe('#0f172a');
  });

  it('allows fine-tuning overrides for derived tokens (surface, border, textOnPrimary)', () => {
    const tokens = deriveThemeTokens('#1e3a8a', '#f59e0b', {
      surface: '#0f172a',
      border: '#334155',
      textOnPrimary: '#fbbf24',
    });
    expect(tokens.surface).toBe('#0f172a');
    expect(tokens.border).toBe('#334155');
    expect(tokens.textOnPrimary).toBe('#fbbf24');
  });
});

describe('W3 MVP Functional Advancement: Admin Competitions & Match Scheduling', () => {
  it('has apiService endpoints for competitions and schedule patch', () => {
    expect(typeof apiService.getAdminCompetitions).toBe('function');
    expect(typeof apiService.createCompetition).toBe('function');
    expect(typeof apiService.updateMatchSchedule).toBe('function');
  });

  it('provides mock data for demo competitions and opponents', () => {
    const comps = apiService.getDemoCompetitions();
    expect(Array.isArray(comps)).toBe(true);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps[0]).toHaveProperty('id');
    expect(comps[0]).toHaveProperty('name');
    expect(comps[0]).toHaveProperty('category');
    expect(comps[0]).toHaveProperty('isOfficial');

    const opps = apiService.getDemoOpponents();
    expect(Array.isArray(opps)).toBe(true);
    expect(opps.length).toBeGreaterThan(0);
    expect(opps[0]).toHaveProperty('id');
    expect(opps[0]).toHaveProperty('name');
  });
});
