# Session: 2026-09-04 — Guest QR Access Resilience Fix

**Branch**: `main`
**Date**: 2026-09-04
**Commit**: `4e4bc4e`

---

## Problem
After deploying the Dynamic Theme CMS (migration 24), **all guest QR scans showed "Invalid QR Code"** — even for valid rooms. Root cause: the production Supabase database didn't have the new `theme_mode`, `theme_config`, `content_config` columns on the `hotels` table (migration 24 not yet applied), causing PostgREST to throw error `42703: column hotels.theme_mode does not exist`.

The old `stay/page.tsx` selected those columns in the room validation query:
```typescript
.select('id, room_number, floor, room_type, is_active, hotel_id, hotels(name, phone, logo_url, color_scheme, theme_mode, theme_config, content_config)')
```
When the columns didn't exist, the entire query failed, and the code incorrectly treated it as an invalid QR code.

## Diagnosis
Queried live Supabase via REST API:
- ✅ 8 rooms exist and are active (101, 102, 103, 104, 105, 106, 202, 305)
- ❌ `hotels.theme_mode` column missing — `42703` error
- ❌ `notification_settings.enable_guest_live_call` missing (migration 23 also not applied)

## Fix
Split the query into two steps in `apps/web/app/app/stay/page.tsx`:

1. **Room validation** — only uses base columns that always exist:
   ```typescript
   .select('id, room_number, floor, room_type, is_active, hotel_id, hotels(name, phone, logo_url, color_scheme)')
   ```

2. **Theme fetch** — separate `try/catch` that gracefully falls back to DARK_GOLD defaults if columns don't exist:
   ```typescript
   try {
     const { data: hotelTheme } = await supabase
       .from('hotels')
       .select('theme_mode, theme_config, content_config')
       .eq('id', room.hotel_id)
       .maybeSingle()
     // ...
   } catch (e) {
     console.warn('[StayPage] Theme columns not available, using defaults:', (e as Error)?.message)
   }
   ```

## Result
- ✅ QR codes work again **without applying migration 24**
- ✅ Guest web shows DARK_GOLD defaults when theme columns missing
- ✅ Admin branding page can publish themes once migration 24 is applied
- ✅ No more "Invalid QR Code" false positives

## Verification
- Tested with live room 101 (`7c0e6797-...` + `secret-hash-c4ghmci`) — now loads Welcome card instead of error
- `tsc --noEmit` → **0 errors** ✅

## Pending
Migrations 23 + 24 still need to be applied to production Supabase for full functionality (theme customization, live call toggle). See `2026-09-04_supabase-account-migration-guide.md`.
