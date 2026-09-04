# Session: 2026-09-04 — Supabase Account Migration Guide

**Status**: **PENDING** — Blocked by Supabase maintenance window
**Date**: 2026-09-04
**Branch**: `main`

---

## Problem
Your current Supabase project (`https://bsjnlawhdgfilcfejbji.supabase.co`) has **exhausted free-tier egress limits**. This means:
- ❌ Cannot run `pg_dump` to export data
- ❌ Cannot download backups via direct connection
- ✅ Connection pooling (`pooler.supabase.com`) may still work (separate bandwidth limits)

## Goal
Migrate to a new Supabase account with fresh egress limits, preserving all existing data (rooms, hotels, staff users, requests, etc.).

---

## Step-by-Step Migration Guide

### Phase 1: Export Data from Old Project

**Option A: Try Connection Pooling (Recommended)**
1. Go to old Supabase Dashboard → **Settings → Database → Connection string**
2. Copy the **Connection Pooling** string (uses `pooler.supabase.com` — separate bandwidth limits)
3. Run from PowerShell:
   ```powershell
   # Install psql if needed, or use Supabase CLI
   psql "postgresql://postgres.[your-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" -f export.sql
   ```

**Option B: Download Backup (If Pooling Fails)**
1. Go to old Supabase Dashboard → **Settings → Database → Backups**
2. Download the latest `.sql` backup file (PITR or daily backup)
3. This includes full schema + all data

---

### Phase 2: Create New Supabase Account + Project

1. Go to [supabase.com](https://supabase.com) → **Sign up** with a **new email** (or use Google OAuth with a different account)
2. Create a new **Organization** (free tier)
3. Create a new **Project**:
   - Choose region closest to users (e.g., `ap-southeast-1` for Southeast Asia)
   - Set a strong **database password** (you'll need it for connection strings)
4. Wait for project to provision (~2 min)

---

### Phase 3: Import Data into New Project

1. Go to new project → **SQL Editor**
2. **First**, import the backup `.sql` file from Phase 1:
   - Paste contents into SQL Editor → **Run**
   - Or use connection string: `psql "postgresql://postgres:[password]@db.[new-ref].supabase.co:5432/postgres" < backup.sql`

3. **Then**, apply **all 24 migrations** in order (in case backup is incomplete):
   ```
   packages/supabase/migrations/
   ├── 00_base_schema.sql
   ├── 01_food_menu.sql
   ├── ...
   ├── 23_guest_live_call_toggle.sql
   └── 24_guest_web_theme_content_cms.sql
   ```
   Migrations use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, so running them on top of existing tables is safe.

4. **Verify** data:
   - Table Editor → check `hotels`, `rooms`, `food_menu`, `staff_users` have data

---

### Phase 4: Gather New Credentials

From new project → **Settings → API**:

| Credential | Where to find it |
|---|---|
| **Project URL** | `https://[new-ref].supabase.co` |
| **anon public key** | Settings → API → `anon` `public` |
| **service_role key** | Settings → API → `service_role` `secret` |

Write these down — you'll need them for Phase 5.

---

### Phase 5: Update Code Credentials

Give me the 3 values from Phase 4, and I'll update these 6 files:

| File | What changes |
|---|---|
| `apps/web/lib/supabase.ts` | `DEFAULT_SUPABASE_URL` + `DEFAULT_SUPABASE_KEY` |
| `apps/staff-app/lib/supabase.ts` | `DEFAULT_SUPABASE_URL` + `DEFAULT_SUPABASE_KEY` |
| `apps/staff-app/lib/foregroundService.ts` | `SUPABASE_URL` + `SUPABASE_KEY` |
| `apps/web/lib/webPush.ts` | hardcoded fallback URL |
| `apps/web/app/api/push/subscribe/route.ts` | hardcoded fallback URL |
| `apps/web/app/api/push/webhook/route.ts` | hardcoded fallback URL |

---

### Phase 6: Update External Services

You'll need to update these yourself:

| Where | What |
|---|---|
| **Vercel Dashboard** | Project → Settings → Environment Variables → update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → Redeploy |
| **apps/staff-app/.env** (local) | `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| **EAS credentials** | Run `eas credentials` to update env vars for OTA builds |
| **Firebase** | If you have FCM webhooks pointing to old Supabase URL, update those too |

---

### Phase 7: Apply Missing Migrations

After Vercel redeploys:
1. Go to new Supabase SQL Editor
2. Run Migration 23:
   ```sql
   ALTER TABLE notification_settings
     ADD COLUMN IF NOT EXISTS enable_guest_live_call BOOLEAN NOT NULL DEFAULT TRUE;
   ```
3. Run Migration 24:
   ```sql
   ALTER TABLE hotels
     ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'DARK_GOLD';
   ALTER TABLE hotels
     ADD COLUMN IF NOT EXISTS theme_config JSONB;
   ALTER TABLE hotels
     ADD COLUMN IF NOT EXISTS content_config JSONB;
   ```

---

### Phase 8: Verify

1. **Commit + push** → Vercel auto-redeploys with new Supabase credentials
2. **OTA push** for staff app: `eas update --branch preview`
3. **Test**:
   - QR scan a room → guest web loads ✅
   - Admin login → settings page works ✅
   - Staff app → login + receives orders ✅
   - Live voice call → connects ✅
   - Admin branding → can publish themes ✅

---

## Estimated Time
- Phase 1-3: 30-60 min (depending on backup size)
- Phase 4: 5 min
- Phase 5: 10 min (agent handles code updates)
- Phase 6: 15 min (manual Vercel/EAS updates)
- Phase 7-8: 15 min

**Total: ~1.5-2 hours**

---

## Rollback Plan
If anything goes wrong:
1. Keep the old Supabase project active (don't delete it yet)
2. Revert Vercel env vars to old credentials
3. Revert code changes in the 6 files
4. OTA push staff app back to old config

---

## Notes
- The old Supabase project (`bsjnlawhdgfilcfejbji.supabase.co`) should be kept active as a backup until the new one is fully verified
- Consider upgrading to Supabase Pro tier if you expect to hit egress limits again
- The connection pooler (`pooler.supabase.com`) has separate bandwidth limits from direct connections — use it for high-traffic endpoints
