AI Agent Onboarding Checklist

Purpose: Quick actionable checklist for future AI agents or developers to pick up work on this repository.

- [ ] Pull latest `main` and install dependencies (`pnpm install` or `npm install`).
- [ ] Run TypeScript checks for both apps:
  - `npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json`
  - `npx -p typescript tsc --noEmit -p apps/web/tsconfig.json`
- [ ] Run local builds:
  - Staff app web export: `cd apps/staff-app && npx expo@~54 export --platform web`
  - Web app dev: `cd apps/web && pnpm dev`
- [ ] Apply DB migrations in `packages/supabase/migrations` to target Supabase instance (ensure `09_seed_default_room.sql` runs).
- [ ] Verify manual booking flow end-to-end:
  - Create manual booking in staff app.
  - Confirm `requests` row is inserted and `spa_slot_locks` created.
  - Confirm timetable updates via realtime subscriptions.
- [ ] Check RLS and service role permissions for migrations and seeding.
- [ ] Review `apps/staff-app/components/ManualSpaBookingModal.tsx` and `SpaTimetable.tsx` for recent edits.
- [ ] Reproduce Vercel build: push to `main` and inspect Vercel build logs for `expo export` errors.
- [ ] If build fails on Vercel, run the same commands locally and adjust `apps/staff-app/app.json` and `package.json` as needed.
- [ ] Add integration test (optional): simulate manual booking and assert DB rows and realtime notification.
- [ ] Add CI workflow (GitHub Actions) to run `pnpm install`, `tsc --noEmit`, and `expo export` (or a subset) on PRs to `main`.
- [ ] Document any manual deployment steps and Supabase migration process in `AGENT_HANDOFF.md`.

Notes:
- Prefer server-side migrations over client-side seeds when possible.
- Avoid typed `catch (err: any)` in files that are exported for web if toolchain is old; use conservative patterns.

Done checklist items should be checked and a short PR description provided when changes are pushed.
