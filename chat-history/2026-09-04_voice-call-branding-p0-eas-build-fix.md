# 2026-09-04 — Voice Call P0 Fixes, Branding P0 Wiring & EAS Build Plugin Error

## Overview
Final P0 cleanup for the staff voice-call engine and the dynamic theme/branding CMS, plus a critical EAS Build fix that was preventing the staff-app from compiling on `expo.dev`. All voice-call and branding changes are TypeScript-only → OTA eligible. The EAS Build fix touches `.npmrc` (pnpm hoisting) and removes a stale `package-lock.json`, so it does **not** require a new APK either (no native config was changed).

## Git Commits
- `8e622eb` — fix: complete voice-call & branding P0 fixes; resolve EAS build plugin error
- `f48c0f9` (this commit) — docs: agent handoff + checklist + chat history for P0/EAS fix session

---

## 1. Voice-Call P0 Fixes (staff-app)

### a) `apps/web/app/api/push/webhook/route.ts` — filter logic
The webhook that dispatches FCM pushes from the `requests` INSERT trigger had a broken boolean expression:

```ts
// BEFORE — always true (only ignored when ALL three are true)
if (eventType !== 'INSERT' && status !== 'PENDING' && status !== 'PENDING_ON_CALL')

// AFTER — correctly filters out UPDATE / non-pending events
if (eventType !== 'INSERT' || (status !== 'PENDING' && status !== 'PENDING_ON_CALL'))
```

This was producing duplicate push notifications on every UPDATE event (e.g. when a request was acknowledged, escalated, or completed, the same row would re-fire push because the filter never matched).

### b) `apps/staff-app/lib/useStaffVoiceCall.native.ts` — `onError` race
The `onError` handler was calling `onCallEnded?.()` even when the connection was just temporarily lost and the auto-rejoin logic was about to fire. That would tear down the alert UI mid-reconnect and leave the call half-joined.

```ts
// AFTER
onError: (err, _msg) => {
  setIsConnected(false)
  if (!isReconnecting) onCallEnded?.()  // only end if we're NOT in a reconnection attempt
},
```

Combined with the existing `onConnectionLost` → `setIsReconnecting(true)` and the exponential backoff wrapper, the staff app now tolerates brief network blips without the call ending in the UI.
---

## 2. Branding P0 Wiring (web)

All hardcoded color/gradient values in the guest-facing surfaces have been replaced with tokens from `useGuestTheme()`, so the admin's Branding page (`/admin/branding`) now actually changes the appearance of every guest surface in realtime.

### Files touched
| File | Before | After |
|------|--------|-------|
| `apps/web/app/page.tsx` (landing) | Hardcoded amber `#fbbf24`/`#d97706`, removed `GuestSettingsProvider` wrapper | Wrapped in `GuestSettingsProvider`; `DemoContent` uses `useGuestTheme()` for logo border + glow, heading gradient, and the demo button background |
| `apps/web/app/app/stay/components/FrontDeskFAB.tsx` | Hardcoded amber gradient + `border-amber-300/60` | `useGuestTheme()` → `primaryHex`/`secondaryHex`/`glowRgba`/`badgeBg` |
| `apps/web/app/app/stay/components/FnBDiningFAB.tsx` | Hardcoded emerald gradient + `border-emerald-300/70` | Same theme-driven treatment (gold / emerald / sapphire / amethyst / rose / slate all flow through) |
| `apps/web/app/app/stay/spa/page.tsx` | "Book Another Treatment" button hardcoded purple gradient | Theme-driven gradient + glow box-shadow |

`page.tsx` was converted to a `'use client'` component (it now consumes `useGuestTheme`); the `metadata` export was removed accordingly (client components can't export `metadata`).

### Type-safety verification
`npx tsc --noEmit -p apps/web/tsconfig.json` exits with code 0 — no new TS errors introduced.

---

## 3. EAS Build Plugin Error — Root Cause + Fix

### Error
```
Failed to resolve plugin for module "expo-secure-store"
relative to "/home/expo/workingdir/build/apps/staff-app".
Do you have node modules installed?
```

This fired during the EAS prebuild step, which executes the `"plugins": ["expo-secure-store", ...]` array in `apps/staff-app/app.json`. The Expo CLI does `require('expo-secure-store/app.plugin')` to load the config plugin, and that `require` failed on the build server.

### Root cause
The root `package.json` declares `"packageManager": "pnpm@9.15.4"`, so EAS Build runs `pnpm install` instead of `npm install`. By default, **pnpm uses an isolated `node_modules/.pnpm/...` structure** and only exposes dependencies declared as direct dependencies at the top level of each package.

The repo's `.npmrc` had been written for **npm**:

### Fix

**`/.npmrc`** — replace the npm-only setting with pnpm-compatible hoist directives:

```ini
# pnpm: hoist all deps to root node_modules so Metro/Expo autolinking can find them
# (avoids "Failed to resolve plugin for module" errors during EAS prebuild)
shamefully-hoist=true
hoist-pattern[]=*
public-hoist-pattern[]=*
```

- `shamefully-hoist=true` is pnpm's escape hatch that mimics the npm flat hoisting.
- `hoist-pattern[]=*` and `public-hoist-pattern[]=*` cover both the regular and "publicly hoisted" (e.g. bin scripts) buckets.

**`/apps/staff-app/package-lock.json`** — deleted. It was a stale npm lock file conflicting with the pnpm workspace. EAS was choosing pnpm based on the root `packageManager` field, so the npm lock file was dead weight that confused the install step.

### Local verification
- `pnpm install --frozen-lockfile` → exit 0, no warnings
- `expo-secure-store` now lives at `node_modules/expo-secure-store` (hoisted) and `app.plugin.js` is resolvable
- `npx expo config --type prebuild` → exit 0, successfully resolves the `expo-secure-store` plugin chain (`app.plugin.js → plugin/build/withSecureStore`)

### Next step
Re-run the EAS build:
```bash
cd apps/staff-app
eas build -p android --profile preview
```
The prebuild step should now find `expo-secure-store` without issue. No APK rebuild would have been needed even without this fix because no native config was touched.

---

## Files Modified

| File | Change |
|------|--------|
| `.npmrc` | `node-linker=hoisted` → `shamefully-hoist=true` + `hoist-pattern[]=*` + `public-hoist-pattern[]=*` |
| `apps/staff-app/package-lock.json` | **DELETED** (conflicted with pnpm workspace) |
| `apps/staff-app/lib/useStaffVoiceCall.native.ts` | Gated `onError→onCallEnded` with `!isReconnecting` |
| `apps/web/app/api/push/webhook/route.ts` | Fixed `&&` chain → `\|\|` for INSERT + PENDING filter |
| `apps/web/app/page.tsx` | `'use client'`, wrapped in `GuestSettingsProvider`, `useGuestTheme` for logo/heading/button |
| `apps/web/app/app/stay/components/FrontDeskFAB.tsx` | Theme-driven gradient + glow + badge |
| `apps/web/app/app/stay/components/FnBDiningFAB.tsx` | Theme-driven gradient + glow + badge |
| `apps/web/app/app/stay/spa/page.tsx` | "Book Another Treatment" → theme gradient + glow |
| `AGENT_HANDOFF.md` | New session block appended |
| `AI_AGENT_CHECKLIST.md` | New checkbox rows for this session |
| `chat-history/README.md` | New row in Sessions Index |
| `chat-history/2026-09-04_voice-call-branding-p0-eas-build-fix.md` | **NEW** (this file) |

## Deploy Type
✅ **OTA Update Only** — every code-level change is JS/TS. The EAS Build fix lives in `.npmrc` and the install step, so it changes the *next* build outcome but does not require a new native binary.

## Testing Notes
- **Voice call**: place a call, toggle airplane mode on the staff device, toggle back on → call should auto-rejoin within 6s without showing "Call Failed" or disappearing from the alert.
- **Branding**: open `/admin/branding`, change color scheme to "sapphire" or "amethyst", click Publish → the landing page, FrontDesk FAB, F&B FAB, and the spa "Book Another Treatment" button should all re-skin within ~1s (realtime). The hardcoded amber/emerald/purple should not appear anywhere.
- **Push**: insert a row into `requests` with `status: 'PENDING'` → exactly one push fires. Update the same row to `status: 'ACKNOWLEDGED'` → no push. (Previously both events would fire.)
- **EAS**: re-trigger `eas build -p android --profile preview`; the prebuild step should now succeed.

```ini
node-linker=hoisted   # ← npm-only setting; pnpm silently ignores it
```

So on the EAS worker, pnpm was installing correctly but the `expo-secure-store` package was buried under `node_modules/.pnpm/expo-secure-store@15.0.8/node_modules/expo-secure-store/`, and Node's module resolution from the `plugins` array couldn't find it at the top level. The prebuild step bailed out with the misleading "Do you have node modules installed?" message.

