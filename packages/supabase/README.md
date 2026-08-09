# Supabase Package

This package contains all Supabase database migrations and TypeScript type definitions for the Hotel QR Ordering System.

## Running Migrations

Migrations are ordered by phase prefix. Run them **in order** via the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql):

| File | Phase | Description |
|------|-------|-------------|
| `migrations/00_base_schema.sql` | Phase 0 | Core tables: hotels, rooms, guest_sessions + seed data |
| `migrations/01_requests.sql` | Phase 1 | Requests table for Call Front Desk |
| `migrations/02_spa.sql` | Phase 2 | Therapists, spa_slot_locks, catalog_items (SPA) |
| `migrations/03_fb.sql` | Phase 3 | F&B catalog extensions + order payloads |
| `migrations/04_tasks.sql` | Phase 4 | Task routing + SLA escalations |
| `migrations/05_analytics.sql` | Phase 5 | Audit logs + scheduled SLA breach triggers |

## How to Apply a Migration

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **SQL Editor**
4. Paste the contents of the migration file
5. Click **Run**

## Seed Data (Phase 0)

After running `00_base_schema.sql`, you'll have:
- **Hotel**: Grand Hotel (ID: `00000000-0000-0000-0000-000000000001`)
- **Room 302**: hash `secret-hash-302` (ID: `00000000-0000-0000-0000-000000000101`)
- **Room 101**: hash `secret-hash-101` (ID: `00000000-0000-0000-0000-000000000102`)

## Testing QR URL Verification

After the web app is running, visit:
```
http://localhost:3000/app/stay?room=00000000-0000-0000-0000-000000000101&hash=secret-hash-302
```
  run the server "pnpm dev:web" AND run the staff app "pnpm dev:staff" IN DIFFERENT TERMINAL
  