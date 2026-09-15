@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What this is

The Kova Strength unified app — replaces TrueCoach for programming (~150 Flagship + ~60 SPC clients) and will eventually absorb the separate Nutrition Tracker app's core loop too, all behind one login. Ships as native iOS/Android apps plus a web build, from one Expo codebase. Coaches do the majority of real program-building work on the web build; the native app is for members' day-to-day use and coaches' light on-the-go adjustments + push notifications.

Full build plan: [build-plan.md](build-plan.md) — read this first, it covers the architecture decisions and why (native+web from one codebase, drag-and-drop web-only, shared-Supabase-project-with-new-schemas, etc.). Programming's feature spec: [gym-app-spec.md](gym-app-spec.md).

**Status**: Phases 1-5 built and verified (Foundation, Workout Builder, Group Programming + Client Portal, Nutrition core loop, SPC). See build-plan.md's "Build order — status" section for the current checklist.

**Superseded**: Nutrition was originally a one-time port of the standalone Nutrition Tracker app's core-loop logic against Kova's own placeholder `nutrition.*` schema — that's gone. As of 2026-08-02, Kova's nutrition module reads/writes the exact same live `public.*` tables the standalone app itself uses (same Supabase project, different schema) — see "Nutrition rebuilt against the standalone app's live tables" below for the full rebuild, including onboarding, photos, and the coach's full 6-tab client detail page. The old `nutrition.*` schema and its `lib/nutrition/*` placeholder functions are dead code, left inert rather than dropped.

## Where the history lives (read before changing a feature)

Every feature's full history (what was built, why it is shaped that way, the bugs it hit, and what was verified) lives in `docs/`, moved there verbatim on 2026-09-14 so it doesn't load into every conversation. **Nothing was cut.** Before changing a feature, read its file: it is what tells you how things connect and why they're set up the way they are.

| Working on | Read |
|---|---|
| My Week, My Fitness, logging, ExerciseCard, rest timer, My History, member auth screens, keyboards, Dynamic Type, Benchmark Day, Conditioning, lift photos, TrueCoach import | [docs/history/member-app.md](docs/history/member-app.md) |
| Coach Home/dashboard, Clients, Settings, permissions & dual-login, exercise library (review, parents, merge), session builders, Coach Prep, staff documents, CoachShell | [docs/history/coach-web.md](docs/history/coach-web.md) |
| Group programs, blocks, Monday starts, block length, "End here" | [docs/history/group-programs.md](docs/history/group-programs.md) |
| SPC roster, SPC client page, statuses, sessions-format model & cutover, printing, alternate programming, one-offs, program length | [docs/history/spc.md](docs/history/spc.md) |
| The live board / wall display, staging, make-ups, board history, LLYL on the board | [docs/history/live-hub.md](docs/history/live-hub.md) |
| Anything nutrition: coach record tabs, onboarding, check-ins, photos & framing, Weeks tab, roster queue, member nutrition tabs | [docs/history/nutrition.md](docs/history/nutrition.md) |
| Payroll (staff and admin) | [docs/history/payroll.md](docs/history/payroll.md) |
| Push, web push, announcements, messaging, events | [docs/history/messaging-notifications-events.md](docs/history/messaging-notifications-events.md) |
| Auth & sign-out bugs, GHL import/registration, audits, error reporting, PWA, iOS device builds, test accounts, deferred setup | [docs/history/platform-auth-infra.md](docs/history/platform-auth-infra.md) |
| Any migration: what's run, what each did, ordering traps | [docs/migrations.md](docs/migrations.md) |

A feature often spans files (SPC touches spc.md and live-hub.md; nutrition photos touch nutrition.md and member-app.md). When unsure, grep `docs/` for the table, component, or function name.

### Keeping this organized (for future sessions)

- **New work goes into the matching `docs/` file, not this one.** Add a `## Title (date)` section at the end of that file, or amend an existing section if it's a follow-up. New migrations go in `docs/migrations.md`.
- **Start a new file only when a new area doesn't fit any existing one** (a whole new module, say). Name it `docs/history/<area>.md`, give it the same one-paragraph header the others have, and add a row to the table above. Don't create a file for a one-off fix; that belongs in the closest area.
- **If a history file gets unwieldy** (roughly 300 KB), split it by sub-area the same way this one was split: move sections verbatim, keep their order, and update the table.
- **This file stays short.** Only things every session needs belong here: stack, commands, verification bar, house rules, and the standing gotchas below. If a lesson is broad enough that forgetting it would break an unrelated screen, add a one-line bullet to Standing gotchas pointing at the full write-up.

## Standing gotchas (one line each; the full story is in the linked history)

- **Never hand a `Pressable` a function `style`** on native (NativeWind drops it). Use `components/PressFade.js`, and never pass PressFade a style array. *(member-app: v5 pass)*
- **Never put `StyleSheet.absoluteFillObject` inside a style array**; it renders invisible on Fabric. Write the four edges out. *(member-app: My Fitness follow-up)*
- **A `.web.js` sibling shadows the native file at every web width**, phones included, so it needs its own `MOBILE_BREAKPOINT` branch; and never import the native sibling from inside the `.web.js` (it self-resolves and crash-loops). *(member-app: Last time)*
- **`router.back()` is unreliable across tab stacks**; carry the origin. On web a nested dynamic route push keeps the index mounted, so use `useFocusEffect`, not a mount-only effect. *(member-app: Last time; nutrition: roster reloads)*
- **RNW:** bare `flex: 0` collapses a width (use `flexGrow/flexShrink: 0`); a `" "` in a `numberOfLines={1}` Text has zero height; inputs need `minWidth: 0`; a row needs `flexShrink: 1` + `minWidth: 0` for `flex-wrap` to engage; `scrollTo({animated:true})` is cancelled on a `pagingEnabled` ScrollView; `onMomentumScrollEnd` never fires; `keyboardDismissMode="on-drag"` blurs inputs on web. *(coach-web, spc, platform)*
- **Never auto-grow a multiline TextInput off `onContentSizeChange` on web**; fixed height and scroll. *(spc: blank screen; nutrition: notes autosave)*
- **Never derive a box's height from a measurement of its own width** when the page can gain a scrollbar. *(nutrition: photo vibration)*
- **`:focus:not(:focus-visible)` does nothing for text fields**; style focus positively. *(member-app: Safari blue boxes)*
- **Non-blocking overlays go through `PassThroughOverlay`**, never a plain RN `Modal` on web (it eats every touch). *(member-app: non-blocking overlays)*
- **An RLS-filtered UPDATE reports success with 0 rows**; select the row back and throw on none. *(coach-web: RLS-filtered write)*
- **PostgREST rejects a write naming a column the table lacks, even with null**, and embeds fail at runtime, not build. Curl new selects first. *(coach-web: shared editor columns)*
- **Never widen a unique index an `ON CONFLICT` column list names** in the same step as a deploy. *(spc: alternate programming)*
- **`supabase secrets list` prints SHA-256 digests, not values**; a pg_net cron can 401 forever while `cron.job_run_details` says success. Check `net._http_response`. *(messaging: popup and push)*
- **Don't rename/drop a schema listed in Exposed schemas**; rename its tables instead. *(platform: backend audit follow-up)*
- **Under the SPC sessions format a workout id no longer means a week**; completions, ticks and notes must key on the week too. *(spc: workout id)*
- **Dates:** `todayInBoise()` / `dateInBoise()`, never `new Date()` or `.slice(0,10)` on a timestamptz. The five `daysBetween` copies disagree on rounding. *(Key architectural decisions; member-app: Last time)*
- **A clean `expo export` proves little**: also run a Babel parse, unresolved-identifier, unused-import and missing-named-export pass. *(Commands; coach-web: dashboard redesign)*
- **Browser pane (hidden):** rAF, ResizeObserver (`onLayout`), scroll events and timers are frozen or throttled, `innerText` is empty, `innerWidth` can read 0. Don't diagnose animation or layout bugs from it alone. *(several)*

## Commands

```
npm install         # install dependencies — see "npm install gotcha" below, use --legacy-peer-deps
npx expo start --web   # web dev server (this repo's `run` skill / .claude/launch.json target: kova-strength-web)
npx expo start       # native dev server (needs a device/simulator — not available in this sandboxed environment)
npm run build        # what Vercel runs: expo export -p web, then the route guard below
npm run check:routes # fails if a dynamic route has no vercel.json rewrite (needs a built dist/)
```

No lint/test scripts. `npm run build` is the closest thing to CI — it is the
real production build command (Vercel prefers a `build` script over its own
detected Expo command) and it gates on `scripts/check-vercel-rewrites.mjs`, so
a dynamic route shipped without a rewrite fails the deploy instead of 404ing
for whoever follows a link to it. See the first-run-audit section below.

**Verification bar for any change here, in order of strength:** run
`npm run build`; then a Babel parse + unresolved-identifier pass over every
touched file (**a clean export is weaker evidence than it looks — Metro neither
parses every file you touched nor resolves identifiers**, and this has hidden a
missing import and a missing helper more than once); then, where the screen is
reachable, actually drive it. Signed-out screens (`/login`, `/register`,
`/reset-password`, `/set-password`, `/support`) can be driven directly; for
anything behind a login, render the component through a throwaway top-level
route such as `app/zz-harness.js` and delete it afterwards — preferred over
mounting on `login.js`, since deleting it cannot leave sign-in broken.

## Tech stack

- **Frontend**: Expo SDK 57, Expo Router (file-based, route groups for `(auth)`/`(member)`/`(coach)`), React 19, React Native 0.86, plain `.js` (no TypeScript, except Edge Functions which are Deno/TS by necessity)
- **Styling**: NativeWind v4 (Tailwind for RN) — `tailwind.config.js` has the brand tokens, `global.css` has the `@tailwind` directives, `babel.config.js`/`metro.config.js` wire it up
- **Backend**: Supabase (Postgres + Auth), same project as the Nutrition Tracker app (`rtgwhchycfnfvwagilkw`). `core`/`programming` are Kova-owned schemas. **Nutrition is the one exception to "never touch Nutrition Tracker's tables"**: as of 2026-08-02 the nutrition module reads/writes that app's live `public.*` tables directly (see the nutrition-rebuild section below) — the old Kova-owned `nutrition.*` schema is dead/unused.
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

- **Schema split**: `core.users` (role: admin/coach/member) is the shared identity layer Programming reads. `programming.*` owns everything Programming-specific. **Nutrition is the exception**: it reads/writes the standalone Nutrition Tracker app's own `public.coaches`/`public.clients`/etc. tables directly (a Kova coach needs a matching `public.coaches` row, a Kova member needs a matching `public.clients` row — see the nutrition-rebuild section below for how those get provisioned) rather than having its own Kova-owned schema. Programming/core are still deliberately separate from `public.*` — this exception is nutrition-only.
- **Timezone discipline**: `lib/boiseDate.js`'s `todayInBoise()` is the only correct way to get "today" anywhere in this app — never `new Date()` directly, never trust device local time. This already caught a real issue during testing: a block's `block_start_date` set to what looked like "today" in the UI was actually the next calendar day in Boise time (the browser's system clock was UTC-ahead), and the app correctly refused to show it as active. That's the timezone logic working as intended, not a bug — if a block/session isn't showing up when you expect, check `todayInBoise()` against the actual Boise clock before assuming the query is wrong.
- **Day-of-week session routing**: `lib/programming/schedule.js`'s `sessionNumberForDate()` maps Mon/Tue→1, Wed/Thu→2, Fri/Sat→3, Sunday→no session. `currentWeekNumber()` is `floor(daysSinceBlockStart / 7) + 1`, clamped to the program's block length — not calendar-Monday-aligned, just a flat day count from whatever date the block actually started.
- **Draft/publish lives on `group_workouts` (per session-per-week), not on `group_blocks`.** A block itself has no status; a coach can publish week 1 while week 3 is still a draft, and can edit a published week anytime with no locking.
- **Member RLS policies require `status = 'published'`** — draft workouts are invisible to members at the database level, not just hidden in the UI. If a member-facing query returns nothing unexpectedly, check whether the workout is actually published before debugging the query itself.
- **Cross-schema PostgREST embeds are avoided.** `programming.program_comments.coach_id` and `programming.logs.user_id` reference `core.users`, but the code fetches those separately and merges client-side (see `lib/programming/comments.js`) rather than relying on PostgREST's embedded-resource syntax across schemas — that reliability wasn't confirmed, so this sidesteps it entirely. Same-schema embeds (e.g. `group_workout_exercises` → `programming.exercises`) are used freely and work fine.
- **`.maybeSingle()` throws on 2+ rows, not just on error.** Any query using it needs a genuine guarantee of at-most-one-row, or an explicit `.order(...).limit(1)` before it. This was a real bug (see "Bugs found and fixed" below), not a hypothetical.

## House rule: every disabled button must dim (2026-08-13)

**`disabled:opacity-50` does nothing. Never use it.** NativeWind sets
`aria-disabled` but leaves computed opacity at 1 — measured in the browser,
not inferred. A disabled button therefore rendered fully saturated, so it
read as "tapping does nothing" rather than "you're not done yet." That is
the same bug class as the nutrition Finalize button (see the check-in
section above), and it had spread to 34 buttons across the app.

**The rule for any new button:** if it takes a `disabled` prop, it dims
itself with a real inline style. Two shapes, both fine:

```jsx
// no existing style
<Pressable onPress={save} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>

// existing style — merge, don't replace
<Pressable disabled={d} style={{ opacity: d ? 0.5 : 1, backgroundColor: colors.primary }}>
```

When a call site already dims for its own reason, put the `disabled`
dimming **first** in a style array so the existing rule still wins:
`style={[{ opacity: busy ? 0.5 : 1 }, !ready ? { opacity: 0.5 } : undefined]}`
— RN merges left to right. That's what keeps the member check-in Finalize
button (deliberately *not* disabled by readiness, so tapping explains what's
missing) behaving exactly as before.

**This was deliberately NOT done as a Babel plugin**, unlike
`noAutofillPlugin.js`/`maxFontSizeMultiplierPlugin.js`, and the idea should
not be revived without re-reading this. 83 `Pressable`s take `disabled`, and
the prop carries at least three different meanings:
1. **unavailable** — missing info, or a boundary (`atTop`, `clampedPage <= 1`,
   `i === 0` on a reorder arrow). Dimming is right.
2. **busy** — `saving`/`submitting`/`uploading`. Dimming is right, and doubles
   as progress feedback.
3. **inert by design, but must still look normal.** Dimming is *wrong* here:
   `StaffPermissionMatrix`'s `disabled={isAdmin}` (an admin's checkboxes are
   checked-but-inert; dimming makes full access read as no access — the exact
   thing that design decision avoided), `RatingSquares`' `disabled={readOnly}`
   (a coach viewing a submitted rating; dimming makes real data look invalid),
   `MondayPicker`'s `disabled={!selectable}`, `AttentionAlerts`' `disabled={clear}`
   ("nothing needs attention" is a *good* state, not an unavailable one).

Some sites also already dim a **child** view, which no static transform can
see — `PermissionCheckbox` returns a plain `View` (not a Pressable) when
disabled, and its inner Pressable's box carries `opacity: saving ? 0.5 : 1`,
so an automatic wrapper-level dim would multiply to 0.25.

So the 34 conversions were scoped to elements that already carried
`disabled:opacity-50` — the author had already declared the intent, so
nothing had to be guessed — via a throwaway Babel codemod that located nodes
and applied precise text splices (whole-file regeneration would have
reformatted everything). None of the category-3 sites carried the class, so
none were touched. Verified: the object shape is runtime-confirmed on
login/register/reset-password (opacity 0.5 → 1 as conditions are met); the
two array-merge cases in `checkin.js` were checked by inspection across every
branch. Clean `expo export -p web`, and zero `disabled:opacity-50` left
outside explanatory comments.


## Deployment

Not deployed anywhere yet — everything so far is local dev server only (`npx expo start --web`, port 8081, `.claude/launch.json` target `kova-strength-web`). No Vercel/EAS build has been attempted.

**Stale as of 2026-08-04**: the web build actually is live, at `app.kovastrength.com` (Vercel project `kovaapp`, git-connected to `main` — see "iOS push confirmed live, Universal Links, GHL import groundwork" above for the deploy mechanics and the "don't run `vercel --prod` directly" lesson). This line just never got updated when that happened.

## Working notes for future sessions

- **Always record the session's work at the end of a session — it is not optional and
  it does not need asking for.** As of 2026-09-14 that means the matching `docs/` file (see "Where the history lives" above), not this file; the rest of this bullet predates the split and still applies, just to that file. Every feature has its own section, and
  the convention was obvious from the file's shape but never actually written
  down, which is how a session finished without one (2026-08-25) and had to be
  told. Add a section for what was built, add the migration to the ledger, and
  record any lesson that cost real time — especially the ones a future session
  would otherwise re-learn from scratch. If the work is a follow-up to an
  existing section, amend that section rather than appending a near-duplicate,
  and correct anything the session proved stale rather than leaving both
  versions standing.

- **No DB credentials available** in this environment — always ask the user to run new migration files in the Supabase SQL Editor, and proactively remind them about `NOTIFY pgrst, 'reload schema'` afterward rather than waiting for a confusing PGRST205 error to prompt the question. **Update 2026-08-04**: the Supabase CLI *was* authenticated in this particular session — `supabase functions deploy send-announcement` and `scan-announcements --no-verify-jwt` both succeeded directly, and `supabase secrets list` worked too (returns hashed values, not plaintext, so secrets still can't be read back). This is the same class of "don't assume the sandboxed limitation always holds — check first" exception as the physical-device session below. Still no direct Postgres access confirmed either way — migrations still went through the user's own SQL Editor this session, untested whether `supabase db push` or similar would also work.
- **No device/simulator access, normally** — native-only features (push, native builder screen, deep links) can be code-reviewed and bundle-checked (Metro will still catch syntax errors) but not visually verified. Say so plainly rather than implying they've been tested. One session was an exception (real Bash access to Dustin's actual Mac) — see "Physical iOS device builds" above for what that involved and what's durable vs. not.
- **Self-testing trick for auth**, mirroring Nutrition Tracker's pattern: a signed-in user's own `id`/`email` can be read straight out of `window.localStorage`'s `sb-<project-ref>-auth-token` entry via `javascript_tool` — this is how Dustin's UUID was retrieved to link his test account, without needing dashboard access.
- **Debugging network calls in the web preview**: `read_network_requests` doesn't reliably capture this app's Supabase calls. Instead, monkey-patch `window.fetch` via `javascript_tool` before triggering the action (must be done on the page *before* a client-side navigation, since a full page reload resets the patch), then inspect the captured `{url, status, body}` array afterward.
- **Commit straight to `main` — do not create a feature branch.** Every commit in this repo's history is on `main`, and Vercel's connected-repo auto-deploy watches `main`, so a branch just makes extra merge work for Terra. A generic "don't commit to the default branch" habit got applied once (2026-08-10, the v5 pass) and she flagged it immediately: *"im confused why you did it that way? never had that before."* Check `git log` for how this repo actually works before reaching for a default.
- **The iOS Simulator build tool is the reliable way to catch native-only bugs, and it's worth the ~2.5 minutes.** `mcp__Claude_Code_iOS_Simulator__build` against `ios/KovaStrength.xcworkspace` (scheme `KovaStrength`) produces a real simulator build; `control` launches and screenshots it. Combined with the standing login-screen harness trick (temporarily render the components under test on `app/(auth)/login.js` with fake data, revert after), this gives real native verification without needing to log in. This is what found the NativeWind `Pressable` style-function bug in the v5 pass after web verification had passed clean twice — see that section. **When a report is native-only and the web preview keeps passing, stop reasoning and go build it.**

- **`git push` is NOT reliably available even in a session where Supabase/Vercel/EAS CLIs are authenticated** — hit this for real 2026-08-07 (the Web Push session): `git push origin main` failed with `could not read Username for 'https://github.com': Device not configured` (no reachable `osxkeychain` entry for github.com, no `gh` CLI installed). Don't assume a push will succeed just because other tool auth has — commit locally, then explicitly tell the user the commit is local-only and ask them to push (or fix git credentials) rather than silently treating "committed" as "deployed." This matters more than usual for this project specifically, since Vercel's connected-repo auto-deploy is the *only* deploy path (see the "real Vercel-deploy lesson" note above) — a local-only commit means nothing shipped at all, not even a stale-but-present deploy.

- **Never commit unless Terra explicitly asks, and when you do, stage only the exact files you changed — never `git add -A`, `git add .`, or `git commit -a`.** Terra frequently runs **several sessions against this same working tree at once**, so at any moment another session may have unrelated files mid-edit, including throwaway test harnesses. Blanket staging sweeps them into your commit. This caused a real near-miss on 2026-08-10: a commit meant only for `lib/webAutofillSuppression.js` staged everything modified and picked up a temporary visual harness that had been mounted on `app/(auth)/login.js` (the standing preview trick documented above), plus two other files from a parallel session. That harness `return`s a static swatch page **before** the real login form — had it been pushed, every web user would have hit a dead sign-in screen. It was caught only because the other session went to revert its harness and found it already committed. Two habits prevent it: don't commit unasked, and always `git add <specific paths>`. Also worth a `git status` glance before committing — if files you never touched are modified, another session owns them, so leave them alone.
  - **And a third: stage and commit in ONE go, because staged files are not safe to leave sitting.** The hazard runs both ways. On 2026-09-06 five `components/hub/*` files were staged and then discussed with Terra for a couple of turns before committing; a parallel session ran its own blanket `git add` in that window and swept all five into **its** commit, which is named for a CLAUDE.md note. Nothing was lost and the code is intact, but it is filed under a message describing one of six files. **Do not rewrite another session's commit to fix this** — it is theirs and they may still be mid-flight. An empty follow-up commit carrying the real reasoning and naming the sweeping commit is the non-destructive repair (`d846fb3` → `0362797`), and it keeps the explanation next to the change in `git log`.

- **Test a pure helper against REAL data by running the shipped source, not a paraphrase.** `lib/programming/workouts.js`'s ordering helper was verified by reading the file in Node, slicing the function's own text out of it, `eval`ing that, and feeding it 38 real rows pulled from a live session in deliberately shuffled order — then comparing against the order a SQL query over the same block predicts. Copying the logic into a test file proves the copy works; this proves the shipped code does. Cheap whenever the thing under test is a pure function that doesn't need the Supabase client.

- **A PostgREST embed fails at RUNTIME, not at build.** A `.select("…, group_workouts(week_number), …")` with a relationship PostgREST can't resolve returns `PGRST200` when a user hits the screen — `expo export` and the Babel scope pass both stay clean. Confirm a new embed before relying on it by curling the REST endpoint with the anon key: `200 []` means the embed parsed (RLS just hid the rows), an error body means it didn't.

- **Dry-run a migration before applying it**, even an additive one: `{ echo "begin;"; cat supabase/migrations/00XX_*.sql; echo "rollback;"; } > /tmp/dry.sql && supabase db query --linked -f /tmp/dry.sql`, then confirm the object is still absent. Proves the whole script executes without leaving anything behind — which is exactly what caught the table-ordering bug in 0036 the hard way.

- **After dispatching synthetic events in the browser, `await` before reading state back.** React batches, so measuring in the same synchronous block as the `dispatchEvent` returns the *pre-update* DOM — this produced a confidently wrong "the clamp isn't working" reading during the rail-resizer work, twice, before a `setTimeout` between the dispatch and the assert showed it had been correct all along. Same trap as the ResizeObserver/rAF gaps already noted above: when a measurement disagrees with a screenshot, trust the screenshot and re-measure after a settle.

- **Prefer a throwaway top-level route over the login-screen harness.** A file
  like `app/zz-harness.js` (outside the `(auth)`/`(member)`/`(coach)` groups) is
  reachable unauthenticated exactly like `login.js`, renders whatever components
  you want to measure, and **deleting it cannot leave sign-in broken** — which is
  the entire failure mode of the trick below. Used this way on 2026-08-15 to
  measure `/register`'s code step without driving the real flow (which would have
  texted a real person). Same teardown discipline applies: delete it and check
  `git status` before committing.

- **The login-screen harness trick has a matching teardown obligation.** Mounting components on `app/(auth)/login.js` to preview them (documented above, genuinely useful and used repeatedly) leaves the sign-in screen broken until reverted. Back the file up first (`cp` to the scratchpad), revert immediately after screenshotting, and verify with `git diff -- "app/(auth)/login.js"` that it's actually clean — don't just assume the restore worked. The longer a harness sits on disk, the wider the window for a parallel session to commit it.
