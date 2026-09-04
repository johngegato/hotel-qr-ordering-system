# Session: 2026-09-04 — Fix: Staff "Call Failed" on Answering Live Voice Call

**Branch**: `main`
**Date**: 2026-09-04

---

## Bug Report
Guest clicks "Live Voice Call" in the guest web; staff taps **Answer** in the Android APK and immediately gets:
`Call Failed — Could not connect to live voice call.`

## Root Causes (two independent bugs)
1. **Relative URL fetch in the native app** (`apps/staff-app/App.tsx`): the staff app called `fetch('/api/agora/token?...')`. Native Android/iOS cannot resolve relative URLs (no base host), so the token request always threw "Network request failed" → caught → alert. The token endpoint itself is fine (verified live: `https://hotel-qr-ordering-system-web.vercel.app/api/agora/token?channel=test&uid=2` → 200 + signed token).
2. **Wrong `joinChannel` signature** (`apps/staff-app/lib/useStaffVoiceCall.native.ts`): installed `react-native-agora` is **v4.6.2** whose signature is `joinChannel(token, channelId, uid, options)`, but the code used the v3-style 5-arg form `joinChannel(token, channel, '', 2, {...})`, so the engine received `uid=''` and `options=2` and rejected the join — even if the token fetch had worked.

## Fixes
### `apps/staff-app/App.tsx`
- New `WEB_APP_BASE_URL` constant: `process.env.EXPO_PUBLIC_WEB_URL || 'https://hotel-qr-ordering-system-web.vercel.app'` (trailing slash trimmed).
- Token fetch now uses `Platform.OS === 'web' ? '/api/agora/token...' : '${WEB_APP_BASE_URL}/api/agora/token...'` — web/PWA keeps same-origin relative path (no CORS needed), native uses the absolute Vercel URL.
- "Call Failed" alert now includes the underlying error message for easier diagnosis.

### `apps/staff-app/lib/useStaffVoiceCall.native.ts`
- `joinChannel(token ?? '', channel, 2, options)` — correct v4 signature; throws if the engine returns a negative result code.
- Added `onJoinChannelSuccess` and `onError` event handlers (plus `addListener` fallbacks) so connection state reflects the real join result and Agora engine errors surface instead of a frozen "connected" UI.

## Verification
- `apps/staff-app`: `tsc --noEmit` → 0 errors.
- Production token endpoint verified live (uid=1 and uid=2 → 200, signed 24h tokens).

## Deployment Notes
- **OTA update only** — JS/TS changes in the staff app; no `app.json`, native dependency, or env var changes.
  `npx eas-cli update --branch preview --message "fix live call answer (token URL + agora v4 joinChannel)"`
- Web app unchanged → no Vercel redeploy, no Supabase migration.
- If the guest web domain ever changes, set `EXPO_PUBLIC_WEB_URL` on EAS / the local `apps/staff-app/.env` before the next build/update.
