# Session: 2026-08-31 Part 4 — Automated FCM Push Notifications, Token Lifecycle Cleansing, Role-Based Routing & Admin Settings

**Branch**: `backup-8-31-26-4pm`  
**Date**: 2026-08-31  

---

## 1. Database & Schema Updates (Migration 20)

### Files
- `packages/supabase/migrations/20_notification_settings.sql`
- `apps/web/supabase/migrations/20_notification_settings.sql`
- `packages/supabase/types/index.ts`

### Changes
1. **Push Token Unique Partial Index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_push_token_unique
   ON staff_users (push_token)
   WHERE push_token IS NOT NULL;
   ```
   Guarantees that a single physical device's FCM push token can never be held by multiple staff accounts simultaneously.
2. **`notification_settings` Table**:
   - `hotel_id` (UUID UNIQUE REFERENCES `hotels(id)`)
   - `reminder_interval_minutes` (INT, default 5)
   - `enable_sound_alert` (BOOLEAN, default true)
   - `max_alert_duration_seconds` (INT, default 30)
   - `fnb_allowed_types` (TEXT[], default `{'FOOD_ORDER'}`)
   - `frontdesk_allowed_types` (TEXT[], default `{'CALL_REQUEST','TASK'}`)
   - `spa_allowed_types` (TEXT[], default `{'SPA_BOOKING'}`)
   - RLS policies and default seed row for default hotel.

---

## 2. Staff App Device Push Token Lifecycle & Cleansing

### Files
- `apps/staff-app/lib/notifications.ts`
- `apps/staff-app/App.tsx`

### Implementation
1. **`bindPushTokenToStaffUser(supabase, userId, token)`**:
   - Cleans the token from any other accounts before assigning it to `userId`.
   - Prevents leftover push tokens when logging out and logging into a different account on the same physical tablet/phone.
2. **`clearPushTokenFromStaffUser(supabase, userId)`**:
   - Nullifies `push_token = null` on logout to immediately stop background push alerts to logged-out users.
   - Called in `App.tsx`'s `handleLogout`.

---

## 3. Role-Based Notification Filtering & Alert Deduplication

### Files
- `apps/staff-app/lib/notifications.ts`
- `apps/staff-app/App.tsx`
- `apps/staff-app/components/IncomingRequestAlert.tsx`
- `apps/web/lib/webPush.ts`

### Implementation
1. **Role Permission Helper (`canRoleReceiveNotification`)**:
   - `KITCHEN` / `FNB` $\rightarrow$ `FOOD_ORDER` (or custom allowed types)
   - `FRONT_DESK` / `HOUSEKEEPING` / `MAINTENANCE` $\rightarrow$ `CALL_REQUEST`, `TASK`
   - `SPA` $\rightarrow$ `SPA_BOOKING`
   - `ADMIN` & `MANAGER` $\rightarrow$ All request types.
2. **Alert Deduplication**:
   - `alertedRequestIdsRef = useRef<Set<string>>(new Set())` prevents duplicate alarms/sound loops from triggering on the same request ID.
3. **Sound & Duration Controls**:
   - `IncomingRequestAlert.tsx` respects `enableSound` and `maxDurationSeconds`, automatically silencing audio and dismissing when the timer expires.

---

## 4. Automated Database Webhook Route

### File
- `apps/web/app/api/push/webhook/route.ts` [NEW]

### Implementation
- Handles automated Supabase Database Webhook POST events on `requests` table `INSERT`.
- Validates `status IN ('PENDING', 'PENDING_ON_CALL')`.
- Resolves room number from `payload.room_number` or database query.
- Calls `sendWebPushToHotelStaff` with role targeting.

---

## 5. Admin Notification Settings Controls

### File
- `apps/web/app/admin/settings/page.tsx`

### Implementation
- Added "Staff Push & Alarm Controls" card to `/admin/settings`:
  - Reminder Interval dropdown: 1 min, 2 min, 5 min (default), 10 min, 15 min, or Disabled.
  - Loud Audio Alarm toggle: Enable / Silenced.
  - Max Alarm Ring Duration slider (10s to 120s).
  - Role Notification Routing Matrix: interactive department checkboxes.
  - Instant FCM Push Test: `🔔 Send Test Notification` with live status indicator.
  - Saves to `notification_settings` with full `audit_logs` tracking.
