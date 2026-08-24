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
- [ ] Review `apps/staff-app/components/ManualSpaBookingModal.tsx`, [apps/staff-app/components/SpaQueue.tsx](apps/staff-app/components/SpaQueue.tsx), and [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx) for recent edits.
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

- [ ] Make `scheduled_at` the canonical SPA appointment timestamp in guest, staff manual, quick-add, and edit flows.
- [ ] Update timetable filtering, history decisions, conflict checks, lock cleanup, and display conversion to prefer `scheduled_at`.
- [x] Preserve existing payload fields when editing instead of replacing the complete payload object.
- [x] Ensure hour changes preserve selected minutes and exact granular times remain visible in the timetable.
- [x] Add guest hold cleanup when the guest goes back, changes slot, abandons submission, or the countdown reaches zero.
- [x] Surface lock-update and request-insert failures clearly to the user and restore the form state.
- [x] Add request sequencing or cancellation so stale realtime refetches cannot overwrite newer timetable state.
- [x] Add `.eq('hotel_id', HOTEL_ID)` to staff SPA request queries and tenant-check realtime events.

**Phase 1 exit criteria**

- [ ] A booking created today for tomorrow remains visible and active until tomorrow's appointment ends.
- [ ] A failed booking submission leaves no active orphaned hold lock.
- [ ] Editing `15:45` to `15:15` leaves one booking and one valid lock, with no `Spa Desk` duplicate.
- [ ] Different hotels cannot appear in the same staff queue or timetable.
- [ ] Existing Vercel build and Supabase behavior remain unchanged outside SPA booking flows.

### Phase 2: Database Reservation Integrity

**Production gate: review and approve before applying to Supabase.**

- [ ] Add a nullable `request_id` foreign key to `spa_slot_locks`.
- [ ] Create a transactional reservation RPC that checks overlapping `HELD`/`BOOKED` locks and creates the request plus lock atomically.
- [ ] Move guest, manual, quick-add, and edit reservation writes to the RPC.
- [ ] Make cancellation, completion, and edit operations target the exact linked lock.
- [ ] Add server-side handling for expired holds using `expires_at`.
- [ ] Add a database index supporting hotel, therapist, status, and time-window lookups.
- [ ] Backfill or safely classify existing orphaned locks before enabling cleanup automation.

**Phase 2 exit criteria**

- [ ] Two simultaneous attempts for the same therapist/time produce only one successful reservation.
- [ ] Request creation failure rolls back the lock in the same transaction.
- [ ] Editing or cancelling one booking cannot modify another booking's lock.
- [ ] Expired holds no longer block availability without relying on browser code.

### Phase 3: Timetable and Staff UX

- [ ] Label unmatched locks as `Unlinked reservation` instead of generic `Spa Desk`.
- [ ] Show the exact scheduled date, local time, therapist, and lock status on reservation cards.
- [ ] Add a safe staff-only cleanup action for verified orphaned locks.
- [ ] Prevent active bookings from appearing simultaneously in active timetable and booking history.
- [ ] Replace ambiguous browser alerts with visible in-modal confirmation/error states where practical.
- [ ] Show a clear stale-data/retry state when realtime or timetable refresh fails.

**Phase 3 exit criteria**

- [ ] Staff can distinguish a real booking from an unlinked lock at a glance.
- [ ] Today and Tomorrow show only bookings belonging to their actual scheduled date.
- [ ] Staff can recover from realtime/API failure without refreshing the entire page.

### Phase 4: Tests and Release Verification

- [ ] Add unit tests for time parsing, timezone boundaries, date selection, and overlap rules.
- [ ] Add tests for granular edit lock replacement and rollback behavior.
- [ ] Add an integration test for atomic duplicate prevention.
- [ ] Add a tenant-isolation test for staff queries and realtime events.
- [ ] Run TypeScript checks for both apps.
- [ ] Run the staff Expo web export.
- [ ] Test guest booking, staff approval, manual booking, quick-add, edit, cancel, complete, and hold expiry in a clean database.
- [ ] Verify the Vercel deployment after pushing application changes.
- [ ] Apply and verify Supabase migrations/RPCs separately, with a rollback plan recorded.

**Final release gate**

- [ ] No new browser console errors in the SPA flow.
- [ ] No duplicate timetable cards after create, edit, realtime refresh, or page reload.
- [ ] No future booking is marked expired or escalated based only on `created_at`.
- [ ] Production Vercel and Supabase environments are backed up or rollback-ready before database changes.
