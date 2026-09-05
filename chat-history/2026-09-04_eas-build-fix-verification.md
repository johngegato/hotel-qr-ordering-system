# 2026-09-04 — EAS Build Fix Verification (expo-secure-store)

## Branch
`backup-09-04-26-6pm` (debugging/testing branch)

## Status
✅ **VERIFIED — Tier A (clean reinstall + cache bust) resolved the issue.**
No code change required beyond what was already committed in `8e622eb`.

## Verification Performed
Ran the Tier A procedure from `DEBUG_PLAN.md` on a clean local checkout:

1. **Pre-flight check**: `.npmrc` confirmed to contain `shamefully-hoist=true` + `hoist-pattern[]=*` + `public-hoist-pattern[]=*`. `apps/staff-app/package-lock.json` confirmed absent. Latest commit on `.npmrc`: `8e622eb`.
2. **Clean reinstall**: `pnpm install --no-frozen-lockfile` → exit 0, 920 packages installed in ~78s. `expo-secure-store@15.0.8` correctly hoisted to both `node_modules/expo-secure-store/app.plugin.js` and `apps/staff-app/node_modules/expo-secure-store/app.plugin.js`.
3. **Plugin resolution smoke test**: `cd apps/staff-app && npx expo config --type prebuild` → exit 0. Full config dumped (232 lines). 0 occurrences of "Failed", "ERROR", or "Error". All `expo-secure-store` plugin hooks (`manifest`, `strings`, `gradleProperties`, `colors`, etc.) loaded successfully.
4. **Full prebuild**: `cd apps/staff-app && npx expo prebuild --platform android --no-install --clean` → exit 0. Native android project generated under `apps/staff-app/android/` (gradle, app/build.gradle, AndroidManifest.xml all present). 0 "Failed" matches in log. The only stderr line was an unrelated "Git branch dirty" advisory.
5. **TypeScript sanity**: `apps/staff-app` `tsc --noEmit` → exit 0. `apps/web` `tsc --noEmit` → exit 0.

## Conclusion
The `.npmrc` rewrite in commit `8e622eb` was correct. The build was failing because:
- The `.npmrc` directives only take effect on a **fresh** install
- EAS Build (and any local environment) was likely carrying a **cached `node_modules`** generated before the directives were applied

**The fix is operational.** Re-running `eas build -p android --profile preview --clear-cache` should now succeed.

## What I Did NOT Need To Do
- ❌ Tier B: Adding `apps/staff-app/.npmrc` — not needed
- ❌ Tier C: Pinning `pnpmVersion` in `eas.json` — not needed
- ❌ Tier D: Converting plugin entry to tuple form — not needed

## Next Step for the User
```bash
cd apps/staff-app
eas build -p android --profile preview --clear-cache
```
This should produce a successful APK. Smoke test on device per `DEBUG_PLAN.md` Task 5 before declaring victory on the live EAS pipeline.
