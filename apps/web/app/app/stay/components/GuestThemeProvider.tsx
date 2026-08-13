'use client'

import React, { createContext, useContext } from 'react'
import { getGuestTheme, GuestThemeConfig } from '@/lib/guest-theme'

const GuestThemeContext = createContext<GuestThemeConfig>(getGuestTheme('gold'))

export const useGuestTheme = () => useContext(GuestThemeContext)

export function GuestThemeProvider({
  colorScheme,
  children,
}: {
  colorScheme?: string | null
  children: React.ReactNode
}) {
  const theme = getGuestTheme(colorScheme)

  return (
    <GuestThemeContext.Provider value={theme}>
      <div
        data-guest-theme={theme.id}
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
          } as React.CSSProperties
        }
        className="w-full min-h-screen"
      >
        {children}
      </div>
    </GuestThemeContext.Provider>
  )
}
