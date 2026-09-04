'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type {
  GuestThemeMode,
  GuestWebContentConfig,
  HotelThemeConfig,
} from '@hotel-qr/supabase/types'
import {
  getGuestTheme,
  GuestThemeConfig,
  GuestSurfaceTheme,
  resolveGuestSurfaceTheme,
} from '@/lib/guest-theme'
import { DEFAULT_CONTENT, mergeGuestContent } from '@/lib/guest-content'
import { GuestThemeProvider } from './GuestThemeProvider'

const supabase = createSupabaseBrowserClient()

const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000001'

export interface GuestSettingsState {
  themeMode: GuestThemeMode
  colorScheme: string | null
  themeConfig: Partial<HotelThemeConfig> | null
  /** Resolved, fully-fallback-applied content (safe to read directly). */
  content: GuestWebContentConfig
}

interface GuestSettingsContextValue {
  content: GuestWebContentConfig
  surface: GuestSurfaceTheme
  accent: GuestThemeConfig
}

const GuestSettingsContext = createContext<GuestSettingsContextValue>({
  content: DEFAULT_CONTENT,
  surface: resolveGuestSurfaceTheme('DARK_GOLD', null, 'gold'),
  accent: getGuestTheme('gold'),
})

/** Typed access to admin-published guest web copy (with fallbacks). */
export function useGuestContent(): GuestWebContentConfig {
  return useContext(GuestSettingsContext).content
}

/** Resolved surface palette (theme_mode + theme_config with fallbacks). */
export function useGuestSurfaceTheme(): GuestSurfaceTheme {
  return useContext(GuestSettingsContext).surface
}

interface RawRow {
  theme_mode?: string | null
  color_scheme?: string | null
  theme_config?: Partial<HotelThemeConfig> | null
  content_config?: Partial<GuestWebContentConfig> | null
}

const VALID_MODES: ReadonlyArray<GuestThemeMode> = [
  'DARK_GOLD',
  'CLEAN_LIGHT',
  'MINIMAL_WHITE',
  'LUXURY_NAVY',
  'CUSTOM',
]

function toState(row: Partial<RawRow>): GuestSettingsState {
  const rawMode = (row.theme_mode ?? 'DARK_GOLD').toUpperCase() as GuestThemeMode
  return {
    themeMode: VALID_MODES.includes(rawMode) ? rawMode : 'DARK_GOLD',
    colorScheme: row.color_scheme ?? null,
    themeConfig: row.theme_config ?? null,
    content: mergeGuestContent(row.content_config ?? null),
  }
}

/**
 * Fetches hotels.theme_mode / theme_config / content_config once,
 * subscribes to Supabase Realtime postgres_changes so admin
 * "Publish" updates land on open guest sessions without refresh.
 * Renders GuestThemeProvider so --guest-* and --gw-* CSS vars +
 * root background/text color apply to everything below.
 */
export function GuestSettingsProvider({
  hotelId,
  initial,
  children,
}: {
  hotelId?: string | null
  /** Server-rendered initial row (landing page) to avoid a flash. */
  initial?: RawRow | null
  children: React.ReactNode
}) {
  const id = hotelId || DEFAULT_HOTEL_ID
  const [state, setState] = useState<GuestSettingsState>(() =>
    toState(initial ?? {})
  )

  const applyRow = useCallback((row: Partial<RawRow>) => {
    setState(toState(row))
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchSettings = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('hotels')
          .select('theme_mode, color_scheme, theme_config, content_config')
          .eq('id', id)
          .maybeSingle()
        if (!error && data && isMounted) applyRow(data as Partial<RawRow>)
      } catch (err) {
        console.debug('[GuestSettingsProvider] fetch failed (using defaults):', err)
      }
    }

    fetchSettings()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`guest-web-settings-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hotels', filter: `id=eq.${id}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: { new: Partial<RawRow> }) => {
          if (!payload?.new) return
          applyRow(payload.new)
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any).removeChannel(channel)
    }
  }, [id, applyRow])

  const surface = useMemo(
    () => resolveGuestSurfaceTheme(state.themeMode, state.themeConfig, state.colorScheme),
    [state.themeMode, state.themeConfig, state.colorScheme]
  )

  const accent = useMemo(
    () => getGuestTheme(state.colorScheme),
    [state.colorScheme]
  )

  const ctx = useMemo(
    () => ({ content: state.content, surface, accent }),
    [state.content, surface, accent]
  )

  return (
    <GuestSettingsContext.Provider value={ctx}>
      <GuestThemeProvider accentTheme={accent} surfaceTheme={surface}>
        {children}
      </GuestThemeProvider>
    </GuestSettingsContext.Provider>
  )
}