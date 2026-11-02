export interface ThemeTokens {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  surface: string;
  border: string;
  textOnPrimary: string;
  heroBg: string;
  isNeutralDefault: boolean;
}

export type TokenOverrides = Partial<Omit<ThemeTokens, 'isNeutralDefault'>>;

// Standard neutral technical style used when no team palette is configured
export const NEUTRAL_THEME: ThemeTokens = {
  primary: '#334155',
  primaryLight: '#475569',
  primaryDark: '#1e293b',
  secondary: '#0ea5e9',
  secondaryLight: '#38bdf8',
  surface: '#0f172a',
  border: '#334155',
  textOnPrimary: '#ffffff',
  heroBg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  isNeutralDefault: true,
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6 && clean.length !== 3) return null;
  const normalized = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const num = parseInt(normalized, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function isValidHexColor(hex: string | null | undefined): boolean {
  if (!hex) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts an sRGB color component (0..255) to linear light value.
 * WCAG 2.1 Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function srgbToLinear(c: number): number {
  const norm = c / 255;
  return norm <= 0.04045
    ? norm / 12.92
    : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Calculates the relative luminance of a HEX color according to WCAG 2.1 specification.
 * Value is in the range 0.0 (darkest black) to 1.0 (lightest white).
 */
export function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const rLin = srgbToLinear(rgb.r);
  const gLin = srgbToLinear(rgb.g);
  const bLin = srgbToLinear(rgb.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates the contrast ratio between two HEX colors according to WCAG 2.1.
 * Returns a ratio between 1:1 and 21:1.
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks whether the contrast ratio between two colors meets WCAG criteria.
 * - 'AA': 4.5:1 for normal text (default)
 * - 'large': 3.0:1 for large text (>= 18pt or >= 14pt bold)
 * - 'AAA': 7.0:1 for enhanced contrast
 */
export function isWcagCompliant(
  fgHex: string,
  bgHex: string,
  level: 'AA' | 'large' | 'AAA' = 'AA'
): boolean {
  const ratio = getContrastRatio(fgHex, bgHex);
  if (level === 'large') return ratio >= 3.0;
  if (level === 'AAA') return ratio >= 7.0;
  return ratio >= 4.5;
}

/**
 * Selects the optimal text color against a given background color using WCAG 2.1 relative luminance.
 * Evaluates candidates (#ffffff, preferred dark, and #000000) to ensure the 4.5:1 WCAG AA threshold is met.
 * Handles tricky edge-case colors like olive #808000 where white contrast is only ~4.20:1 (< 4.5:1)
 * but dark/black reaches >= 5.0:1 (>= 4.5:1).
 */
export function getContrastColor(bgHex: string, preferredDark: string = '#0f172a'): string {
  const ratioWhite = getContrastRatio('#ffffff', bgHex);
  const ratioPreferredDark = getContrastRatio(preferredDark, bgHex);
  const ratioBlack = getContrastRatio('#000000', bgHex);

  // If white reaches 4.5:1 and is better than or equal to preferred dark, select white
  if (ratioWhite >= 4.5 && ratioWhite >= ratioPreferredDark) {
    return '#ffffff';
  }

  // If preferred dark (#0f172a) reaches 4.5:1, select preferred dark
  if (ratioPreferredDark >= 4.5) {
    return preferredDark;
  }

  // If pure black reaches 4.5:1 (e.g. #808000 olive), select pure black
  if (ratioBlack >= 4.5) {
    return '#000000';
  }

  // If none reaches 4.5:1, pick whichever maximizes contrast
  const maxRatio = Math.max(ratioWhite, ratioPreferredDark, ratioBlack);
  if (maxRatio === ratioWhite) return '#ffffff';
  if (maxRatio === ratioPreferredDark) return preferredDark;
  return '#000000';
}

/**
 * Deprecated alias retained for backward compatibility with existing tests/callers,
 * now using full WCAG relative luminance contrast instead of simple YIQ.
 */
export function getContrastYIQ(hex: string): string {
  return getContrastColor(hex);
}

export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 + percent / 100;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

/**
 * Approved Mode A: Intelligent derived color palette.
 * Takes base primary and secondary colors and calculates harmonious derived tokens.
 * In addition, individual token overrides can be applied directly.
 */
export function deriveThemeTokens(
  primaryColor?: string | null,
  secondaryColor?: string | null,
  overrides?: TokenOverrides | null,
): ThemeTokens {
  if (!primaryColor || !secondaryColor) {
    return {
      ...NEUTRAL_THEME,
      ...(overrides || {}),
      isNeutralDefault: true,
    };
  }

  const p = primaryColor.startsWith('#') ? primaryColor : `#${primaryColor}`;
  const s = secondaryColor.startsWith('#') ? secondaryColor : `#${secondaryColor}`;

  const baseDerived: ThemeTokens = {
    primary: p,
    primaryLight: adjustBrightness(p, 20),
    primaryDark: adjustBrightness(p, -25),
    secondary: s,
    secondaryLight: adjustBrightness(s, 20),
    surface: adjustBrightness(p, -80), // Deep tinted surface
    border: adjustBrightness(p, -40),
    textOnPrimary: getContrastColor(p),
    heroBg: `linear-gradient(135deg, ${adjustBrightness(p, -70)} 0%, #0b0f17 100%)`,
    isNeutralDefault: false,
  };

  return {
    ...baseDerived,
    ...(overrides || {}),
    isNeutralDefault: false,
  };
}

export function applyThemeToDocument(tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', tokens.primary);
  root.style.setProperty('--brand-primary-light', tokens.primaryLight);
  root.style.setProperty('--brand-primary-dark', tokens.primaryDark);
  root.style.setProperty('--brand-secondary', tokens.secondary);
  root.style.setProperty('--brand-secondary-light', tokens.secondaryLight);
  root.style.setProperty('--brand-surface', tokens.surface);
  root.style.setProperty('--brand-border', tokens.border);
  root.style.setProperty('--brand-text-on-primary', tokens.textOnPrimary);
  root.style.setProperty('--brand-hero-bg', tokens.heroBg);
}
