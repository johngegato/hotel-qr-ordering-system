# Session: 2026-08-31 Part 2 — Firebase Setup & EAS Build Pipeline

**Conversation ID**: 12ee2fdf-f932-4be3-8a00-9f9580a79040  
**Commits**: `cf09f2a`

---

## Context

The staff app was using a local fallback push token (`expo_local_android_...`) instead of a real FCM token. This meant push delivery only worked locally and not across the internet from Vercel to the Android device. The fix required setting up Firebase and building a real APK via EAS Build.

---

## Steps Completed

### 1. Firebase Console Setup
- Created Firebase project for Android package `com.hotelqr.staffapp`.
- Downloaded `google-services.json` (placed in `apps/staff-app/google-services.json`).
- **Key insight for Expo projects**: Skip the Firebase Console "Add Firebase SDK" Gradle step — Expo/EAS handles it automatically. Just click "Next → Continue to console".

### 2. `apps/staff-app/app.json` Update
```json
"android": {
  "package": "com.hotelqr.staffapp",
  "googleServicesFile": "./google-services.json",  // ← Added
  ...
}
```

### 3. `.gitignore` Security Update
Added patterns to prevent private keys from being committed:
```
*-firebase-adminsdk-*.json
*service-account*.json
```

### 4. Expo Account Migration
- Old account `kekehyu` caused `Entity not authorized` errors — credentials were for a different owner.
- Ran `npx expo logout` → `npx expo login` (new account: `gegatjohn93@gmail.com` / `@johngegato`).
- Removed stale `extra.eas.projectId` and `owner` from `app.json`.
- Re-initialized: `npx eas-cli project:init` → Created `@johngegato/staff-app`.
- New project ID: `4e2f24d0-60e3-4ce3-891e-1f2a1e591df6`.

### 5. EAS Build
```bash
cd apps/staff-app
npx eas-cli build -p android --profile preview
```
- Build enqueued and in progress at time of session end.
- Check: https://expo.dev/accounts/johngegato/projects/staff-app/builds

---

## Outstanding After This Session

- [ ] Upload FCM V1 Service Account key:
  ```bash
  npx eas-cli credentials
  # → Android → preview → Google Service Account / FCM V1 → Upload
  # File: hotel-qr-ordering-system-aabdb-firebase-adminsdk-fbsvc-d5d8bea2fb.json
  ```
- [ ] Install new APK on Android device
- [ ] Verify real `ExponentPushToken[...]` registered in Supabase `staff_users.push_token`
- [ ] Test push from Vercel `/admin/users` → `status: ok` receipt

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `Unable to retrieve the FCM server key` | Expo doesn't have your Firebase service account | Upload FCM V1 key via `eas credentials` |
| `Entity not found: AndroidAppCredentialsEntity` | No Android profile exists yet | Initialize keystore first via `eas credentials` → Generate Keystore |
| `Entity not authorized: AppEntity[...]` | Logged in as wrong Expo account | `expo logout` → `expo login` → `eas project:init` |
| `npm error could not determine executable to run` | Wrong package name for EAS CLI | Use `npx eas-cli` not `npx eas` |
