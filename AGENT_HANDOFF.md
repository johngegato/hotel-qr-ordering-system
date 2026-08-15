**Agent Handoff**

Purpose: Provide a concise handoff for a new AI agent or developer to continue work on this repository, including structure, recent changes, run instructions, and recommended next steps.

**Repository Structure (high level)**
- **apps/staff-app**: Expo/React Native staff application (web + native). Key components: [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx), [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx).
- **apps/web**: Next.js front-end (app router).
- **packages/supabase**: SQL migrations and DB types. Migrations live under [packages/supabase/migrations](packages/supabase/migrations).

**Recent changes (what was modified and why)**
- [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx): Fixed syntax/brace imbalance; rewrote `handleCreate` to reliably seed a `DEFAULT_ROOM_ID`, insert `requests`, create `spa_slot_locks`, and add audit logs. Removed fragile catch/type patterns that broke web export.
- [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx): Timetable parsing and realtime subscription fixes so bookings display correctly using `payload.slot_time` and explicit realtime handlers.
- [apps/staff-app/components/EditSpaBookingModal.tsx](apps/staff-app/components/EditSpaBookingModal.tsx): Safer error handling and compatibility fixes for web export.
- [apps/staff-app/app.json](apps/staff-app/app.json): Added `platforms` to support web export.
- [apps/staff-app/package.json](apps/staff-app/package.json): Pin/adjusted `build:web` script for `expo export` compatibility.
- [packages/supabase/migrations/09_seed_default_room.sql](packages/supabase/migrations/09_seed_default_room.sql): Server-side seed to ensure `DEFAULT_ROOM_ID` exists (run this migration in your Supabase instance).

**Key concepts & constraints**
- The `requests.room_id` column has a foreign-key constraint to `rooms.id`; missing seed causes HTTP 409 when inserting requests. Server migration + client-side seed guard were added to avoid this.
- Staff manual bookings must create a `spa_slot_locks` row so the timetable and other systems see the booking immediately.
- Expo web export historically failed due to typed `catch (err: any)` or optional chaining inside `catch`. Use plain `catch (err)` or ensure transpiler supports typed catch in your toolchain. We rewrote code to avoid fragile patterns.

**How to run locally (developer steps)**
1. Install dependencies (workspace root):

```bash
pnpm install    # or npm install
```

2. Staff app TypeScript check:

```bash
npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json
```

3. Expo web export (run from staff app):

```bash
cd apps/staff-app
npx expo@~54 export --platform web
```

4. Next.js web dev:

```bash
cd apps/web
pnpm dev
```

**Database / Supabase notes**
- Migrations live in [packages/supabase/migrations](packages/supabase/migrations). Apply them in your Supabase project; specifically run `09_seed_default_room.sql` to ensure `DEFAULT_ROOM_ID` exists.
- Realtime behavior: `spa_slot_locks` and `requests` are used by the staff-app timetable; ensure RLS policies allow service-role inserts during migrations or use admin credentials for seeding.

**Vercel / Deployment notes**
- Vercel will install dependencies and run the configured build. After pushing to `main` the site should trigger a new deploy. If web export fails on Vercel, confirm `apps/staff-app/app.json` contains `platforms` and that `expo` is resolved via the lockfile.

**Coding conventions & AI guidance**
- Prefer minimal, focused edits. Fix root cause rather than quick hacks.
- When modifying code that runs during build/export, avoid typed catch bindings or optional chaining inside `catch` if the build toolchain is older — use conservative patterns for compatibility.
- Prefer server-side migrations for persistent data (like `DEFAULT_ROOM_ID`) rather than only client-side seeding.
- When resolving merge conflicts, prefer the existing repo version if unsure, but include comments explaining non-obvious choices.

**Files to review first (entry points for new agent)**
- [apps/staff-app/components/ManualSpaBookingModal.tsx](apps/staff-app/components/ManualSpaBookingModal.tsx)
- [apps/staff-app/components/SpaTimetable.tsx](apps/staff-app/components/SpaTimetable.tsx)
- [packages/supabase/migrations/](packages/supabase/migrations)
- [apps/staff-app/package.json](apps/staff-app/package.json)

**Immediate next tasks (recommended)**
- Run the full test/build cycle on your machine or CI: install deps, run `tsc`, run `expo export`, and verify Vercel deploy logs. (Priority: confirm build passes.)
- Apply `09_seed_default_room.sql` to Supabase to avoid FK 409 errors in production.
- Add a lightweight e2e or integration test for manual booking flow that verifies `requests` insert and `spa_slot_locks` creation.

**Contact & context**
- Commits with recent fixes were pushed to `main` (latest includes the ManualSpaBookingModal fix). Check commit history for details.

---
If you want, I can:
- commit this handoff file to the repo and push it, and
- create small follow-up tasks (tests or CI adjustments).
