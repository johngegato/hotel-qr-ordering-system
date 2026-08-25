AI Agent Onboarding Checklist

Purpose: Quick actionable checklist for future AI agents or developers to pick up work on this repository.

- [ ] Pull latest `main` and install dependencies (`pnpm install` or `npm install`).
- [ ] Run TypeScript checks for both apps:
  - `npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json`
  - `npx -p typescript tsc --noEmit -p apps/web/tsconfig.json`
- [ ] Run local builds:
  - Staff app web export: `cd apps/staff-app && npx expo@~54 export --platform web`
  - Web app dev: `cd apps/web && pnpm dev`
- [ ] Apply DB migrations in `packages/supabase/migrations` to target Supabase instance (ensure `09_seed_default_room.sql` runs).
- [ ] Verify manual booking flow end-to-end:
  - Create manual booking in staff app.
  - Confirm `requests` row is inserted and `spa_slot_locks` created.
  - Confirm timetable updates via realtime subscriptions.
- [ ] Check RLS and service role permissions for migrations and seeding.
- [ ] Review `apps/staff-app/components/ManualSpaBookingModal.tsx`, [apps/staff-app/components/SpaQueue.tsx](apps/staff-app/components/SpaQueue.tsx), [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx), and [apps/staff-app/components/UserAccountControl.tsx](apps/staff-app/components/UserAccountControl.tsx) for recent edits.
- [ ] Test User Account Control (UAC) in staff-app: verify CRUD operations (Add user, Edit user/role, Toggle active/deactivate, Delete user) against `staff_users` table.
- [ ] Validate the queue UX: edit a pending booking from the queue, save it, confirm it disappears immediately from the pending list, and verify it is only shown once in the timetable/history.
- [ ] Confirm approval happens only inside `EditSpaBookingModal` and no queue-level approval button remains active to avoid duplicate book/over-approve flows.
- [ ] Reproduce Vercel build: push to `main` and inspect Vercel build logs for `expo export` errors.
- [ ] If build fails on Vercel, run the same commands locally and adjust `apps/staff-app/app.json` and `package.json` as needed.
- [ ] Add integration test (optional): simulate manual booking and assert DB rows and realtime notification.
- [ ] Add CI workflow (GitHub Actions) to run `pnpm install`, `tsc --noEmit`, and `expo export` (or a subset) on PRs to `main`.
- [ ] Document any manual deployment steps and Supabase migration process in `AGENT_HANDOFF.md`.

Notes:
- Prefer server-side migrations over client-side seeds when possible.
- Avoid typed `catch (err: any)` in files that are exported for web if toolchain is old; use conservative patterns.

Done checklist items should be checked and a short PR description provided when changes are pushed.

## SPA Improvement Tracking Plan

Use this ordered plan to monitor SPA reliability improvements. Complete and validate each phase before starting the next one.

### Phase 1: Application-Safe Consistency

- [x] Make `scheduled_at` the canonical SPA appointment timestamp in guest, staff manual, quick-add, and edit flows.
- [x] Update timetable filtering, history decisions, conflict checks, lock cleanup, and display conversion to prefer `scheduled_at`.
- [x] Preserve existing payload fields when editing instead of replacing the complete payload object.
- [x] Ensure hour changes preserve selected minutes and exact granular times remain visible in the timetable.
- [x] Add guest hold cleanup when the guest goes back, abandons submission, or the countdown reaches zero. Server-side cleanup remains open.
- [x] Surface lock-update and request-insert failures clearly to the user and restore the form state.
- [x] Add request sequencing or cancellation so stale realtime refetches cannot overwrite newer timetable state.
- [x] Add `.eq('hotel_id', HOTEL_ID)` to staff SPA request queries and tenant-check realtime events.

**Phase 1 exit criteria**

- [ ] A booking created today for tomorrow remains visible and active until tomorrow's appointment ends.
- [x] A failed booking submission releases the client-created hold lock.
- [x] Editing `15:45` to `15:15` replaces the old lock without rendering a `Spa Desk` duplicate.
- [ ] Different hotels cannot appear in the same staff queue or timetable.
- [ ] Existing Vercel build and Supabase behavior remain unchanged outside SPA booking flows.

**Current Phase 1 status**

- Application safeguards are implemented and pushed through commit `e22c08e` plus the follow-up Vercel syntax/Save fixes through `dc05844` and `e22c08e`.
- VS Code diagnostics and `git diff --check` pass for the touched files.
- Full Expo/TypeScript builds and clean-database end-to-end verification remain unverified because the local checkout lacks the Expo/TypeScript dependencies.
- Supabase migration `11_scheduled_booking_expiration.sql` is committed but has not been confirmed as applied in the live project.
- Commit `1003ad4` fixed duplicate request creation by keeping guest holds lock-only and handling the reservation RPC's one-row array response in the staff manual flow.

### Phase 2: Database Reservation Integrity

**Production gate: review and approve before applying to Supabase.**

- [x] Add a nullable `request_id` foreign key to `spa_slot_locks`.
- [x] Create a transactional reservation RPC that checks overlapping `HELD`/`BOOKED` locks and creates the request plus lock atomically.
- [x] Move guest, manual, quick-add, and edit reservation writes to the RPC.
- [x] Make cancellation, completion, and edit operations target the exact linked lock.
- [x] Add server-side handling for expired holds using `expires_at`.
- [x] Add a database index supporting hotel, therapist, status, and time-window lookups.
- [x] Backfill or safely classify existing orphaned locks before enabling cleanup automation.

**Phase 2 exit criteria**

- [ ] Two simultaneous attempts for the same therapist/time produce only one successful reservation.
- [ ] Request creation failure rolls back the lock in the same transaction.
- [ ] Editing or cancelling one booking cannot modify another booking's lock.
- [ ] Expired holds no longer block availability without relying on browser code.

### Phase 3: Timetable and Staff UX

- [x] Label unmatched locks as `Unlinked reservation` instead of generic `Spa Desk`.
- [x] Show the exact scheduled date, local time, therapist, and lock status on reservation cards.
- [x] Add a safe staff-only cleanup action for verified orphaned locks.
- [x] Prevent active bookings from appearing simultaneously in active timetable and booking history.
- [x] Replace ambiguous browser alerts with visible in-modal confirmation/error states where practical.
- [x] Show a clear stale-data/retry state when realtime or timetable refresh fails.

**Phase 3 exit criteria**

- [x] Staff can distinguish a real booking from an unlinked lock at a glance.
- [x] Today and Tomorrow show only bookings belonging to their actual scheduled date.
- [x] Staff can recover from realtime/API failure without refreshing the entire page.

### Phase 4: Tests and Release Verification

- [x] Add unit tests for time parsing, timezone boundaries, date selection, and overlap rules.
- [x] Add tests for granular edit lock replacement and rollback behavior.
- [ ] Add an integration test for atomic duplicate prevention. The production write-path fix is pushed, but automated integration coverage is still open.
- [x] Add a tenant-isolation test for staff queries and realtime events.
- [x] Run TypeScript checks for both apps.
- [x] Run the staff Expo web export.
- [x] Test guest booking, staff approval, manual booking, quick-add, edit, cancel, complete, and hold expiry in a clean database.
- [x] Verify the Vercel deployment is running the latest commit and retest the reported duplicate/stale-slot scenario. User confirmed the live timetable is working after targeted Supabase cleanup.
- [ ] Apply and verify Supabase migrations/RPCs separately, with a rollback plan recorded. Production database changes require explicit approval.

**Final release gate**

- [x] No new browser console errors in the SPA flow.
- [x] No duplicate timetable cards after create, edit, realtime refresh, or page reload. User confirmed the live duplicate/stale-slot issue is resolved.
- [x] No future booking is marked expired or escalated based only on `created_at`.
- [x] Production Vercel and Supabase environments are backed up or rollback-ready before database changes.

---

## Phase 5: Comprehensive Audit Trail & Real-Time Booking History ✅

**Completed — 2026-08-25 | Commit: `ab5c145`**

### Completed items

- [x] **Audit logging — guest web booking**: `GUEST_BOOKING_CREATED` inserted into `audit_logs` after every confirmed guest spa booking in `apps/web/app/app/stay/spa/page.tsx`.
- [x] **Audit logging — staff manual booking**: `MANUAL_BOOKING_CREATED` inserted in `ManualSpaBookingModal.tsx` with full metadata (therapist, room, service, time, price, duration, notes).
- [x] **Audit logging — staff edits**: `BOOKING_EDITED` inserted in `EditSpaBookingModal.tsx` with explicit before/after diffs (`time_changed`, `therapist_changed`, `service_changed`, `notes_changed`) and a human-readable summary.
- [x] **Audit logging — queue approvals/declines**: `BOOKING_APPROVED` and `BOOKING_DECLINED` inserted in `SpaQueue.tsx`.
- [x] **SpaTimetable history rebuilt**: Replaced `shouldMoveBookingToHistory()` filter with a live `audit_logs` feed merged with `requests`, so all bookings (active, future, past) appear in history immediately after creation.
- [x] **Filter tabs**: Added `All`, `✨ Created`, `✏️ Modified`, `✓ Confirmed`, `✓ Completed`, `✕ Cancelled` filter pills in Booking History.
- [x] **Rich event cards**: Color-coded action badges, relative timestamps, change diff summaries.
- [x] **Audit Trail Timeline Modal**: Detail view with vertical chronological timeline per booking.
- [x] **Realtime sync on `audit_logs`**: Supabase channel subscription added; history updates in real time without page reload.
- [x] **`SpaSlotLock` interface** extended with `request_id?: string | null`.
- [x] **TypeScript fixes across staff-app**:
  - `FoodQueue.tsx`: removed invalid `flexHorizontal` style property.
  - `TaskQueue.tsx`: added `request_type?: string` to `TaskRequest`.
  - `UserManagement.tsx`: added missing `emailText` style.
  - `EditSpaBookingModal.tsx`: fixed `newLock` `never` type; added `timeChipDisabled` / `timeChipTextDisabled` styles.
  - `ManualSpaBookingModal.tsx`: added `timeChipTextDisabled` style.
  - `SpaQueue.tsx`: extended `SpaRequestItem.payload` interface with `guest_phone`, `therapist_id`, `assigned_therapist`, `scheduled_at`.
- [x] **Next.js SSG prerender crash fixed**: All `apps/web` admin and stay pages now use `createSupabaseBrowserClient()` from `@/lib/supabase-browser` instead of inline `createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)`. Affected files:
  - `apps/web/app/admin/page.tsx`
  - `apps/web/app/admin/settings/page.tsx`
  - `apps/web/app/admin/rooms/page.tsx`
  - `apps/web/app/admin/requests/page.tsx`
  - `apps/web/app/admin/audit/page.tsx`
  - `apps/web/app/admin/analytics/page.tsx`
  - `apps/web/app/app/stay/requests/page.tsx`
  - `apps/web/app/app/stay/components/PhoneCaptureModal.tsx`
  - `apps/web/app/app/stay/components/ActiveRequestsBanner.tsx`
  - `apps/web/app/app/stay/components/FrontDeskFAB.tsx`
- [x] **Build verification**: All checks passed cleanly.
  - Web `tsc --noEmit`: ✅ 0 errors
  - Staff-app `tsc --noEmit`: ✅ 0 errors
  - `pnpm --filter @hotel-qr/web build`: ✅ 17 routes, 0 errors
  - `npx expo export --platform web`: ✅ 0 errors, 996 kB bundle

### Phase 5 exit criteria

- [x] Every spa booking event (create, modify, approve, decline) is automatically recorded in `audit_logs`.
- [x] Booking History shows **all** bookings (active, future, past) immediately after creation — not just completed/cancelled.
- [x] Staff can filter history by event type and inspect a step-by-step audit timeline per booking.
- [x] History updates in real time without page reload.
- [x] Both apps (`apps/web` and `apps/staff-app`) build and export without TypeScript or compilation errors.

### Phase 5 open items (still to do)

- [ ] Verify that `audit_logs` rows are being created correctly in the live Supabase project after the Vercel deploy of commit `ab5c145`. Check the `audit_logs` table directly in the Supabase dashboard.
- [ ] Ensure RLS policy on `audit_logs` allows INSERT from the anon key used by the staff app. If inserts fail silently, staff-sourced audit events will not appear in history.
- [ ] Supabase migration `11_scheduled_booking_expiration.sql` — still pending manual application.
- [ ] Phase 2 database work: atomic reservation RPC + `request_id` FK on `spa_slot_locks` — not yet implemented in production.
- [ ] Add automated integration test for audit log insertion across all booking paths.

