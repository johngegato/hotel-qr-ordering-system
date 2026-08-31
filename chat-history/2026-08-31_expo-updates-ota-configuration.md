# Session: 2026-08-31 Part 5 — OTA Auto-Updates Configuration in `apps/staff-app` via `expo-updates`

**Branch**: `backup-8-31-26-4pm`  
**Date**: 2026-08-31  

---

## 1. Overview
Configured `expo-updates` in the Staff Mobile App (`apps/staff-app`) to enable seamless Over-The-Air (OTA) JavaScript and asset updates without requiring manual APK reinstallation for code and UI changes.

---

## 2. Configuration Details

### `apps/staff-app/app.json`
1. Added `"runtimeVersion": { "policy": "appVersion" }`
2. Configured `"updates"`:
   ```json
   "updates": {
     "url": "https://u.expo.dev/4e2f24d0-60e3-4ce3-891e-1f2a1e591df6",
     "checkAutomatically": "ON_LOAD",
     "fallbackToCacheTimeout": 0
   }
   ```
3. Added `"expo-updates"` to `"plugins"` array.

### `apps/staff-app/package.json`
- Installed `expo-updates: ~0.28.17`.

---

## 3. Auto-Update Hook (`apps/staff-app/lib/useAutoUpdate.ts`)
Created `useAutoUpdate()` hook:
- **Environment Guard**: Checks `!__DEV__` and `Platform.OS !== 'web'` (OTA updates only execute in standalone/preview EAS builds).
- **Triggers**: Checks on initial component mount / app launch, and on `AppState` transition to `'active'` (when staff resumes the app).
- **Download & Reload**: Calls `Updates.checkForUpdateAsync()` $\rightarrow$ `Updates.fetchUpdateAsync()`. If a new bundle is ready, displays a non-cancelable dialog alerting staff and triggers `Updates.reloadAsync()`.

---

## 4. Root Integration
- Invoked `useAutoUpdate()` at the top of `MainAppContent()` in `apps/staff-app/App.tsx`.
