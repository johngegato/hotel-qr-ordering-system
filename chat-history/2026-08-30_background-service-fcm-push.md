# Session: 2026-08-30 — Background Service, FCM Push & DB Migration

**Conversation ID**: 12ee2fdf-f932-4be3-8a00-9f9580a79040  
**Commits**: `fe780fe`, `4d99606`, `06764df`

---

## Problems Solved

1. **Background Service Dying on Android (Samsung/Xiaomi/Pixel)**
   - Devices in Doze mode were killing the foreground service after 15–30 minutes.
   - Staff missed incoming room requests when phone screen was locked.

2. **WebSocket Disconnection on Screen Lock**
   - Supabase Realtime channel would go stale without reconnecting on app foreground.

3. **No FCM Push Capability**
   - Staff app had no remote push token; push delivery was 100% reliant on WebSocket staying alive.

---

## Solutions Implemented

### `apps/staff-app/lib/foregroundService.ts`
- Added `runBackgroundWatchdogCheck(hotelId)` — polls Supabase REST every 90 seconds, completely independent of WebSockets.
- When a pending request is detected: acquires WakeLock, turns on screen (`setTurnScreenOn`), shows Full-Screen Intent overlay, loops alarm.
- Added `checkAndPromptBatteryOptimization()` — prompts staff to disable OEM battery saver via `notifee.openBatteryOptimizationSettings()`.

### `apps/staff-app/lib/useAutoSync.ts` & `App.tsx`
- Removed `Platform.OS === 'web'` restriction blocking socket reconnection on Android.
- On `AppState === 'active'` (screen unlock): `rt.disconnect() → rt.connect()`, then refetch all stats and queues.

### `apps/web/lib/webPush.ts`
- Updated token filter to accept `ExponentPushToken[...]` and native FCM tokens.
- Configured high-priority flags: `priority: 'high'`, `sound: 'alarm'`, `channelId: 'hotel_staff_alarm'`, `ttl: 86400`.

### `packages/supabase/migrations/18_add_staff_users_push_token.sql`
- Added `push_token TEXT` column to `staff_users` table.
- Updated TypeScript types in `packages/supabase/types/index.ts`.
- Updated `apps/staff-app/components/UserManagement.tsx` to display token.

---

## Key Decision
Chose HTTP REST polling watchdog (not long-polling or SSE) because it is the only approach that survives Doze + WakeLock without a VPN or persistent socket.
