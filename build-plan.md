# Kova Strength Unified App — Build Plan (v2: native + web, Programming + Nutrition)

_Copied into the repo from `/Users/Dustin/.claude/plans/alright-check-out-the-nested-meerkat.md` so it travels with the code. See [CLAUDE.md](CLAUDE.md) for current build status against this plan._

## Context

This plan started as a single web PWA to replace TrueCoach. It has grown in scope: Terra wants to minimize the number of separate applications her clients and coaches juggle — no separate gym-management app, nutrition app, and programming app. The target is now **one application** covering Programming (the TrueCoach replacement — the larger, more urgent piece, ~150 Flagship + ~60 SPC clients) and a rebuilt core of Nutrition Tracker (currently a separate live web app for ~10-30 clients), shipped as **real native iOS and Android apps plus a web experience for coaches doing heavier desktop work**, all behind one login with role-gated access (member vs. coach/admin).

Two hard constraints shape this plan:
1. **The existing Nutrition Tracker web app (`/Users/Dustin/Claude Code/Nutrition Tracker`) is not touched.** It keeps running in production for its current clients, untouched, until the new unified app's nutrition module is ready and a real data migration is done. This plan builds entirely new tables for the new app's nutrition module — nothing here reads or writes the old app's `public.*` schema.
2. **Terra wants to test the new app as a real application — including the nutrition side — before committing further**, not just see Programming in isolation. So the nutrition module isn't a "someday" phase; it's core-loop scope now (daily logging, targets, weekly check-in), with progress photos and push reminders deferred to a later pass once the merged-app concept is proven out.

The original spec ([gym-app-spec.md](gym-app-spec.md)) still governs Programming's feature scope and data model — that content doesn't change here. What changes is the delivery platform (native + web instead of a web-only PWA) and the addition of a second module sharing the same app shell, login, and Supabase project.

## Decisions locked in this session

- **Platform: Expo (React Native) + Expo Router, targeting iOS, Android, and web (via `react-native-web`) from one codebase.** This is the current, standard way to get all three targets from one codebase (Expo SDK 57, stable as of this research). Confirmed Supabase's JS client works the same way in this environment as in Next.js — same Postgres/Auth/Storage/Realtime, different session-storage wiring (below).
- **One app, role-gated, not two apps — and the coach/native split is a real feature difference, not just a layout difference.** Terra's explicit framing: coaches do the **majority of real program-building work on the web build**. The native app's coach experience is for viewing plans/rosters, making quick/light on-the-go adjustments, and receiving push notifications about program status (blocks due, needs printed, etc.) — it is not a lightweight clone of the full builder. This simplifies the native coach surface considerably: it needs solid read views, simple edit controls (steppers, dropdowns, text fields), and reliable push — not the builder's full interaction model.
- **Nutrition module scope for v1: core loop only** — daily logging, targets (versioned, as the current app does it), weekly check-in. Progress photos and push reminders are explicitly deferred until after Programming ships and the combined-app concept is validated with real use.
- **Drag-and-drop is web-only — this removes the biggest risk from the plan.** Since coaches build programs on the web, the split-screen builder's drag-and-drop only needs to run in the Expo web build, where `dnd-kit` (the original, proven, actively-maintained library) works fine — `react-native-web` renders real DOM elements underneath, which is all `dnd-kit`'s pointer-based sensors need. No cross-platform drag library, no `react-native-drax` spike, no gesture-handler fallback plan required at all. The native app's builder-adjacent screens use ordinary native controls instead: a searchable dropdown/picker to insert an exercise, numeric steppers for sets/reps, and either simple up/down move buttons or a plain single-list native reorder (well-supported, no cross-container complexity) for quick tweaks on the go.
- **Push notifications: native only, one system.** Since coaches only need push on the app side (not the web build), this is just `expo-notifications` → Expo's push service → APNs/FCM — no Web Push/VAPID implementation needed for v1. Drives the SPC block-due/status alerts (Phase 6) and, later, nutrition reminders.
- **Auth: Supabase's `LargeSecureStore` pattern, not raw `expo-secure-store`.** Plain SecureStore has a 2048-byte per-item limit (iOS Keychain constraint) that a full Supabase session object routinely exceeds. The correct pattern: a 256-bit AES key in SecureStore, the actual session AES-256-CTR-encrypted into AsyncStorage. `detectSessionInUrl: false`, `autoRefreshToken` tied to `AppState` foreground/background — same as web's proven pattern, different storage layer.
- **Native invite/password-reset needs its own mini-project: Universal Links, not a custom URL scheme.** A custom scheme (`kovastrength://`) is simple but spoofable by any app registering the same scheme. Universal Links (iOS) / App Links (Android) require hosting `apple-app-site-association` and `assetlinks.json` on a domain you control — straightforward once the web build is deployed to Vercel, since serving well-known files there is trivial — and they have a real practical benefit: the same HTTPS link gracefully falls back to the web app if the native app isn't installed. Budget real QA time here regardless — this flow is reported as genuinely flaky across the ecosystem; if it proves unreliable, the fallback is an in-app "enter the code from your email" flow instead of relying on OS link routing.

## Architecture

### Schema layout (Supabase — same project as Nutrition Tracker, new schemas)

Restructured from the original plan now that two modules share one app: a shared identity layer instead of Programming owning `users` outright.

- **`core` schema** — shared by both modules: `users` (id → `auth.users`, name, email, `role` enum admin/coach/member, phone), `settings` (key/value), `is_staff()` / `is_admin()` security-definer helpers (same pattern as Nutrition Tracker's `is_coach()`, adapted for a role column rather than role-specific tables).
- **`programming` schema** — everything from the original Programming plan (exercises, group_programs/blocks/workouts, spc_* tables, client_program_assignments, logs, program_comments), FKs pointing at `core.users` instead of a schema-local users table. Full detail unchanged from the original data-model work — see "Programming module" below.
- **`nutrition` schema** (new, entirely separate from the old app's `public.*` tables) — core-loop only: `nutrition_clients` (user_id → `core.users`, assigned_coach_id → `core.users`, status), `targets` (versioned — every edit is a new row, mirrors the current app's proven pattern), `daily_logs` (weight/macros/steps/sleep), `checkin_templates` / `checkin_responses` (weekly check-in, template + per-client override pattern). No `photos` or `push_subscriptions` tables yet.

This keeps the live Nutrition Tracker's `public.coaches`/`public.clients`/etc. completely untouched. Migration to the new schema happens later, once the new app's nutrition module is validated — at that point, copy rows from `public.*` into `nutrition.*` and sunset the old app.

### App structure (Expo Router)

```
app/
  (auth)/
    login.js
    reset-password.js
    set-password.js
  (member)/                    # mobile-first, both modules
    index.js                    # today's session (Programming)
    plan.js                      # look-ahead
    history/...
  (coach)/                     # coach/admin — role-gated
    clients/...
    blocks/...
    builder/
      [workoutId].js            # native "view + quick adjust"
      [workoutId].web.js        # richer split-screen layout, desktop-targeted (dnd-kit)
    exercises/...
    settings.js
lib/
  supabase/
    client.js                  # LargeSecureStore wiring
  boiseDate.js                  # timezone-safe "today"
  programming/
    schedule.js                  # shared date-math util
  theme.js                      # brand tokens
```

Platform-specific files (`.web.js` vs. default) are Expo Router's actual mechanism for a genuinely different layout per platform at the same route — this is not automatic responsiveness, it's real separate layout code sharing data/state logic only. The coach split-screen builder is the one screen that needs this; most other screens (client rosters, settings, exercise library CRUD) stay one shared layout with normal responsive styling.

**Styling**: NativeWind (Tailwind for React Native/Expo) — brand tokens (`#a46a57`/`#ad816d`/`#beac95`) and the Tailwind mental model carry over directly from the Next.js sibling app.

**Fonts**: Montserrat + Protest Strike via `@expo-google-fonts/*` packages.

### Programming module

Data model, RLS approach, and feature breakdown — see [CLAUDE.md](CLAUDE.md) for the as-built schema (it evolved slightly from this plan's sketch; CLAUDE.md is the source of truth for what's actually in the database). Full spec: [gym-app-spec.md](gym-app-spec.md) sections 3-9.

The exercise-library-panel-to-session drag interaction lives entirely in `[workoutId].web.js`, built with `dnd-kit`. The native `[workoutId].js` counterpart is a lighter "view + quick adjust" screen (dropdown/picker to insert, steppers for sets/reps, simple reorder), not a drag interaction at all.

### Nutrition module (core loop) — not yet built

- **Targets**: versioned exactly as the current app does it — every coach edit is a new row (old value, new value, date, note), never an in-place update. Calories derived from macros, not stored as free entry.
- **Daily Log**: autosave-on-change (debounced), separate "Finalize Day" action — same two-state model that fixed a real bug in the current app (autosave persisting partial entries without requiring all fields).
- **Weekly Check-In**: template + per-client override, global Monday–Sunday cycle (not a per-client rollover day) — this is a deliberate improvement the current app already made after hitting a real misfiling bug with per-client cycles; carry it forward rather than reverting to the simpler-sounding original design.
- Coach-side: a trimmed dashboard (current targets, this-week-vs-last-week, check-in status) — full weekly rollup math (`lib/weeklyRollup.js`-equivalent) can be ported directly, it's pure date/aggregation logic with no photo/push dependency.

## Build order — status

0. ⏳ **Parallel/admin track, not blocking engineering**: Apple Developer Program enrollment, Google Play Developer account, Universal Links domain decision. Not started.
1. ✅ **Foundation**: Expo app scaffold, NativeWind, `core` schema + auth (LargeSecureStore), role-gated routing shell, brand theme/fonts, settings, push plumbing (device registration + `send-push` Edge Function — written but **not yet deployed**).
2. ✅ **Programming — Workout Builder**: `programming` schema, exercise library CRUD + video links, web split-screen builder (`dnd-kit`) + native view/quick-adjust screen, live pattern tally, draft/publish, comments.
3. ✅ **Programming — Group Programming + Client Portal**: block creation + session grid, member-facing "today's session" with day-of-week routing, full look-ahead, exercise history, result logging.
4. ✅ **Nutrition — core loop module**: schema, `lib/nutrition/*`, member + coach screens. Verified end-to-end against dedicated QA test accounts (see CLAUDE.md's "Test accounts").
5. ✅ **Programming — SPC**: `spc_clients`/`spc_blocks`/`spc_workouts` schema (per-session, week 1-N progression as columns not rows), coach dashboard grouped by coach with the 5 spec statuses, client detail (notes/goals/status/coach reassignment/sessions-per-week), web builder with per-week sets/reps/rest + auto-stamped coach initials/date, native quick-adjust with a week selector, web-only print/export view matching the paper template, client-side block-ending auto-draft (computed on dashboard load, since there's no server cron yet). Member portal now shows SPC sessions alongside group programs for Hybrid clients.
6. ⏳ **Coach push notifications**: server side is deployed and live (`supabase/functions/scan-spc-alerts` + `pg_cron` job, see CLAUDE.md) — the daily scan/auto-draft/push-attempt is genuinely running in production. Still blocked on device delivery: `eas init` hasn't been run, and iOS additionally needs Apple Developer Program enrollment (Phase 0).
7. ⏳ **Later, explicitly deferred**: Kiosk Mode, CRM/GoHighLevel integration, Nutrition photos + push reminders, real data migration off the old Nutrition Tracker app and its retirement.

## Verification

- Phase 1: ✅ web login verified against the real Supabase project. Real device test (not just simulator) of the auth flow including a real invite email → Universal Link → app open, on both iOS and Android — **not done, no device/simulator access in this environment**. Real test push to a physical device — **not done**, same reason plus `eas init` hasn't been run.
- Phase 2: ✅ built a real Flagship week end-to-end on the coach web builder (dragged exercises via `dnd-kit`, reordered, published) — confirmed via direct pointer-event dispatch since the browser automation tool's composite drag gesture doesn't fire enough pointermove events for `dnd-kit`'s sensor. Native view — code complete, **not visually verified** (needs a device/simulator).
- Phase 3: ✅ confirmed a member sees a published block correctly in the web build including full look-ahead across all weeks, with day-of-week session routing landing on the right session, logged a real result, confirmed it in history. Native — not visually verified.
- Phase 4: ✅ verified end-to-end against the QA coach/member accounts — assigned the QA member to nutrition, set their first target (calorie derivation confirmed correct), logged a partial day (weight/sleep only, no macros) and confirmed autosave persisted it without error, confirmed Finalize was blocked with the soft inline error until macros were filled in, finalized the day, submitted a weekly check-in and confirmed `week_start` landed on the correct Monday for the day it was submitted, and confirmed the coach roster dashboard and per-client detail page correctly tracked status through pending → ready → completed as each step happened. Native — not visually verified (no device/simulator access).
- Phase 5: ✅ verified against the live web build by the user directly (Claude cannot enter account passwords into the login form, so this pass was user-driven rather than browser-automated) — clicked through the SPC dashboard, client detail, block builder, and print/export view. One real bug found and fixed: the print view's week-column table headers used shorthand JSX fragments with misplaced `key` props, causing an intermittent React console warning (see CLAUDE.md's "Bugs found and fixed"). Native builder/print screens — code-reviewed and bundle-checked only, no device/simulator access.
- Phase 6: not applicable yet.
- Use the `run` skill / Expo's dev client to actually launch and click through each phase on a real or simulated device rather than relying on type-checking alone.
