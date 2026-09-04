# Session: 2026-09-04 — Dynamic Theme & Content CMS

**Branch**: `main`
**Date**: 2026-09-04
**Commit**: `8c37c3a`

---

## Objective
Build a complete Dynamic Theme & Content Management System (CMS) allowing admins to customize visual styling (Light/Dark presets + custom colors) and edit all text/copy across the guest web application in real time.

## Changes

### Database — Migration 24
- `packages/supabase/migrations/24_guest_web_theme_content_cms.sql` & `apps/web/supabase/migrations/24_guest_web_theme_content_cms.sql`:
  - `ALTER TABLE hotels ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'DARK_GOLD'`
  - `ALTER TABLE hotels ADD COLUMN IF NOT EXISTS theme_config JSONB` — custom hex colors for CUSTOM mode
  - `ALTER TABLE hotels ADD COLUMN IF NOT EXISTS content_config JSONB` — sectioned key-value dictionary for guest-facing copy

### TypeScript Types (`packages/supabase/types/index.ts`)
- Exported strict interfaces: `GuestThemeMode`, `HotelThemeConfig`, `GuestWebContentConfig` (landing/dining/spa/requests/ai_chat/footer sections), and `GuestWebSettings`

### Libraries
- **`apps/web/lib/guest-theme.ts`** — 5 preset palettes (Dark Gold, Clean Light, Minimal White, Luxury Navy, Custom), `resolveGuestSurfaceTheme()` with per-field fallbacks, WCAG `contrastRatio()` helpers for admin safety checks
- **`apps/web/lib/guest-content.ts`** — `DEFAULT_CONTENT` fallback dictionary + `mergeGuestContent()` deep-merge that never throws on null/empty/malformed values

### Guest Web Provider (`apps/web/app/app/stay/components/GuestSettingsProvider.tsx`)
- Fetches `theme_mode`/`theme_config`/`content_config` from `hotels` on mount
- **Supabase Realtime** subscription on `hotels` table → admin publishes → guest UI updates live without refresh
- Injects CSS custom properties (`--gw-bg`, `--gw-surface`, `--gw-text`, `--gw-text-2`, `--gw-accent`, `--gw-border`) via `GuestThemeProvider`
- `useGuestContent()` hook supplies typed copy strings throughout the app

### Guest Web Pages Wired
All hardcoded text replaced with `useGuestContent()` values and `var(--gw-*)` CSS tokens:
- `stay/page.tsx` (landing hero) + `WelcomeCardClient.tsx` (welcome title, subtitle, room greeting, hero banner)
- `dining/page.tsx` + `FnBDiningFAB.tsx` (title, subtitle, call button label, notes placeholder)
- `spa/page.tsx` (title, subtitle)
- `requests/page.tsx` (title, subtitle)
- `dining/checkout/page.tsx` (instructions placeholder)
- `CallFrontDeskModal.tsx`, `PhoneCaptureModal.tsx` (theme tokens)

### Admin Branding Page (`/admin/branding`) — 4 tabs
- **Tab 1: Visual Theme** — preset swatch cards, custom color pickers (6 fields), live WCAG contrast indicators
- **Tab 2: Welcome & Landing** — welcome title, subtitle, room greeting prefix, hero banner
- **Tab 3: Sections & Modules** — dining, spa, requests, AI assistant, footer (all fields editable)
- **Tab 4: Live Preview** — phone-sized mockup rendering real theme colors + live copy + JSON payload inspector
- **Publish button** commits JSON payloads to Supabase → triggers guest web realtime update

## Validation
- `tsc --noEmit` → **0 errors** ✅
- Nav link added to admin layout sidebar

## ⚠️ Deploy step
After Vercel auto-redeploys:
1. Run Migration 24 SQL in Supabase SQL Editor
2. Go to `/admin/branding` → customize theme + content → **Publish Changes**
3. Open guest web → see live updates (no refresh needed)
