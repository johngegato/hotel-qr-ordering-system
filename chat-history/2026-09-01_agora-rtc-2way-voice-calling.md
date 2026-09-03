# Session: 2026-09-01 — 2-Way Live Voice Calling between Guest Web and Staff App (Agora RTC)

**Branch**: `webrtc`  
**Date**: 2026-09-01  

---

## 1. Overview
Implemented end-to-end 2-way real-time voice calling between the guest in-room browser (`apps/web` Next.js) and the staff mobile app (`apps/staff-app` Expo/React Native) using Agora RTC SDKs with Supabase Realtime signaling and FCM push wake-up alerts.

---

## 2. Changes & Architecture

### A. Environment Configuration
- `apps/web/.env.local`: Configured `NEXT_PUBLIC_AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`.
- `apps/staff-app/.env`: Configured `EXPO_PUBLIC_AGORA_APP_ID`.

### B. Database Schema (Migration 21)
- `21_live_call_channel.sql`: Added `agora_channel` (TEXT) column to `requests` table to share channel names across guest and staff clients.

### C. Server-Side Token Generation
- `apps/web/app/api/agora/token/route.ts`: Endpoint using `agora-access-token` to securely generate signed 24h RTC tokens.

### D. Guest Web Client (`apps/web`)
- `GuestVoiceCallEngine.tsx`: Dynamic browser Agora RTC hook initializing microphone capture and publishing audio on UID=1.
- `CallFrontDeskModal.tsx`: Added "Live Voice Call" CTA, live call state machine, mute toggle, and call termination.

### E. Staff Android App (`apps/staff-app`)
- `app.json`: Added `react-native-agora` plugin with microphone permissions and `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `BLUETOOTH_CONNECT` Android permissions.
- `useStaffVoiceCall.ts`: Native Agora RTC engine hook (UID=2) with `react-native-incall-manager` speaker routing.
- `IncomingLiveCallAlert.tsx`: Full-screen animated answer/decline modal with auto-dismiss countdown.
- `ActiveCallBar.tsx`: Floating live call bar displaying call timer, mute toggle, speaker switch, and end call button.
- `App.tsx`: Realtime `LIVE_CALL` listeners, notification response handling, and active call state binding.

### F. Push Notification Routing
- `apps/web/lib/webPush.ts` & `apps/web/app/api/push/webhook/route.ts`: Configured `LIVE_CALL` high-priority notification with `agoraChannel` data payload.

---

## 3. Important Deploy Notice

> [!WARNING]
> **APK Rebuild Required**: `react-native-agora` and `react-native-incall-manager` contain native Android dependencies. You must build a new preview APK via `eas build -p android --profile preview` to run voice calling on native devices.
