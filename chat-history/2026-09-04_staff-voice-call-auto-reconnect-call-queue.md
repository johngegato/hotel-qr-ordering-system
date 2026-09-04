# 2026-09-04 — Staff Voice Call Auto-Reconnection & Call Queue

## Summary
Implemented robust auto-reconnection for staff-app Agora voice calls and a call queue system to handle multiple simultaneous incoming live calls.

## Changes Made

### 1. Auto-Reconnection in `useStaffVoiceCall.native.ts`
- **New `isReconnecting` state** — Exposed to callers via `StaffVoiceCallState` interface
- **Event handlers for connection lifecycle** — Added `onConnectionLost` and `onRejoinChannelSuccess` to both `registerEventHandler` (Agora v4) and `addListener` (legacy) branches
- **Network recovery hook** — Integrated `useOnReconnect` from `networkMonitor.ts` to automatically rejoin channel when network recovers
- **Retry logic for initial join** — New `joinChannel` wrapper with exponential backoff (3 attempts, 2s/4s/6s delays)
- **Refs for channel/token/appId** — Store latest values for reconnection attempts

### 2. Network Monitor (`networkMonitor.ts` — NEW)
- **`@react-native-community/netinfo` integration** — Real-time network state detection
- **Singleton `NetworkMonitor` class** — Tracks online/offline, reconnecting state, disconnect count, timestamps
- **`useNetworkMonitor()` hook** — React-friendly access to network state
- **`useOnReconnect(callback, deps)` hook** — Triggers callback on offline→online transition

### 3. Call Queue System (`callQueue.ts` — NEW)
- **`CallQueue` singleton class** — Manages incoming `LIVE_CALL` requests
- **FIFO queuing with priority** — High priority (FCM) calls sort before normal
- **Staff busy detection** — `isStaffBusy()` prevents showing new alert while on call
- **Auto-advance** — `completeActiveCall()` dequeues next call automatically
- **Subscription model** — Components subscribe via `callQueue.subscribe()`
- **Max queue size** — Capped at 10 to prevent unbounded growth
- **Duplicate prevention** — Ignores duplicate requestIds

### 4. App.tsx Integration
- **Call queue subscription** — React effect subscribes to queue changes, updates waiting count, auto-presents next call when free
- **FCM & Realtime enqueue** — Incoming `LIVE_CALL` events now enqueue instead of directly showing alert
- **Active call tracking** — `callQueue.setActive(reqId)` called before joining Agora channel
- **UI indicator** — "Waiting Calls" stat card highlights when queue has items (red highlight)
- **StatCard enhancement** — Added `highlight` prop for visual emphasis

### 5. Package Updates
- Added `@react-native-community/netinfo` dependency
- Added TypeScript to devDependencies

## Files Changed
- `apps/staff-app/lib/useStaffVoiceCall.native.ts` — Auto-reconnection logic
- `apps/staff-app/lib/networkMonitor.ts` — NEW: Network monitoring & reconnect hook
- `apps/staff-app/lib/callQueue.ts` — NEW: Call queue & concurrency management
- `apps/staff-app/App.tsx` — Queue integration, UI indicators
- `package.json` — New dependencies

## Deploy Type
✅ **OTA Update Only** — All changes are TypeScript/React Native code. No native config changes.

## Testing Notes
- Verify `useOnReconnect` triggers on WiFi toggle / airplane mode
- Test multiple simultaneous incoming calls queue correctly
- Confirm "Waiting Calls" badge appears in dashboard
- Test call end auto-advances to next queued call