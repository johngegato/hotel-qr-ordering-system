# Session: 2026-09-04 — Admin Toggle for Guest Live Voice Call Button

**Branch**: `main`
**Date**: 2026-09-04

---

## Objective
Give the admin a switch at `/admin/settings` to hide or show the "🎤 Live Voice Call" button in the guest web Front Desk modal (`CallFrontDeskModal.tsx`), without affecting direct dial or staff callback options.

## Changes

### Database (Migration 23)
- `packages/supabase/migrations/23_guest_live_call_toggle.sql` & `apps/web/supabase/migrations/23_guest_live_call_toggle.sql`:
  - `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS enable_guest_live_call BOOLEAN NOT NULL DEFAULT TRUE` + backfill.
  - Default TRUE → no behavior change for the live guest portal until the admin flips the toggle.
  - ⚠️ Must be applied manually to the hosted Supabase project (SQL editor) — not auto-applied by Vercel.

### Types
- `packages/supabase/types/index.ts`: added `enable_guest_live_call?: boolean` to `NotificationSettings`.
- `apps/staff-app/lib/notifications.ts`: mirrored optional field in local `NotificationSettings` interface (no staff-app logic change).

### Admin Web (`apps/web/app/admin/settings/page.tsx`)
- New `guestLiveCallEnabled` state, loaded from `notification_settings` alongside the other alarm controls.
- New "🎤 Guest Live Voice Call Button" toggle card inside "Staff Push & Alarm Controls" (same styled-switch pattern as Function Room Reminders / Loud Audio Alarm).
- Persisted in the existing `notification_settings` upsert (`onConflict: 'hotel_id'`) and included in the `audit_logs` details as `guest_live_call_enabled`.

### Guest Web (`apps/web/app/app/stay/components/CallFrontDeskModal.tsx`)
- Fetches `enable_guest_live_call` from `notification_settings` when the modal opens (`maybeSingle`, fail-safe default = visible).
- Live Voice Call CTA is rendered only when the flag is true; `handleLiveVoiceCall` also guards with an early return when disabled.
- Covers both entry points automatically (welcome card quick-action + `FrontDeskFAB`), since both render this modal.

## Verification
- `apps/web`: `tsc --noEmit` → 0 errors.
- `apps/staff-app`: `tsc --noEmit` → 0 errors (type-only touch; no OTA push or APK rebuild needed).

## Deployment Notes
- Web-only change → Vercel auto-redeploys on push to `main`.
- After deploy: run Migration 23 SQL on the live Supabase project, then toggle in `/admin/settings` → Save Settings.
- No `app.json`, `eas.json`, env var, or native config changes.
