export type GuestColorScheme = 'gold' | 'emerald' | 'sapphire' | 'amethyst' | 'rose' | 'slate'

export interface GuestThemeConfig {
  id: GuestColorScheme
  name: string
  description: string
  primaryHex: string
  secondaryHex: string
  gradient: string
  glowRgba: string
  badgeBg: string
  badgeBorder: string
  orbGradient: string
  hoverBg: string
  hoverBorder: string
}

export const GUEST_THEMES: Record<GuestColorScheme, GuestThemeConfig> = {
  gold: {
    id: 'gold',
    name: 'Luxury Amber Gold',
    description: 'Warm gold & bronze tones for high-end hospitality',
    primaryHex: '#fbbf24',
    secondaryHex: '#d97706',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
    glowRgba: 'rgba(251, 191, 36, 0.4)',
    badgeBg: 'rgba(251, 191, 36, 0.15)',
    badgeBorder: 'rgba(251, 191, 36, 0.3)',
    orbGradient: 'radial-gradient(circle, #fbbf24, transparent)',
    hoverBg: 'rgba(251, 191, 36, 0.1)',
    hoverBorder: 'rgba(251, 191, 36, 0.3)',
  },
  emerald: {
    id: 'emerald',
    name: 'Royal Emerald',
    description: 'Rich emerald green for eco-luxury & boutique resorts',
    primaryHex: '#34d399',
    secondaryHex: '#059669',
    gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)',
    glowRgba: 'rgba(52, 211, 153, 0.4)',
    badgeBg: 'rgba(52, 211, 153, 0.15)',
    badgeBorder: 'rgba(52, 211, 153, 0.3)',
    orbGradient: 'radial-gradient(circle, #10b981, transparent)',
    hoverBg: 'rgba(52, 211, 153, 0.1)',
    hoverBorder: 'rgba(52, 211, 153, 0.3)',
  },
  sapphire: {
    id: 'sapphire',
    name: 'Ocean Sapphire',
    description: 'Crisp cyan & sapphire blue for coastal & modern hotels',
    primaryHex: '#38bdf8',
    secondaryHex: '#0284c7',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)',
    glowRgba: 'rgba(56, 189, 248, 0.4)',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    badgeBorder: 'rgba(56, 189, 248, 0.3)',
    orbGradient: 'radial-gradient(circle, #0ea5e9, transparent)',
    hoverBg: 'rgba(56, 189, 248, 0.1)',
    hoverBorder: 'rgba(56, 189, 248, 0.3)',
  },
  amethyst: {
    id: 'amethyst',
    name: 'Imperial Amethyst',
    description: 'Deep violet & magenta accents for luxury spa retreats',
    primaryHex: '#c084fc',
    secondaryHex: '#7c3aed',
    gradient: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)',
    glowRgba: 'rgba(192, 132, 252, 0.4)',
    badgeBg: 'rgba(192, 132, 252, 0.15)',
    badgeBorder: 'rgba(192, 132, 252, 0.3)',
    orbGradient: 'radial-gradient(circle, #a855f7, transparent)',
    hoverBg: 'rgba(192, 132, 252, 0.1)',
    hoverBorder: 'rgba(192, 132, 252, 0.3)',
  },
  rose: {
    id: 'rose',
    name: 'Velvet Rose',
    description: 'Romantic rose gold & crimson for luxury boutique stays',
    primaryHex: '#fb7185',
    secondaryHex: '#e11d48',
    gradient: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 50%, #e11d48 100%)',
    glowRgba: 'rgba(251, 113, 133, 0.4)',
    badgeBg: 'rgba(251, 113, 133, 0.15)',
    badgeBorder: 'rgba(251, 113, 133, 0.3)',
    orbGradient: 'radial-gradient(circle, #f43f5e, transparent)',
    hoverBg: 'rgba(251, 113, 133, 0.1)',
    hoverBorder: 'rgba(251, 113, 133, 0.3)',
  },
  slate: {
    id: 'slate',
    name: 'Platinum Slate',
    description: 'Sleek silver & platinum monochrome for minimalist urban hotels',
    primaryHex: '#cbd5e1',
    secondaryHex: '#475569',
    gradient: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #64748b 100%)',
    glowRgba: 'rgba(203, 213, 225, 0.4)',
    badgeBg: 'rgba(203, 213, 225, 0.15)',
    badgeBorder: 'rgba(203, 213, 225, 0.3)',
    orbGradient: 'radial-gradient(circle, #94a3b8, transparent)',
    hoverBg: 'rgba(203, 213, 225, 0.1)',
    hoverBorder: 'rgba(203, 213, 225, 0.3)',
  },
}

export function getGuestTheme(colorScheme?: string | null): GuestThemeConfig {
  const schemeKey = (colorScheme?.toLowerCase() as GuestColorScheme) || 'gold'
  return GUEST_THEMES[schemeKey] || GUEST_THEMES.gold
}

// ── Theme Modes & Surface Color Presets (CMS) ───────────────
// Surface palette presets selected via hotels.theme_mode.
// 'CUSTOM' means hotels.theme_config holds the full palette.

import type { GuestThemeMode, HotelThemeConfig } from '@hotel-qr/supabase/types'

export interface GuestSurfaceTheme {
  mode: GuestThemeMode
  bg_primary: string
  bg_surface: string
  text_primary: string
  text_secondary: string
  accent_color: string
  border_color: string
}

export const THEME_MODE_PRESETS: Record<
  Exclude<GuestThemeMode, 'CUSTOM'>,
  Omit<GuestSurfaceTheme, 'mode'>
> = {
  DARK_GOLD: {
    bg_primary: '#0f172a',
    bg_surface: '#1e293b',
    text_primary: '#ffffff',
    text_secondary: '#94a3b8',
    accent_color: '#fbbf24',
    border_color: 'rgba(255, 255, 255, 0.15)',
  },
  CLEAN_LIGHT: {
    bg_primary: '#f8fafc',
    bg_surface: '#ffffff',
    text_primary: '#0f172a',
    text_secondary: '#475569',
    accent_color: '#b45309',
    border_color: 'rgba(15, 23, 42, 0.12)',
  },
  MINIMAL_WHITE: {
    bg_primary: '#ffffff',
    bg_surface: '#fafafa',
    text_primary: '#111827',
    text_secondary: '#6b7280',
    accent_color: '#111827',
    border_color: 'rgba(17, 24, 39, 0.1)',
  },
  LUXURY_NAVY: {
    bg_primary: '#0c1631',
    bg_surface: '#16224a',
    text_primary: '#f8fafc',
    text_secondary: '#a5b4d4',
    accent_color: '#e6c98a',
    border_color: 'rgba(230, 201, 138, 0.25)',
  },
}

export const THEME_MODE_LABELS: Record<GuestThemeMode, string> = {
  DARK_GOLD: 'Dark Gold',
  CLEAN_LIGHT: 'Clean Light',
  MINIMAL_WHITE: 'Minimalist White',
  LUXURY_NAVY: 'Luxury Navy',
  CUSTOM: 'Custom Brand',
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value === 'string' && HEX_RE.test(value.trim())) return value.trim()
  return fallback
}

/**
 * Resolve the full surface theme from admin-controlled values.
 * Safe fallbacks: unknown modes → DARK_GOLD; CUSTOM with missing
 * colors → DARK_GOLD palette per-field; legacy accent color scheme
 * overrides accent_color for non-custom palettes.
 */
export function resolveGuestSurfaceTheme(
  themeMode?: string | null,
  themeConfig?: Partial<HotelThemeConfig> | null,
  colorScheme?: string | null
): GuestSurfaceTheme {
  const modeKey = (themeMode?.toUpperCase() as GuestThemeMode) || 'DARK_GOLD'
  const base =
    modeKey === 'CUSTOM'
      ? THEME_MODE_PRESETS.DARK_GOLD
      : THEME_MODE_PRESETS[modeKey] ?? THEME_MODE_PRESETS.DARK_GOLD

  if (modeKey !== 'CUSTOM') {
    // Accent follows the legacy color scheme picker (gold/emerald/...)
    const accent = getGuestTheme(colorScheme).primaryHex
    return { mode: modeKey, ...base, accent_color: accent }
  }

  return {
    mode: 'CUSTOM',
    bg_primary: normalizeHex(themeConfig?.bg_primary, base.bg_primary),
    bg_surface: normalizeHex(themeConfig?.bg_surface, base.bg_surface),
    text_primary: normalizeHex(themeConfig?.text_primary, base.text_primary),
    text_secondary: normalizeHex(themeConfig?.text_secondary, base.text_secondary),
    accent_color: normalizeHex(themeConfig?.accent_color, base.accent_color),
    border_color:
      typeof themeConfig?.border_color === 'string' && themeConfig.border_color
        ? themeConfig.border_color
        : base.border_color,
  }
}

/** WCAG relative luminance + contrast ratio helpers (admin contrast safety). */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(channelLuminance)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
