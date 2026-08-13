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
