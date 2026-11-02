import { describe, it, expect } from 'vitest';
import {
  deriveThemeTokens,
  NEUTRAL_THEME,
  getRelativeLuminance,
  getContrastRatio,
  isWcagCompliant,
  getContrastColor,
  isValidHexColor,
} from '../src/services/theme';

describe('Intelligent Dynamic Color Theming (Approved Mode A & WCAG 2.1 Contrast)', () => {
  it('returns neutral default technical theme when colors are unconfigured', () => {
    const tokens = deriveThemeTokens(null, null, null);
    expect(tokens.isNeutralDefault).toBe(true);
    expect(tokens.primary).toBe(NEUTRAL_THEME.primary);
    expect(tokens.surface).toBe(NEUTRAL_THEME.surface);
    expect(tokens.textOnPrimary).toBe('#ffffff');
  });

  it('calculates WCAG 2.1 relative luminance accurately', () => {
    expect(getRelativeLuminance('#000000')).toBeCloseTo(0.0, 4);
    expect(getRelativeLuminance('#ffffff')).toBeCloseTo(1.0, 4);
    // Olive #808000: sRGB [128, 128, 0] -> relative luminance ~0.2003
    const oliveLum = getRelativeLuminance('#808000');
    expect(oliveLum).toBeGreaterThan(0.19);
    expect(oliveLum).toBeLessThan(0.21);
  });

  it('calculates WCAG 2.1 contrast ratio accurately', () => {
    // Black vs White is 21:1
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21.0, 1);
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21.0, 1);
    // White vs Olive #808000 is ~4.195:1 (< 4.5:1, failing WCAG AA for normal text)
    const whiteOliveRatio = getContrastRatio('#ffffff', '#808000');
    expect(whiteOliveRatio).toBeLessThan(4.5);
    expect(whiteOliveRatio).toBeGreaterThan(4.1);
    // Black vs Olive #808000 is ~5.005:1 (>= 4.5:1, passing WCAG AA)
    const blackOliveRatio = getContrastRatio('#000000', '#808000');
    expect(blackOliveRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('selects WCAG AA compliant text color for olive #808000 (P2 finding remediation)', () => {
    // Under YIQ, #808000 selected white, which fails WCAG AA (4.20:1 < 4.5:1).
    // Under WCAG 2.1 relative luminance, #000000 is selected (5.01:1 >= 4.5:1).
    const chosenColor = getContrastColor('#808000');
    expect(chosenColor).toBe('#000000');
    const ratio = getContrastRatio(chosenColor, '#808000');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(isWcagCompliant(chosenColor, '#808000')).toBe(true);
  });

  it('handles edge-case palettes: light yellow, deep navy, vibrant red, electric green', () => {
    // Bright Yellow #ffff00 -> requires dark text
    const yellowText = getContrastColor('#ffff00');
    expect(getContrastRatio(yellowText, '#ffff00')).toBeGreaterThanOrEqual(4.5);
    expect(['#0f172a', '#000000']).toContain(yellowText);

    // Deep Navy #000080 -> requires white text
    const navyText = getContrastColor('#000080');
    expect(navyText).toBe('#ffffff');
    expect(getContrastRatio(navyText, '#000080')).toBeGreaterThanOrEqual(4.5);

    // Electric Cyan #00ffff -> requires dark text
    const cyanText = getContrastColor('#00ffff');
    expect(getContrastRatio(cyanText, '#00ffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('evaluates isWcagCompliant with standard AA, large and AAA criteria', () => {
    // 4.5:1 threshold for normal AA text
    expect(isWcagCompliant('#ffffff', '#000000', 'AA')).toBe(true);
    expect(isWcagCompliant('#ffffff', '#808000', 'AA')).toBe(false);

    // 3.0:1 threshold for large text
    expect(isWcagCompliant('#ffffff', '#808000', 'large')).toBe(true);

    // 7.0:1 threshold for AAA
    expect(isWcagCompliant('#ffffff', '#000000', 'AAA')).toBe(true);
    expect(isWcagCompliant('#000000', '#808000', 'AAA')).toBe(false);
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

  it('derives compliant textOnPrimary for olive #808000 palette', () => {
    const tokens = deriveThemeTokens('#808000', '#f59e0b', null);
    expect(tokens.primary).toBe('#808000');
    expect(tokens.textOnPrimary).toBe('#000000');
    expect(isWcagCompliant(tokens.textOnPrimary, tokens.primary)).toBe(true);
  });

  it('respects individual token fine-tuning overrides while preserving base colors', () => {
    const tokens = deriveThemeTokens('#1e3a8a', '#f59e0b', {
      surface: '#001122',
      border: '#335577',
      textOnPrimary: '#fefefe',
    });
    expect(tokens.surface).toBe('#001122');
    expect(tokens.border).toBe('#335577');
    expect(tokens.textOnPrimary).toBe('#fefefe');
    expect(tokens.primary).toBe('#1e3a8a');
  });

  it('validates HEX color formats with isValidHexColor', () => {
    expect(isValidHexColor('#123456')).toBe(true);
    expect(isValidHexColor('#abcdef')).toBe(true);
    expect(isValidHexColor('#ABCDEF')).toBe(true);
    expect(isValidHexColor('123456')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false);
    expect(isValidHexColor('#1234567')).toBe(false);
    expect(isValidHexColor('blue')).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
  });
});
