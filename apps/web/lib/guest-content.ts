import type {
  GuestWebContentConfig,
  HotelThemeConfig,
  GuestThemeMode,
} from '@hotel-qr/supabase/types'

// ── Guest Web Content CMS — Fallback Dictionary ─────────────
// Single source of truth for default guest-facing copy. Any
// missing/empty value from Supabase falls back here so the UI
// never renders empty strings or throws.

export const DEFAULT_CONTENT: GuestWebContentConfig = {
  landing: {
    welcome_title: 'Your Personal Concierge',
    welcome_subtitle:
      'Welcome! Your personal concierge is ready. Select a service below or call the front desk anytime.',
    room_greeting_prefix: 'Welcome, Guest of Room',
    hero_banner_text:
      'Experience world-class dining, spa, and concierge services from your room.',
  },
  dining: {
    title: 'In-Room Dining & Bar',
    subtitle: 'Chef-crafted dishes delivered fresh to your room.',
    fnb_call_button_text: 'Call Dining Desk',
    special_instructions_placeholder: 'E.g., No onions, extra ice, allergies...',
  },
  spa: {
    title: 'Spa & Wellness',
    subtitle:
      'Curated holistic therapies and relaxing treatments delivered in-room or at our spa sanctuary.',
  },
  requests: {
    title: 'Room Services',
    subtitle:
      'Need anything delivered or fixed? Choose a service below and our hotel team will attend to you promptly.',
  },
  ai_chat: {
    widget_title: 'Hotel Virtual Assistant',
    welcome_message: 'Hello! How can I assist you with your stay today?',
    quick_prompt_1: 'What are the pool & gym hours?',
    quick_prompt_2: 'How do I order room service?',
  },
  footer: {
    copyright_text: 'Thank you for staying with us.',
    support_contact_text: 'Need help? Dial 0 for front desk',
  },
}

/**
 * Deep-merge admin content over defaults.
 * - Missing sections/keys → default
 * - Empty strings ("" or whitespace only) → default
 * - Malformed shapes → default (never throws)
 */
export function mergeGuestContent(
  partial?: Partial<GuestWebContentConfig> | null
): GuestWebContentConfig {
  const out = JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as GuestWebContentConfig

  if (!partial || typeof partial !== 'object') return out

  for (const section of Object.keys(DEFAULT_CONTENT) as Array<keyof GuestWebContentConfig>) {
    const adminSection = partial[section]
    if (!adminSection || typeof adminSection !== 'object') continue
    const defaultSection = DEFAULT_CONTENT[section] as Record<string, string>
    const adminRecord = adminSection as Record<string, unknown>
    for (const key of Object.keys(defaultSection)) {
      const value = adminRecord[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        ;(out[section] as Record<string, string>)[key] = value.trim()
      }
    }
  }

  return out
}

/** Normalize an admin-saved theme_config (null-safe, per-field fallbacks). */
export function normalizeThemeConfig(
  config?: Partial<HotelThemeConfig> | null
): HotelThemeConfig | null {
  if (!config || typeof config !== 'object') return null
  return {
    bg_primary: config.bg_primary ?? '',
    bg_surface: config.bg_surface ?? '',
    text_primary: config.text_primary ?? '',
    text_secondary: config.text_secondary ?? '',
    accent_color: config.accent_color ?? '',
    border_color: config.border_color ?? '',
  }
}

export const DEFAULT_THEME_MODE: GuestThemeMode = 'DARK_GOLD'