import { describe, it, expect } from 'vitest';
import { deriveThemeTokens, NEUTRAL_THEME } from '../src/services/theme';

describe('Intelligent Dynamic Color Theming (Approved Mode A)', () => {
  it('returns neutral default technical theme when colors are unconfigured', () => {
    const tokens = deriveThemeTokens(null, null, null);
    expect(tokens.isNeutralDefault).toBe(true);
    expect(tokens.primary).toBe(NEUTRAL_THEME.primary);
    expect(tokens.surface).toBe(NEUTRAL_THEME.surface);
  });

  it('derives harmonious surface, border and text contrast from custom primary/secondary', () => {
    const tokens = deriveThemeTokens('#1e3a8a', '#f59e0b', null);
    expect(tokens.isNeutralDefault).toBe(false);
    expect(tokens.primary).toBe('#1e3a8a');
    expect(tokens.secondary).toBe('#f59e0b');
    expect(tokens.surface).toBeDefined();
    expect(tokens.border).toBeDefined();
    expect(tokens.textOnPrimary).toBe('#ffffff');
  });

  it('respects individual token fine-tuning overrides', () => {
    const tokens = deriveThemeTokens('#1e3a8a', '#f59e0b', {
      surface: '#001122',
      border: '#335577',
    });
    expect(tokens.surface).toBe('#001122');
    expect(tokens.border).toBe('#335577');
    expect(tokens.primary).toBe('#1e3a8a');
  });
});
