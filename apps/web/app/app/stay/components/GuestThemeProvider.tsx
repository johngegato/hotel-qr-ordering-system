'use client'

import React, { createContext, useContext } from 'react'
import { getGuestTheme, GuestThemeConfig, GuestSurfaceTheme } from '@/lib/guest-theme'

const GuestThemeContext = createContext<GuestThemeConfig>(getGuestTheme('gold'))

export const useGuestTheme = () => useContext(GuestThemeContext)

export function GuestThemeProvider({
  colorScheme,
  accentTheme,
  surfaceTheme,
  children,
}: {
  colorScheme?: string | null
  /** Pre-resolved accent palette (overrides colorScheme lookup). */
  accentTheme?: GuestThemeConfig | null
  /** Resolved surface palette → --gw-* CSS custom properties. */
  surfaceTheme?: GuestSurfaceTheme | null
  children: React.ReactNode
}) {
  const theme = accentTheme ?? getGuestTheme(colorScheme)
  const surface = surfaceTheme

  return (
    <GuestThemeContext.Provider value={theme}>
      <div
        data-guest-theme={theme.id}
        data-guest-mode={surface?.mode ?? 'DARK_GOLD'}
        style={
          {
            '--guest-primary': theme.primaryHex,
            '--guest-secondary': theme.secondaryHex,
            '--guest-gradient': theme.gradient,
            '--guest-glow': theme.glowRgba,
            '--guest-badge-bg': theme.badgeBg,
            '--guest-badge-border': theme.badgeBorder,
            '--guest-orb-gradient': theme.orbGradient,
            '--guest-hover-bg': theme.hoverBg,
            '--guest-hover-border': theme.hoverBorder,
            // CMS surface tokens (theme_mode / theme_config)
            '--gw-bg': surface?.bg_primary ?? 'var(--gw-bg)',
            '--gw-surface': surface?.bg_surface ?? '#1e293b',
            '--gw-text': surface?.text_primary ?? '#ffffff',
            '--gw-text-2': surface?.text_secondary ?? '#94a3b8',
            '--gw-accent': surface?.accent_color ?? theme.primaryHex,
            '--gw-border': surface?.border_color ?? 'rgba(255, 255, 255, 0.15)',
            background: surface?.bg_primary ?? 'transparent',
            color: surface?.text_primary ?? 'inherit',
            minHeight: '100vh',
            transition: 'background 0.3s ease, color 0.3s ease',
          } as React.CSSProperties
        }
        className="w-full min-h-screen"
      >
        {children}
      </div>
    </GuestThemeContext.Provider>
  )
}
