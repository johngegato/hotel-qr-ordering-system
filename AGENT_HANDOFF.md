# Agent Handoff — Hotel QR Ordering System

Summary of recent changes implemented by the agent (staff-app focus)

This document records the edits, fixes, and feature work performed during the current session. It is intended to help a human developer pick up where the agent left off.

Key goals
- Merge backup into repo (prefer repo files on conflicts).
- Fix spa booking flows: ensure staff manual bookings create `spa_slot_locks` and the master timetable shows guest bookings created on other days.
- Add `spa_slot_locks` insert on manual bookings and seed `DEFAULT_ROOM_ID`.
- Add pre-approval editing UI and a Call action in staff-app Spa Queue.
- Fix Expo/TS/web build issues (typed catches, haptics on web, undefined imports).

Files changed (high level)
- apps/staff-app/components/ManualSpaBookingModal.tsx
  - Rewrote `handleCreate()` to: ensure `DEFAULT_ROOM_ID` exists (seed-room check), insert into `requests` using selected room or seed, insert `spa_slot_locks` referencing the new request `id`, and insert `audit_logs`.

- apps/staff-app/components/EditSpaBookingModal.tsx
  - Added `confirmOnSave?: boolean` prop (default true). When false, saving updates the `payload` only and does not auto-confirm the request (used for pre-approval edits).
  - Added normalization to store `payload.room_number` as a raw value (strip `Room ` prefix) before saving.

- apps/staff-app/components/SpaTimetable.tsx
  - Improved `convertTo24Hour()` to parse ISO datetimes and multiple time formats.
  - Timetable fetch now prefers scheduled `payload.slot_time` when deciding whether a booking belongs to the selected day (not `created_at`).
  - Handles `spa_slot_locks` and `requests` realtime events.
  - Improved room derivation: prefers the joined `rooms.room_number` relation (handles both object and array shapes), with multiple payload fallbacks.
  - Adds `rawPayload` & `rawRequest` to booking entries and a dev-only `🔧 Payload` viewer for debugging.
  - Open edit modal derives `roomNumber` from `rawRequest` when booking shows placeholder.

- apps/staff-app/components/SpaQueue.tsx
  - Added Modify (opens `EditSpaBookingModal`) and Call (uses `Linking.openURL('tel:')`) buttons on pending spa request cards.
  - Final UI polish: compact action row fits inside card bounds without clipping; approve is no longer exposed directly outside the edit modal to avoid double-approval and duplicate-booking errors.
  - On successful save from the edit modal, the queue immediately removes the edited item from the pending list and refreshes the source data so the card disappears without waiting on the timetable.
  - Emits a client `spa:revalidate` event after approve/decline so the timetable can refetch as a fallback when realtime updates are missed.

- apps/staff-app/components/IncomingRequestAlert.tsx
  - Guarded `expo-haptics` calls on web (import `Platform` and call `Haptics.notificationAsync` only when not `Platform.OS === 'web'`) to avoid runtime errors in browser builds.
  - Derives and formats room display (handles `rooms` relation array/object shapes).

- apps/staff-app/components/DedicatedCallModule.tsx
  - Improved `handleUpdateStatus()` to check responses and restore state on failure (bugfix for optimistic updates).

- Other updates
  - Added migration `packages/supabase/migrations/09_seed_default_room.sql` to create the `DEFAULT_ROOM_ID` server-side (ensure seed room exists to satisfy FK constraints).
  - Added documentation files: `AGENT_HANDOFF.md` (this file), and previously `AI_AGENT_CHECKLIST.md`.

Why these changes
- Some manual bookings created by staff did not create `spa_slot_locks`, causing timetable inconsistency. Adding the insert ensures locks and requests remain in sync.
- Timetable previously filtered by `created_at`, which hid bookings scheduled for the day but created earlier. Using `payload.slot_time` fixes this.
- Browser build errors occurred because `expo-haptics` is not available on web and because component imports were missing; guarding and fixing imports removes runtime exceptions.
- Staff requested the ability to edit pending bookings before approving (pre-approval edits) and to call guests from the pending UI; the UI changes provide this flow and ensure edits are visible before approval.

How to test locally
1. Install dependencies in workspace root (pnpm / npm):

   ```bash
   pnpm install
   cd apps/staff-app
   pnpm install
   ```

2. Run the staff app in web dev (Expo/Next.js dev is environment-specific). If using Expo web export locally, ensure `expo` is installed in `apps/staff-app` node_modules.

3. Reproduce the flows:
   - Create a pending SPA booking (guest app or seed a `requests` row with `request_type='SPA_BOOKING'` and `status='PENDING'`).
   - In Staff → Spa Appointments → Pending Requests: click `Modify` to open `EditSpaBookingModal`. Change therapist/time and Save (pre-approval). Confirm the pending card updates.
   - Click `Approve & Confirm` (now enabled after modify). Verify the booking appears in the Spa Master Timetable at the expected slot and room.
   - Trigger an incoming request and confirm there are no Haptics errors in the browser console.

Files of interest (paths)
- `apps/staff-app/components/ManualSpaBookingModal.tsx`
- `apps/staff-app/components/EditSpaBookingModal.tsx`
- `apps/staff-app/components/SpaQueue.tsx`
- `apps/staff-app/components/SpaTimetable.tsx`
- `apps/staff-app/components/IncomingRequestAlert.tsx`
- `packages/supabase/migrations/09_seed_default_room.sql`

Commits pushed
- Multiple commits were pushed to `main` during the session; check git history for messages prefixed with `feat(staff-app):`, `fix(staff-app):`, or `chore(staff-app):`.

Remaining / recommended follow-ups
- Run full TypeScript checks and Expo export locally to verify no other build-time issues. Install `expo` in `apps/staff-app` if exporting to web.
- Consider making `room_number` canonical across clients (always write raw numeric room in `payload.room_number`) — I normalized on save in the modal, but other clients may still write different fields.
- Add server-side constraint or migration to normalize legacy `payload.room_number` values if needed.
- Add tests for timetable logic (unit tests parsing `slot_time`, `room` derivation) to prevent regressions.

If you want, I can also:
- Create a small script to scan existing `requests` rows and patch `payload.room_number` to the canonical raw value when possible.
- Add an environment-controlled toggle to show the raw payload JSON in production for a short debugging window.

Contact & Handoff
- If something is still failing, paste the raw request object (from the timetable dev payload viewer or the console) and I will map exact fields to UI.

---
Generated by the agent during an interactive session. Use this file as the primary handoff document.
**Agent Handoff**

Purpose: Provide a concise handoff for a new AI agent or developer to continue work on this repository, including structure, recent changes, run instructions, and recommended next steps.

**Repository Structure (high level)**
- **apps/staff-app**: Expo/React Native staff application (web + native). Key components: [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx), [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx).
- **apps/web**: Next.js front-end (app router).
- **packages/supabase**: SQL migrations and DB types. Migrations live under [packages/supabase/migrations](packages/supabase/migrations).

**Recent changes (what was modified and why)**
- [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx): Fixed syntax/brace imbalance; rewrote `handleCreate` to reliably seed a `DEFAULT_ROOM_ID`, insert `requests`, create `spa_slot_locks`, and add audit logs. Removed fragile catch/type patterns that broke web export.
- [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx): Timetable parsing and realtime subscription fixes so bookings display correctly using `payload.slot_time` and explicit realtime handlers.
- [apps/staff-app/components/EditSpaBookingModal.tsx](apps/staff-app/components/EditSpaBookingModal.tsx): Safer error handling and compatibility fixes for web export.
- [apps/staff-app/app.json](apps/staff-app/app.json): Added `platforms` to support web export.
- [apps/staff-app/package.json](apps/staff-app/package.json): Pin/adjusted `build:web` script for `expo export` compatibility.
- [packages/supabase/migrations/09_seed_default_room.sql](packages/supabase/migrations/09_seed_default_room.sql): Server-side seed to ensure `DEFAULT_ROOM_ID` exists (run this migration in your Supabase instance).

**Key concepts & constraints**
- The `requests.room_id` column has a foreign-key constraint to `rooms.id`; missing seed causes HTTP 409 when inserting requests. Server migration + client-side seed guard were added to avoid this.
- Staff manual bookings must create a `spa_slot_locks` row so the timetable and other systems see the booking immediately.
- Expo web export historically failed due to typed `catch (err: any)` or optional chaining inside `catch`. Use plain `catch (err)` or ensure transpiler supports typed catch in your toolchain. We rewrote code to avoid fragile patterns.

**How to run locally (developer steps)**
1. Install dependencies (workspace root):

```bash
pnpm install    # or npm install
```

2. Staff app TypeScript check:

```bash
npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json
```

3. Expo web export (run from staff app):

```bash
cd apps/staff-app
npx expo@~54 export --platform web
```

4. Next.js web dev:

```bash
cd apps/web
pnpm dev
```

**Database / Supabase notes**
- Migrations live in [packages/supabase/migrations](packages/supabase/migrations). Apply them in your Supabase project; specifically run `09_seed_default_room.sql` to ensure `DEFAULT_ROOM_ID` exists.
- Realtime behavior: `spa_slot_locks` and `requests` are used by the staff-app timetable; ensure RLS policies allow service-role inserts during migrations or use admin credentials for seeding.

**Vercel / Deployment notes**
- Vercel will install dependencies and run the configured build. After pushing to `main` the site should trigger a new deploy. If web export fails on Vercel, confirm `apps/staff-app/app.json` contains `platforms` and that `expo` is resolved via the lockfile.

**Coding conventions & AI guidance**
- Prefer minimal, focused edits. Fix root cause rather than quick hacks.
- When modifying code that runs during build/export, avoid typed catch bindings or optional chaining inside `catch` if the build toolchain is older — use conservative patterns for compatibility.
- Prefer server-side migrations for persistent data (like `DEFAULT_ROOM_ID`) rather than only client-side seeding.
- When resolving merge conflicts, prefer the existing repo version if unsure, but include comments explaining non-obvious choices.

**Files to review first (entry points for new agent)**
- [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx)
- [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx)
- [packages/supabase/migrations/](packages/supabase/migrations)
- [apps/staff-app/package.json](apps/staff-app/package.json)

**Immediate next tasks (recommended)**
- Run the full test/build cycle on your machine or CI: install deps, run `tsc`, run `expo export`, and verify Vercel deploy logs. (Priority: confirm build passes.)
- Apply `09_seed_default_room.sql` to Supabase to avoid FK 409 errors in production.
- Add a lightweight e2e or integration test for manual booking flow that verifies `requests` insert and `spa_slot_locks` creation.
- Check the live staff app against the browser scenario: edit a pending booking from the queue, save, confirm it disappears from pending queue instantly, and verify it appears in the timetable/history only once.
- Review any outstanding worktree changes before a larger repo-wide cleanup, especially unrelated modified files like `context.md` or migration scripts.

**Contact & context**
- Commits with recent fixes were pushed to `main` (latest includes the ManualSpaBookingModal fix). Check commit history for details.

---
If you want, I can:
- commit this handoff file to the repo and push it, and
- create small follow-up tasks (tests or CI adjustments).

## SPA Module Architecture and Data Flow Review

### End-to-end booking flow

1. **Guest selects a service and time**
  - `apps/web/app/app/stay/spa/page.tsx` loads available `catalog_items` and active `spa_slot_locks`.
  - The guest selects one of six hard-coded time labels for today. `getSlotWindow()` converts the label into a local browser `Date`; if that time has passed, it silently moves the appointment to tomorrow.
  - `handleSelectSlot()` immediately inserts a `HELD` lock for ten minutes. The guest-side lock does not include a `therapist_id` or `request_id`.

2. **Guest submits intake and contact details**
  - `executeConfirmBooking()` inserts a `requests` row with `request_type = 'SPA_BOOKING'` and status `PENDING` or `PENDING_ON_CALL`.
  - The request payload contains service, time, room, price, duration, notes, phone, and `scheduled_at`.
  - The guest subscribes to request status changes. The hold lock is then changed from `HELD` to `BOOKED`; errors from this update are currently not surfaced to the guest.

3. **Staff queue receives the request**
  - `apps/staff-app/components/SpaQueue.tsx` fetches pending SPA requests and subscribes to all request realtime events.
  - Staff can edit, call, or cancel. Editing opens `EditSpaBookingModal`; the modal performs the confirmation path and writes a therapist lock before updating the request.
  - The queue’s direct status handler updates `requests` only. Any future caller of that handler for confirmation would need a lock transaction as well.

4. **Staff manual or quick-add booking**
  - `apps/staff-app/components/ManualSpaBookingModal.tsx` loads services and therapists, checks active locks, and gathers room, service, therapist, time, and notes.
  - Quick-add is launched from an empty timetable cell by `SpaTimetable.handleQuickAdd()`. It carries the selected therapist and Today/Tomorrow day into the modal.
  - The modal creates a `BOOKED` lock first, inserts a confirmed `requests` row second, and removes the lock if the request insert fails.

5. **Timetable builds its display model**
  - `apps/staff-app/components/SpaTimetable.tsx` loads active requests, history candidates, and active locks, then combines them into `BookingSlot[]`.
  - Requests render as real booking cards. Locks that cannot be matched to a request render as `Spa Desk / Slot Reserved` cards.
  - Realtime INSERT, UPDATE, and DELETE events for both `requests` and `spa_slot_locks` trigger a complete refetch. A browser-only `spa:revalidate` event is an additional fallback.

6. **Completion, cancellation, and expiry**
  - Timetable cancellation changes the request to `CANCELLED` and releases an overlapping therapist lock.
  - History completion changes the request to `RESOLVED` and releases the lock.
  - Timetable fetch marks old active locks as `EXPIRED` when `end_time < NOW()`.
  - The Supabase `check_sla_breaches()` function originally used `created_at`; migration `11_scheduled_booking_expiration.sql` uses payload `scheduled_at` plus duration for new rows and retains a legacy fallback for old rows. This migration must be applied to the live Supabase project separately from Vercel deployment.

### Confirmed edge cases and risks

- **High: no atomic reservation.** Availability is checked with SELECT, then a lock is inserted separately. Two clients can pass the check simultaneously. The current UI checks reduce normal collisions, but only a database exclusion constraint or transactional RPC can guarantee uniqueness under concurrency. This requires an explicitly reviewed Supabase migration/RPC.
- **High: locks are not linked to requests.** `spa_slot_locks` has `session_id` but no `request_id`. Staff cannot reliably identify which lock belongs to which booking, so orphaned locks appear as `Spa Desk`, and cleanup can target the wrong row. A production schema change should add a nullable request reference or use a reservation RPC.
- **High: guest holds can become orphaned.** Going back, abandoning the page, timing out, or failing request creation does not consistently cancel/delete the held lock. The ten-minute client countdown is only UI state; it is not a server-side cleanup guarantee.
- **High: guest availability is not therapist-aware.** Guest-created locks omit `therapist_id`, while staff availability is therapist-based. This makes a guest hold either invisible to therapist conflict checks or visible only as an unassigned `Spa Desk` reservation.
- **Medium: date and timezone ambiguity.** Most staff flows store a time plus a locally generated timestamp. The timetable still derives the selected day from `slot_time` in several places instead of preferring `scheduled_at`; a booking for tomorrow can therefore appear under the wrong day in some paths. Browser timezone and Supabase UTC conversion can also shift the displayed day.
- **Medium: stale edit lock selection.** The edit modal identifies the old lock by overlapping time and therapist rather than a request reference. Similar adjacent bookings or changed service duration can make that heuristic ambiguous.
- **Medium: payload replacement can lose fields.** `EditSpaBookingModal` writes a new payload object. Existing intake fields or future payload keys can disappear unless every field is copied forward or updates merge the old payload.
- **Medium: realtime refetch races.** Every realtime event starts a full fetch without cancellation or request sequencing. A slower older fetch can overwrite newer state, and simultaneous lock/request events can briefly show duplicate or missing cards.
- **Medium: queue tenant isolation.** `SpaQueue` queries and realtime handling do not consistently filter by `HOTEL_ID`. In a multi-property deployment, staff could receive another hotel’s SPA requests if RLS does not fully enforce isolation.
- **Low: hard-coded time UX.** Guest time choices are fixed to six labels and the guest page says “Today,” while staff supports granular minutes and Today/Tomorrow. The two clients can represent the same booking differently and cannot offer a general future date.
- **Low: history duplication.** `shouldMoveBookingToHistory()` treats guest/manual payloads as history candidates independently of appointment completion, so an active booking can be eligible for both the active timetable and history views.

### State-management and UX findings

- The guest hold countdown is not authoritative and can continue displaying a held slot after the database lock has expired.
- Guest service/time state is not reset centrally after completion or a failed submission; returning to the flow can retain stale selection state.
- The staff conflict map is calculated asynchronously and save can occur before the latest check completes. The final write-time check is still necessary and should be authoritative.
- Manual and edit forms now preserve granular minutes, but the timetable grid groups cards by hour. A `15:15` booking is rendered in the `15:00` row, which is acceptable only if the card’s exact time remains prominent.
- Cancel actions use `Alert` confirmation on native/web. This is functional but less predictable in the embedded browser than an in-modal confirmation state.
- Orphaned locks are intentionally shown for visibility, but `Spa Desk` is confusing to staff unless the UI labels them as an unlinked reservation and provides a safe cleanup workflow.

### Recommended order of future hardening

1. Apply and verify migration `11_scheduled_booking_expiration.sql` in Supabase; test a future booking against the live scheduled timestamp behavior.
2. Add a server-side reservation RPC that checks overlap and creates/updates the lock and request in one transaction.
3. Add `request_id` to `spa_slot_locks` or equivalent durable linkage, then make edit/cancel/complete operations target the exact lock.
4. Store an explicit scheduled timestamp/date in every client and make timetable filtering, expiry, history, and lock cleanup use it consistently.
5. Add cleanup on guest back/timeout/failure and verify held-lock expiry server-side.
6. Scope every staff query and realtime subscription by hotel, then add tests for cross-hotel isolation.
7. Add focused tests for time parsing, timezone/day boundaries, overlap rules, lock replacement, rollback, and duplicate realtime events.
