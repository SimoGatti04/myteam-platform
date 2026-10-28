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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
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

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function getContrastYIQ(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 140 ? '#0f172a' : '#ffffff';
}

function adjustBrightness(hex: string, percent: number): string {
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
    textOnPrimary: getContrastYIQ(p),
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
