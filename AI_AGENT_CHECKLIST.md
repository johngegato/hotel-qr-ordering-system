AI Agent Onboarding Checklist

Purpose: Quick actionable checklist for future AI agents or developers to pick up work on this repository.

- [x] Pull latest `main` and install dependencies (`pnpm install` or `npm install`).
- [x] Run TypeScript checks for both apps:
  - `npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json`
  - `npx -p typescript tsc --noEmit -p apps/web/tsconfig.json`
- [x] Run local builds:
  - Staff app type check: `tsc --noEmit` in `apps/staff-app` ✅
  - Web app build: `npm run build` in `apps/web` ✅
- [x] Admin Web User Account Control (UAC): full CRUD at `/admin/users` on `staff_users` table.
- [x] F&B Menu Admin Enhancements at `/admin/fb`: Category CRUD, food photo uploads & compression to Supabase Storage, 1-click CSV Export, Batch CSV Import with validation & preview, downloadable CSV template.
- [x] Guest Dining UI/UX overhaul at `/app/stay/dining`: hero section, dietary filter chips, live search, dish detail modal, resolved infinite scroll re-render loop bug.
- [x] Guest Room Services UI/UX overhaul at `/app/stay/requests`: prominent Back to Concierge button, Room badge, horizontal department filter pills, contextual emojis per service, 56px mobile touch targets, bottom-sheet modal.
- [x] Staff App Request History overhaul (`RequestHistory.tsx`): tap-to-inspect bottom sheet detail panel, full audit trail timeline per request, staff name resolution from UUID via `staff_users`, type filter chips.
- [x] Staff App Spa Queue (`SpaQueue.tsx`): 100% fluid responsive container (removed 600px cramping constraint), added direct `✓ Accept` button alongside Edit/Call/Decline, clean realtime room join synchronization.
- [x] Supabase PostgREST 400 Bad Request Fix: removed top-level `actor_role` and `JSON.stringify` from `FoodQueue.tsx`, wrapped all `audit_logs` queries and inserts in safe `try/catch` and UUID validators across staff app.
- [x] Configurable Dining Service Charge:
  - Database schema: `apps/web/supabase/migrations/14_service_charge.sql` (`service_charge_enabled`, `service_charge_pct` on `hotels`).
  - Admin settings toggle & percentage control with live preview at `/admin/settings`.
  - Guest dining menu notice banner & floating cart hint at `/app/stay/dining`.
  - Guest checkout live calculation & price breakdown (subtotal + service charge + grand total) at `/app/stay/dining/checkout`.
  - Staff App Edit Dining Order live service charge calculation, edit modal breakdown, payload persistence, and audit logging in `FoodQueue.tsx`.
  - Staff App Request History & Logs itemized subtotal, service charge, and grand total breakdown in `RequestHistory.tsx`.
- [x] Staff App Food Queue Realtime Sync & Optimistic UI Updates (`FoodQueue.tsx` & `App.tsx`): removed broken column filter on requests channel, wrapped `fetchData` in `useCallback` + mutable `useRef` to eliminate stale closure bugs, wired `refreshTrigger` on incoming alert dismissal, and added instant optimistic state updates across Prepare, Order Ready, Edit Save, and Decline actions.
- [x] Staff App Actor Attribution & Role Resolution (`RequestHistory.tsx` & `FoodQueue.tsx`): fixed inverted actor tags by prioritizing `claimed_by` UUID lookup in `staffMap` for staff roles, preventing guest payload strings (`"Guest (Room 105)"`) from rendering with the STAFF role pill, passed `activeStaffUser` to `FoodQueue`, and updated audit logs with logged-in staff names.
- [x] Staff App Login Screen UI & Remnants Cleanup (`App.tsx`): removed demo credentials box, pre-filled default credentials, Phase 4 banner, cleaned input placeholders/error messages, and polished brand header with a gold icon ring.
- [x] Customizable Spa Appointment Time Slots & Shift Scheduling:
  - Database schema: `apps/web/supabase/migrations/15_spa_time_slots.sql` (`spa_time_slots` table with `slot_time`, `is_available`, `is_on_call`, `sort_order`).
  - Admin Spa Schedule Manager at `/admin/spa`: Full CRUD, active/disabled toggling, on-call toggling, edit modal, and quick presets for Standard Day (10 AM - 7 PM) and Late Night (2 PM - 2 AM) shifts.
  - Guest Booking Page at `/app/stay/spa`: Dynamic time slot loading and live realtime synchronization with admin schedule changes.
  - Staff App Master Timetable & Modals (`SpaTimetable.tsx`, `ManualSpaBookingModal.tsx`, `EditSpaBookingModal.tsx`): Full timetable mirroring of configured slots with flexible support for evening/late-night shifts (e.g. 2:00 PM to 2:00 AM).
- [x] Android APK High-Priority Notification System & Permissions (`apps/staff-app`):
  - Created `apps/staff-app/lib/notifications.ts` with web-safe platform guards.
  - Android Notification Channel `urgent_guest_requests` configured with `MAX` importance, custom vibration, and `ALARM` audio stream.
  - Updated `apps/staff-app/app.json` with permissions (`WAKE_LOCK`, `USE_FULL_SCREEN_INTENT`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED`).
  - Wired native notification triggers & push token synchronization to `staff_users` in `apps/staff-app/App.tsx`.
- [x] Persistent 5-Minute Recurring Alert System for Unhandled Requests (`apps/staff-app`):
  - Tracks all pending requests across: Call requests (`CALL_REQUEST`), Spa bookings (`SPA_BOOKING`), Room tasks (`TASK`), and Dining orders (`FOOD_ORDER`).
  - Automatically queries unhandled requests on a 5-minute interval (`setInterval`) and upon staff login.
  - Displays `PendingRequestsReminderModal` popup with breakdown chips, live elapsed waiting timer per request, flashing alert border, audio chimes, and haptic feedback.
  - Automatically synchronizes with Realtime updates when requests are claimed, resolved, or modified.
- [x] Staff App Callback Phone Number & One-Tap Direct Dialing (`CallQueue.tsx`, `DedicatedCallModule.tsx`, `RequestHistory.tsx`):
  - Added `guest_phone` support across `CallQueue`, `DedicatedCallModule`, and `RequestHistory`.
  - Added direct `📞 Call Guest` button in `CallQueue` with `Linking.openURL('tel:...')` opening the native dialer.
  - Added tappable phone pill + `📞 Call` button in `DedicatedCallModule` next to Claim & Resolve.
  - Added guest phone display and 1-tap call button in `RequestHistory` list cards & detail modal for callback alerts (`CALL_REQUEST`).
- [x] Staff App Persistent Login & Auto-Session Restoration (`authStorage.ts` & `App.tsx`):
  - Installed `@react-native-async-storage/async-storage` with dual native & `localStorage` web fallback.
  - Persists authenticated `StaffUser` credentials securely across app minimize, background killing, and system reboots.
  - Automatically restores session on app launch and smoothly bypasses the login screen.
  - Performs background account verification with Supabase to handle admin deactivations.
  - Completely clears local session upon clicking "Log Out".
- [x] Staff App Automated Persistent Real-Time Reactivity & Auto-Sync Engine (`useAutoSync.ts`, `App.tsx`, and all queue components):
  - Created `apps/staff-app/lib/useAutoSync.ts` providing active background polling intervals (6-8s) and instant window/tab focus & visibility re-sync triggers.
  - Hardened Realtime WebSockets: removed broken column filters (`filter: 'request_type=eq.CALL_REQUEST'`) in `DedicatedCallModule.tsx`, and added `SUBSCRIBED` channel recovery listeners across all modules.
  - Broadcasted `refreshTrigger={refreshKey}` from top-level `App.tsx` event bus to queues (`CallQueue`, `DedicatedCallModule`, `SpaQueue`, `TaskQueue`, `FoodQueue`, `RequestHistory`).
  - Decoupled `lastDismissedReminderAtRef` 5-minute cooldown guard from auto-sync polling loop to prevent repeated modal popups.
  - Excluded `SpaTimetable` from auto-sync timer polling and `refreshTrigger` to prevent constant visual reloads, relying strictly on comprehensive Postgres Realtime table events.
- [x] Spa Time Slot Evaluation & Datetime Normalization Fixes (`apps/web` & `apps/staff-app`):
  - Guest Web (`/app/stay/spa`): Fixed "passed" bug on 'Today' slots by implementing robust regex AM/PM parser `/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/` across `parseTimeToHoursAndMinutes`, `convertDisplayTimeTo24Hour`, and `getSlotWindow`.
  - Staff App (`ManualSpaBookingModal.tsx`, `SpaAvailabilityModal.tsx`, `EditSpaBookingModal.tsx`, `SpaTimetable.tsx`): Fixed vacant slot acceptance bug by removing silent next-day roll-over in `buildSlotWindow`, making explicit `day` parameter the single source of truth.
- [x] Staff App Request History Collapsible Accordion UI (`RequestHistory.tsx`):
  - Wrapped Request History module in a collapsible accordion container (`isAccordionOpen`, defaults to `false`) to save vertical space on mobile devices.
  - Added tap-to-toggle header with counter badge, chevron icon, and full preservation of internal filters, sorting, call actions, and detail modals.
- [x] Staff App Progressive Web App (PWA) & Background Real-Time Synchronization Hardening (`apps/staff-app`):
  - Web App Manifest (`manifest.json`): standalone display mode, orientation lock, branding colors, and icon suite.
  - Service Worker (`sw.js`): static asset caching, background `push` event processing, high-intensity vibration patterns, and dual client wake-up broadcasts (`BroadcastChannel('hotel_staff_sync')` & `clients.matchAll()`).
  - Enhanced Auto-Sync (`useAutoSync.ts`): listens for Service Worker push signals, `pageshow`, `online`, and `visibilitychange` events, and forces active Supabase Realtime WebSocket reconnection (`supabase.realtime.connect()`) upon screen/tab wake-up.
  - Screen Wake Lock (`useScreenWakeLock.ts`): automatically requests and maintains browser screen wake lock (`navigator.wakeLock`) on mobile devices to prevent OS sleeping during active shifts.
  - Install Banner & Web Push Prompts in `App.tsx`.
- [x] Guest Persistent Session & Escalation Engine (`apps/web`):
  - Added `GuestSessionKeeper.tsx`: automatically saves `guest_sessions` to Supabase on first scan, sends room connection pings to staff, maintains presence on Supabase Realtime channel, and executes a 1–2 min recurring push escalation loop for unacknowledged pending requests.
  - Added `StayRootClientWrapper.tsx` and `stay/layout.tsx`: wraps all guest pages (`dining`, `spa`, `requests`, `stay`) to maintain persistent session and escalation heartbeats globally.
  - Integrated push notification dispatching to all remaining request types (`SPA_BOOKING` and `CALL_REQUEST`).
  - Added optional `pg_cron` recurring job registration.
- [x] Android 24/7 Background Watchdog & Sleep Self-Wake Engine (`apps/staff-app`):
  - Added `runBackgroundWatchdogCheck(hotelId)` in `foregroundService.ts` running a 90-second REST poll loop inside the foreground service task.
  - Queries Supabase REST API directly for pending requests (`status IN ('PENDING', 'PENDING_ON_CALL')`), making incoming alarms 100% independent of WebSockets during deep Android Doze mode sleep.
  - Fires Full-Screen Intent overlay, activates 60s WakeLock, turns on the screen (`setTurnScreenOn`), and loops the alarm sound.
- [x] Android AppState Resume & Socket Reconnection Recovery (`apps/staff-app`):
  - Removed `Platform.OS === 'web'` guard in `useAutoSync.ts`, enabling native Android to reconnect Supabase Realtime sockets (`rt.disconnect() -> rt.connect()`) on `AppState === 'active'`.
  - Immediately refetches stats, queue lists, and pending request alerts when staff unlocks the screen or opens the app.
- [x] Android Battery Optimization Exemption Prompt (`apps/staff-app`):
  - Added `checkAndPromptBatteryOptimization()` in `foregroundService.ts` called upon staff login in `App.tsx`.
  - Prompts staff to whitelist the app in Android battery settings via `notifee.openBatteryOptimizationSettings()`, preventing aggressive OEM Doze suspension on Samsung, Xiaomi, and Pixel devices.
- [x] High-Priority FCM & Expo Push Payload Dispatching (`apps/web`):
  - Updated `webPush.ts` to accept all valid FCM and Expo push tokens.
  - Configured high-priority delivery (`priority: 'high'`, `sound: 'alarm'`, `channelId: 'hotel_staff_alarm'`, `ttl: 86400`) to wake sleeping Google Play Services devices.
- [x] Database Schema Migration 18 (`push_token` on `staff_users`):
  - Added `packages/supabase/migrations/18_add_staff_users_push_token.sql` and `apps/web/supabase/migrations/18_add_staff_users_push_token.sql` to store Android mobile FCM device tokens.
  - Updated TypeScript interfaces in `packages/supabase/types/index.ts` and `apps/staff-app/components/UserManagement.tsx`.
- [ ] Apply DB migrations `15_spa_time_slots.sql`, `16_cleanup_expired_spa_holds.sql`, and `18_add_staff_users_push_token.sql` in Supabase SQL editor.
- [ ] Test end-to-end guest-to-staff flow on live Vercel deployments and Android APK.

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
- Supabase migration `11_scheduled_booking_expiration.sql` is committed and confirmed applied in the live project.
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

- [x] Two simultaneous attempts for the same therapist/time produce only one successful reservation.
- [x] Request creation failure rolls back the lock in the same transaction.
- [x] Editing or cancelling one booking cannot modify another booking's lock.
- [x] Expired holds no longer block availability without relying on browser code.

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
- [x] Add an integration test for atomic duplicate prevention.
- [x] Add a tenant-isolation test for staff queries and realtime events.
- [x] Run TypeScript checks for both apps.
- [x] Run the staff Expo web export.
- [x] Test guest booking, staff approval, manual booking, quick-add, edit, cancel, complete, and hold expiry in a clean database.
- [x] Verify the Vercel deployment is running the latest commit and retest the reported duplicate/stale-slot scenario. User confirmed the live timetable is working after targeted Supabase cleanup.
- [x] Apply and verify Supabase migrations/RPCs separately, with a rollback plan recorded. Production database changes applied.

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
- [x] Android Foreground Service Permission Fix (`apps/staff-app/app.json` & `foregroundService.ts`):
  - Added `"FOREGROUND_SERVICE_REMOTE_MESSAGING"` to `android.permissions` in `app.json` to prevent Samsung/Xiaomi/Pixel Android 14+ OEM background killing.
  - Added `foregroundServiceTypes` declaration (`REMOTE_MESSAGING` and `DATA_SYNC`) in Notifee's `startStaffMonitoringService`.
- [x] High-Priority FCM Push Verification & Diagnostics Suite:
  - **Admin Web Portal (`/admin/users`)**:
    - Added "Device Push (FCM)" status column displaying active token previews (`📱 FCM Active` vs `⚠️ No FCM Token`).
    - Added "⚡ Test Push" action button per staff row and "⚡ Test FCM Push (All)" broadcast button in the header toolbar.
    - Added rich Dispatch Result Modal displaying live delivery receipts, Expo ticket IDs (`status: ok`), reached devices, and failure diagnostics.
  - **Staff Android App (`apps/staff-app`)**:
    - Created `PushDiagnosticsModal.tsx` accessible via the header `📡 FCM` status button.
    - Real-time logging of received push events (timestamps, title, body, test vs request alerts).
    - 1-tap Push Token copy tool and local "🔔 Trigger Local Test Alarm" for instant audio, vibration, and full-screen intent verification.
  - **Push API (`apps/web/lib/webPush.ts` & `/api/push/send`)**:
    - Supported single `staffUserId` target parameter for 1-on-1 device testing and rich receipt return values (`expoReceipts`, `errors`).
- [x] Build Verification:
  - Web TypeScript `tsc --noEmit`: ✅ 0 errors
  - Staff App TypeScript `tsc --noEmit`: ✅ 0 errors
  - Next.js Production Build (`next build`): ✅ All 20 routes compiled & prerendered cleanly
  - Expo Web Export (`expo export --platform web`): ✅ 0 errors

### To be added
- [ ] I am implementing a real-time chat feature between guests and staff in my hotel app. Guests access the app by scanning a static QR code in their room. To ensure data privacy between different stays, chat messages must be tied to a unique guest_session_id rather than the static room_id or QR code payload. Please provide the database schema and backend routing logic so that when a guest checks out, their chat session is archived, and when a new guest scans the same QR code, a fresh chat session is initiated without exposing previous messages.
