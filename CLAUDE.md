@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What this is

The Kova Strength unified app — replaces TrueCoach for programming (~150 Flagship + ~60 SPC clients) and will eventually absorb the separate Nutrition Tracker app's core loop too, all behind one login. Ships as native iOS/Android apps plus a web build, from one Expo codebase. Coaches do the majority of real program-building work on the web build; the native app is for members' day-to-day use and coaches' light on-the-go adjustments + push notifications.

Full build plan: [build-plan.md](build-plan.md) — read this first, it covers the architecture decisions and why (native+web from one codebase, drag-and-drop web-only, shared-Supabase-project-with-new-schemas, etc.). Programming's feature spec: [gym-app-spec.md](gym-app-spec.md).

**Status**: Phases 1-5 built and verified (Foundation, Workout Builder, Group Programming + Client Portal, Nutrition core loop, SPC). See build-plan.md's "Build order — status" section for the current checklist.

Nutrition v1 is a **one-time port** of the separate, still-live Nutrition Tracker app's core-loop logic (targets, daily log, weekly check-in) — not a live sync. That app keeps changing day-to-day independently; bringing the new module up to parity with it later (plus photos/Focus-Game-Plan/highlights/push, which are deferred, and the real data migration) is a distinct future phase, not something this build keeps up with automatically.

## Commands

```
npm install         # install dependencies — see "npm install gotcha" below, use --legacy-peer-deps
npx expo start --web   # web dev server (this repo's `run` skill / .claude/launch.json target: kova-strength-web)
npx expo start       # native dev server (needs a device/simulator — not available in this sandboxed environment)
```

No lint/test scripts configured yet.

## Tech stack

- **Frontend**: Expo SDK 57, Expo Router (file-based, route groups for `(auth)`/`(member)`/`(coach)`), React 19, React Native 0.86, plain `.js` (no TypeScript, except Edge Functions which are Deno/TS by necessity)
- **Styling**: NativeWind v4 (Tailwind for RN) — `tailwind.config.js` has the brand tokens, `global.css` has the `@tailwind` directives, `babel.config.js`/`metro.config.js` wire it up
- **Backend**: Supabase (Postgres + Auth), same project as the Nutrition Tracker app (`rtgwhchycfnfvwagilkw`), new `core`/`programming`/`nutrition` schemas — Nutrition Tracker's `public.*` tables are never touched
- **Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable`, web-only (`.web.js` builder screen only — this does not run on native)
- **Push**: `expo-notifications` → Expo Push Service, native-only (no Web Push/VAPID in this app)
- **Fonts**: `@expo-google-fonts/montserrat` + `@expo-google-fonts/protest-strike`

## Environment variables (`.env.local`, gitignored)

```
EXPO_PUBLIC_SUPABASE_URL=https://rtgwhchycfnfvwagilkw.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...        # same project as Nutrition Tracker, safe to reuse
EXPO_PUBLIC_ADMIN_EMAIL=terra@kovastrength.com           # bootstraps the first core.users admin row on first login
```

`.env.example` documents the shape without real values.

## Key architectural decisions (see build-plan.md for full reasoning)

- **Schema split**: `core.users` (role: admin/coach/member) is the shared identity layer both Programming and the future Nutrition module read. `programming.*` owns everything Programming-specific. This is *not* the same shape as Nutrition Tracker's `public.coaches`/`public.clients` split — don't assume the two apps' tables are interchangeable, they're deliberately separate schemas in the same project.
- **Timezone discipline**: `lib/boiseDate.js`'s `todayInBoise()` is the only correct way to get "today" anywhere in this app — never `new Date()` directly, never trust device local time. This already caught a real issue during testing: a block's `block_start_date` set to what looked like "today" in the UI was actually the next calendar day in Boise time (the browser's system clock was UTC-ahead), and the app correctly refused to show it as active. That's the timezone logic working as intended, not a bug — if a block/session isn't showing up when you expect, check `todayInBoise()` against the actual Boise clock before assuming the query is wrong.
- **Day-of-week session routing**: `lib/programming/schedule.js`'s `sessionNumberForDate()` maps Mon/Tue→1, Wed/Thu→2, Fri/Sat→3, Sunday→no session. `currentWeekNumber()` is `floor(daysSinceBlockStart / 7) + 1`, clamped to the program's block length — not calendar-Monday-aligned, just a flat day count from whatever date the block actually started.
- **Draft/publish lives on `group_workouts` (per session-per-week), not on `group_blocks`.** A block itself has no status; a coach can publish week 1 while week 3 is still a draft, and can edit a published week anytime with no locking.
- **Member RLS policies require `status = 'published'`** — draft workouts are invisible to members at the database level, not just hidden in the UI. If a member-facing query returns nothing unexpectedly, check whether the workout is actually published before debugging the query itself.
- **Cross-schema PostgREST embeds are avoided.** `programming.program_comments.coach_id` and `programming.logs.user_id` reference `core.users`, but the code fetches those separately and merges client-side (see `lib/programming/comments.js`) rather than relying on PostgREST's embedded-resource syntax across schemas — that reliability wasn't confirmed, so this sidesteps it entirely. Same-schema embeds (e.g. `group_workout_exercises` → `programming.exercises`) are used freely and work fine.
- **`.maybeSingle()` throws on 2+ rows, not just on error.** Any query using it needs a genuine guarantee of at-most-one-row, or an explicit `.order(...).limit(1)` before it. This was a real bug (see "Bugs found and fixed" below), not a hypothetical.

## Database migrations

Flat-numbered SQL files in `supabase/migrations/`, applied manually via the Supabase SQL Editor — no CLI/DB-password access is wired up in this environment, same as the Nutrition Tracker app's workflow. **All of 0001-0004 have been run** against the live project as of this writing:

- `0001_core_users_settings.sql` — `core` schema, `users`, `settings`, `is_staff()`/`is_admin()`, bootstrap-admin RLS policy
- `0002_push_tokens.sql` — `core.push_tokens`
- `0003_schema_grants.sql` — **required after 0001**, and required again after any migration adds tables to a schema that isn't `public`. Supabase auto-grants `public` schema access to the `anon`/`authenticated` roles, but custom schemas need it explicitly (`grant usage on schema ... to anon, authenticated, service_role` + table grants) or every query 403s with "permission denied for schema X" even though RLS policies are otherwise correct. `alter default privileges` in this migration covers future tables *in that schema*, but 0004 still repeated the explicit grants defensively — do the same in future schema-adding migrations rather than assuming the default-privileges line has you covered.
- `0004_programming_group.sql` — `programming` schema: `exercises`, `group_programs` (seeded Flagship/BWA), `group_blocks`, `group_workouts`, `group_workout_warmups`, `group_workout_exercises`, `client_program_assignments`, `logs`, `program_comments` (group-only for now — will need an `alter table` + relaxed check constraint once SPC's `spc_blocks` exists in a later migration, per the plan's original note about sequencing SPC before the comments table).
- `0005_nutrition_core.sql` — **run against the live project.** `nutrition` schema: `nutrition_clients`, `targets` (insert-only/versioned), `daily_logs` (nullable macro columns by design — see "Bugs found and fixed"), `checkin_template_questions`, `client_checkin_questions`, `checkin_responses`.
- `0006_programming_spc.sql` — **run against the live project.** `programming` schema additions for SPC: `spc_clients`, `spc_blocks`, `spc_workouts` (one row per session, no `week_number` — unlike group, weeks live as columns), `spc_workout_warmups`, `spc_workout_exercises`, `spc_exercise_weeks` (per-week sets/reps/rest + app-stamped `coach_initials`/`touched_date`). Also widens `program_comments` with a nullable `spc_block_id` + a check constraint requiring exactly one of `group_block_id`/`spc_block_id`, per the note left in `0004`'s header.

**After running any migration that adds new tables**, PostgREST's schema cache needs a nudge — it doesn't pick up new tables automatically. Run `NOTIFY pgrst, 'reload schema';` in the SQL Editor immediately after. If that doesn't seem to take effect, check the Data API settings page (Project Settings → API) for a manual reload button, or just wait a minute for PostgREST's own timer. This bit us once (see below) — mention it proactively next time rather than waiting for a "table not found" error to prompt it.

## Bugs found and fixed during Phase 1-3 build/test

Worth knowing about since they're the kind of thing that could resurface in a similar shape elsewhere in the codebase:

- **Missing table-level GRANTs on custom schemas** — see 0003 above. First real error hit: `permission denied for schema core` (Postgres code 42501).
- **PostgREST schema cache staleness** — `Could not find the table 'programming.exercises' in the schema cache` (PGRST205) right after running 0004, even though the table existed. Fixed by `NOTIFY pgrst, 'reload schema'`.
- **`getCurrentBlock`'s `.maybeSingle()` threw when two blocks for the same program both matched "today"** (happened naturally during testing once real elapsed time caught up to a second test block's start date) — this doesn't error loudly, it hangs the caller on an unhandled promise rejection since the member screens' `load()` functions didn't have a try/catch. Fixed in `lib/programming/memberPlan.js` with `.order("block_start_date", { ascending: false }).limit(1)` before `.maybeSingle()`, and added `try/catch` + an error state to both `app/(member)/index.js` and `app/(member)/plan.js` so a future unexpected failure surfaces a message instead of an infinite spinner.
- **`npm install` with `--legacy-peer-deps` repeatedly, silently dropped already-installed transitive dependencies from `node_modules`** (`babel-preset-expo`, `@expo/metro-runtime`, `react-native-worklets` each hit this at different points) even though `npm ls` still reported them as present in the logical tree. Symptom: Metro bundling fails with `Cannot find module 'X'` for a package you never touched. This is caused by the peer-dependency conflict between the pinned `react@19.2.3` and a newer `react-dom@19.2.7` that `expo-router`'s bundled `@expo/ui`/web-tooling pulls in transitively (`vaul`/`@radix-ui/*` — this is dev-only web-preview tooling inside expo-router itself, unrelated to anything this app actually uses). **If you hit a "module not found" error for a package that should already be installed**, don't chase it file-by-file — `rm -rf node_modules package-lock.json && npm install --legacy-peer-deps` from scratch reliably fixes it. Always verify critical packages are physically present after any install (`ls node_modules/<pkg>`), not just logically present per `npm ls`.
- **`react-native-reanimated@4` requires a separate `react-native-worklets` package** — it was split out in v4, unlike earlier versions where the worklets plugin shipped inside reanimated itself.
- **Metro was scanning `supabase/functions/**` (Deno Edge Functions, `.ts`)** and both (a) tripping Expo CLI's "are you using TypeScript?" auto-detection and (b) attempting to bundle a `.ts` file that isn't part of the app. Fixed with `config.resolver.blockList = [/supabase\/functions\/.*/]` in `metro.config.js`. `typescript` is still installed as a dependency (required once any `.ts` file exists anywhere in the project, even an unbundled Edge Function) but the app itself is plain JS.
- **Nutrition screens' initial load effects had no error handling** — before the nutrition migration was run, every nutrition screen's data-fetch threw (table not found), and since `useEffect`'s async IIFE had no `try/catch`, `setReady(true)` never ran and the screen hung on an infinite spinner instead of surfacing an error. Same class of bug as the `.maybeSingle()` issue above. Fixed by adding `try/catch` + a `loadError` state to all six nutrition screens (`app/(member)/nutrition/*`, `app/(coach)/nutrition/*`), matching the existing pattern in `app/(member)/index.js`/`plan.js`.
- **The SPC print view's week-column table headers used shorthand `<>...</>` fragments inside a `.map()` with the `key` prop placed on the children instead of the fragment itself** — shorthand fragments can't take props at all, so React silently dropped the keys and warned about it in the console (intermittently, since it's a dev-only warning). Fixed by switching to explicit `<Fragment key={...}>` from `react` in `app/(coach)/spc/print/[blockId].web.js`. Worth remembering as a general rule: any `.map()` that returns multiple sibling elements needs the explicit `Fragment` import with the key on the fragment, not shorthand `<>`.
- **A new cross-module `Promise.all` almost broke an already-working screen** — the first draft of the nutrition-assignment addition to `app/(coach)/clients/index.js` put the new `listNutritionClients()` call in the same `Promise.all` as the pre-existing `listMembers()`/`listAssignments()`/`listGroupPrograms()` calls. `Promise.all` is all-or-nothing: until migration 0005 was run, the nutrition call's failure would have taken down the entire Clients page, which has nothing to do with nutrition and was already working in production. Fixed by isolating the nutrition call in its own `try/catch` with an empty-array fallback, decoupled from the original `Promise.all`. Worth remembering as a general pattern: adding a new, not-yet-migrated data source to an existing screen's load function should never share a `Promise.all` with that screen's already-working calls.
- **The browser automation tool's composite drag gesture doesn't reliably trigger `dnd-kit`'s `PointerSensor`** — a single synthetic "drag" action doesn't fire enough intermediate `pointermove` events for the sensor's activation-distance check. Verified the real drag-and-drop code path works by dispatching a manual `pointerdown`/`pointermove`×N/`pointerup` sequence via `dispatchEvent` directly on the actual draggable/droppable DOM elements (not `elementFromPoint`, which can hit the wrong descendant). This is a testing-tool limitation, not an app bug — real mouse/touch input doesn't have this problem.

## Manual/deferred setup (not done in this environment)

- **`supabase/functions/send-push/index.ts` is written but not deployed.** Needs `supabase login` + `supabase functions deploy send-push` from a real terminal with Supabase CLI access. Explicitly deferred per user request as of the last session — don't deploy without asking again.
- **`eas init` hasn't been run** — no EAS project ID exists yet, so `registerPushToken()` in `lib/notifications/registerPushToken.js` will log a warning and return `null` on a real device until this is done (it already no-ops gracefully on web, which is correct/expected).
- **No Apple Developer Program / Google Play Developer account set up yet** (build-plan.md's "Phase 0").
- **Universal Links not configured** (`apple-app-site-association`/`assetlinks.json` hosting) — native invite/password-reset deep linking is unverified. `app.json`'s `scheme: "kovastrength"` gives a working custom-scheme fallback today.
- **No device/simulator testing has happened at all** — everything verified so far is the Expo web build, viewed through this sandboxed environment's browser preview. The native `[workoutId].js` builder screen, native push, and the whole native auth deep-link flow are code-complete but visually unverified.

## Test accounts (real accounts in the live shared Supabase project, not mocks)

- **Admin**: `terra@kovastrength.com` — bootstraps automatically on first login via `EXPO_PUBLIC_ADMIN_EMAIL`.
- **Member**: `dustin@kovastrength.com` — same account Nutrition Tracker uses as its test client (shared `auth.users`, confirmed by a real "Invalid login credentials" response before he was linked here). Linked to a `core.users` profile via the admin-only "Link account" flow (`app/(coach)/clients/LinkMemberModal.js`) since there's no self-serve signup and the email-invite Edge Function isn't deployed yet — this manual-UUID-paste bridge is intentional interim scaffolding, described in the code comments in `lib/programming/clients.js`. Assigned to Flagship.
- Two test Flagship blocks exist in the live DB as of this writing (one starting 2026-07-21, one starting 2026-07-20) — both have Week 1 / Session 1 published with the same three exercises (Barbell Bench Press, Goblet Squat, Seated Cable Row) for manual testing. Real coach usage will eventually want these cleaned up; not urgent.
- **Nutrition QA accounts** (dedicated synthetic accounts, kept separate from Terra's/Dustin's real accounts so repeated automated testing never touches them): `test1@kovastrength.com` (`role: member`) and `test2@kovastrength.com` (`role: coach`) — role was set directly via SQL (`update core.users set role = 'coach' where email = ...`) since the app's own "+ Link account" flow always creates `role: member` and has no coach-creation path (`linkMemberByAuthId` in `lib/programming/clients.js` hardcodes it). Test1 is assigned to nutrition, has an active target (P150/C140/F50/Fiber25, effective 2026-07-21), a finalized daily log, and a submitted+finalized weekly check-in — full core-loop verification was run against these two accounts.

## Deployment

Not deployed anywhere yet — everything so far is local dev server only (`npx expo start --web`, port 8081, `.claude/launch.json` target `kova-strength-web`). No Vercel/EAS build has been attempted.

## Working notes for future sessions

- **No DB credentials available** in this environment — always ask the user to run new migration files in the Supabase SQL Editor, and proactively remind them about `NOTIFY pgrst, 'reload schema'` afterward rather than waiting for a confusing PGRST205 error to prompt the question.
- **No device/simulator access** — native-only features (push, native builder screen, deep links) can be code-reviewed and bundle-checked (Metro will still catch syntax errors) but not visually verified. Say so plainly rather than implying they've been tested.
- **Self-testing trick for auth**, mirroring Nutrition Tracker's pattern: a signed-in user's own `id`/`email` can be read straight out of `window.localStorage`'s `sb-<project-ref>-auth-token` entry via `javascript_tool` — this is how Dustin's UUID was retrieved to link his test account, without needing dashboard access.
- **Debugging network calls in the web preview**: `read_network_requests` doesn't reliably capture this app's Supabase calls. Instead, monkey-patch `window.fetch` via `javascript_tool` before triggering the action (must be done on the page *before* a client-side navigation, since a full page reload resets the patch), then inspect the captured `{url, status, body}` array afterward.
