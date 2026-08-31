# Session: 2026-08-31 Part 1 — FOREGROUND_SERVICE_REMOTE_MESSAGING & Push Diagnostics Suite

**Conversation ID**: 12ee2fdf-f932-4be3-8a00-9f9580a79040  
**Commits**: `fe780fe`, `4d99606`, `06764df`

---

## Context

After the background watchdog was implemented, some Samsung/Xiaomi devices were still killing the service. The root cause was missing the `FOREGROUND_SERVICE_REMOTE_MESSAGING` service type declaration — required by Android 14+ for foreground services that handle remote push.

Additionally, the admin had no way to tell if FCM push was working. This session built a full diagnostics suite.

---

## Solutions Implemented

### Android 14+ Service Type Fix

**`apps/staff-app/app.json`**
```json
"permissions": [
  "RECEIVE_BOOT_COMPLETED",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_DATA_SYNC",
  "FOREGROUND_SERVICE_REMOTE_MESSAGING"  // ← Added
]
```

**`apps/staff-app/lib/foregroundService.ts`**
```ts
foregroundServiceTypes: [
  AndroidForegroundServiceType.REMOTE_MESSAGING,
  AndroidForegroundServiceType.DATA_SYNC,
]
```

---

### Web Admin Push Diagnostics (`apps/web/app/admin/users/page.tsx`)

- Added **"Device Push (FCM)"** status column per staff row (`📱 FCM Active` vs `⚠️ No FCM Token`).
- Added **"⚡ Test Push"** per-user button.
- Added **"⚡ Test FCM Push (All)"** broadcast button in header toolbar.
- Added **Test Push Result Modal** showing:
  - Exact token from Supabase
  - Token type: `🟢 Real FCM Token` / `🟡 Local Fallback Token` / `⚠️ Token Missing`
  - Expo ticket IDs and `status: ok` receipts
  - Reached device count and error diagnostics

### Web Push API (`apps/web/lib/webPush.ts` & `/api/push/send`)
- Added `staffUserId` targeting for 1-on-1 test pushes.
- Returns `expoReceipts`, `sent`, `failed`, `expoDevicesReached`, `targetUserFound`.

### Staff App Push Diagnostics (`apps/staff-app/components/PushDiagnosticsModal.tsx`)
- Tappable `📡 FCM` button in the header opens a diagnostics drawer.
- Displays: token string, token type, service status, battery optimization status.
- Live push log (timestamps, title, body, test vs real).
- "🔔 Trigger Local Test Alarm" button.
- 1-tap token copy.

### Multi-Strategy Token Resolution (`apps/staff-app/lib/notifications.ts`)
- Strategy 1: `getExpoPushTokenAsync()` with auto project ID
- Strategy 2: `getExpoPushTokenAsync({ projectId })` with explicit ID
- Strategy 3: `getDevicePushTokenAsync()` native FCM fallback
- Exports `getLastPushTokenError()` for on-screen diagnostic display
