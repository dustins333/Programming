# History: nutrition (coach record, onboarding, check-ins, photos, Weeks tab, member nutrition tabs)

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## Nutrition rebuilt against the standalone app's live tables (2026-08-02)

The placeholder "Nutrition v1" module (Kova's own `nutrition.*` schema, a minimal one-time port) is fully replaced. Terra's own framing for why: *"This is why we built this new app on the same Supabase DB... current clients using [the standalone] app can use that one up until the day this one is approved and then just make the switch, and it will all be the same."* Because Kova's nutrition screens now read/write the exact same live `public.*` tables the standalone Nutrition Tracker app itself uses, cutover for an existing client needs no data migration at all — just linking their Kova login to the row that already exists. The old `nutrition.*` schema and every `lib/nutrition/*` function pointed at it are dead code now, left inert rather than dropped (no rollback plan for dropping a schema, not worth the risk for pure cleanup credit).

**Schema bridge**: `public.coaches`/`public.clients` (the standalone app's own tables) require a matching row for `is_coach()`-gated RLS to pass — a Kova coach with no `public.coaches` row silently gets zero rows back from every query, not a loud error. Migration `0018_nutrition_coach_backfill.sql` (**run against the live project**) backfills one for every existing `core.users` coach/admin; going forward, `supabase/functions/invite-staff/index.ts` upserts one on every new-coach invite, and a new self-service `supabase/functions/ensure-nutrition-coach/index.ts` (called fire-and-forget from `AuthProvider.js` on every coach/admin login) covers accounts that never went through `invite-staff` at all (e.g. a role promoted via raw SQL, like the `test2@kovastrength.com` QA account).

**Client rollout — deliberately untouched by this build.** Three populations: (1) already a Kova member *and* already a standalone-app client (their `public.clients` row already exists — turning on the Nutrition switch just reactivates it, no onboarding replay); (2) already a Kova member, new to nutrition (gets a fresh `public.clients` row via `createOrReactivateClient` in `lib/nutrition/clients.js`, lands in onboarding); (3) **the real bulk of Terra's ~150-200 current clients — standalone-app-only, no Kova login at all.** Population 3 needs zero code changes here: Kova's `AuthProvider.js` only shows real content once a `core.users` row exists, and the only way to create one (`linkMemberByAuthId`) is a silent, admin-only, no-email database insert — so nobody in population 3 can see or be notified about Kova's existence until Terra explicitly links them, one at a time. Bulk-onboarding the rest is the separate, already-noted GHL+phone-OTP effort (below), not something this rebuild does.

**Coach roster** (`app/(coach)/nutrition/index.js` + new `index.web.js`) — repointed at `public.clients`/`public.coaches`/etc., with an "Onboarding" status added to the existing 5-tone `rosterStatus` bucketing. Web got the SPC dashboard's flat-grid treatment (`app/(coach)/spc/index.web.js`'s pattern, no drag-and-drop this time since nutrition status is fully computed, not coach-set): status tiles double as one-click filter chips, a coach filter + sort dropdown, one table listing everyone — replacing an earlier filter-chip-row-plus-card-list version that Terra found hard to scan. **Real pre-existing bug caught in the same pass**: `app/(coach)/nutrition/index.js` (and `questions.js`) were never wrapped in `<CoachShell>` at all, so opening either dropped the left sidebar — fixed both, predates this session.

**Member 4-tab core loop** renamed to match the standalone app exactly — Today/Weekly/Check-In/Photos (was Today/Check-in/History). `lib/nutrition/useNutritionAccess.js` gates all four: no `public.clients` row → "not turned on" message, row exists but `objective_tracking_approved_at` is null → routes into the onboarding hub, otherwise the real tab. `components/nutrition/WeekList.js` (shared by the member's Weekly tab and the coach's Weeks tab) is a real single aligned table with color-coded weekly averages (green/red on a ±10% band, steps one-directional) that expands per-week into all 7 calendar days — ported to match a real screenshot Terra sent of the standalone app's version, after an earlier stacked-card attempt read as "ugly."

**Onboarding flow** (net-new product surface, not a data-source swap) — 3 steps for Kova (Questionnaire / Objective Tracking / Starting Photos), dropping the standalone app's 4th "Account" step since a Kova member already has a working login before nutrition is ever turned on. Coach side: `app/(coach)/nutrition/clients/[userId]/onboarding/{questionnaire,tracking,photos,approve}.js` (nested under the same dynamic `[userId]` segment as the client-detail page itself — confirmed this coexistence pattern works fine in Expo Router, was an open question in the plan). `approve.js` inserts the first `targets` row, stamps `objective_tracking_approved_at`, and seeds check-in questions from the template — "graduation," ported verbatim from the standalone app's `approveAndSetTargets`. Member side: new `app/(member)/nutrition/onboarding.js`, a welcome hub with 3 tappable tasks (in-page state, not separate routes, matching the standalone app's own UX). Turning Nutrition on for a genuinely new client now auto-copies the questionnaire template (`copyQuestionnaireTemplateToClient`, wired into `createOrReactivateClient`) so onboarding has real content immediately, mirroring what the standalone app's now-skipped draft/invite step used to do.

**Coach client-detail page rebuilt as the real 6 tabs** (`app/(coach)/nutrition/clients/[userId].js`): Dashboard (stat tiles, editable focus checklist, game plan, week-over-week comparison), Weeks (`WeekList`), Trends (a hand-rolled `react-native-svg` line chart with metric/range pickers — `react-native-svg` added as a new dependency for this, verified nothing else got dropped from `node_modules`), Check-In (week cycler, snapshot cards, answers with **click-to-highlight** — web-only, since drag-select-text isn't a touch interaction; native renders the same stored highlights read-only), Photos, Targets. Native gets full parity per explicit ask, not a simplified fallback — the one deliberate exception is text highlighting.

**Photos** (`lib/nutrition/photos.js`, `components/nutrition/{PhotoUpload,PhotoCompare,PhotoRequirementControls,PhotoSubmissionsEditor,ZoomableImage}.js`) — camera-or-library upload via new `expo-image-picker` + `expo-image-manipulator` dependencies (client-side compression, replacing the standalone web app's browser-Canvas approach, which doesn't exist on native), private Supabase Storage bucket (already existed, RLS already correct, no bucket changes needed). `PhotoCompare`'s 2-slot widget has a real per-slot date picker (`<select>` on web, a modal list on native) showing "MM/DD/YYYY | weight lb" — **fixed after Terra caught a real gap**: the first version only had an anonymous "1/4" index stepper, no visible date, and lost the selected date entirely when switching angle tabs. Now tracked by date string, not array index, so switching Front→Side tries to keep the same date selected instead of jumping to oldest/newest. The full-screen lightbox (`ZoomableImage.js`) has real pinch-zoom/pan/double-tap-reset, built on `react-native-gesture-handler` + `react-native-reanimated` (both already app dependencies, no new gesture library needed) — native parity with the standalone app's web lightbox, per explicit ask. The photo-requirement gate (blocks check-in submission until that week's required photos are up) is wired for real into `submitCheckin`, not stubbed.

**Real data bug found and fixed, not just a UI gap**: `lib/nutrition/weekCycle.js`'s `summarizeWeek` was still filtering/sorting on `log.log_date` — the placeholder schema's column name — after `daily_logs` had already been repointed at `public.daily_logs`, whose column is just `.date`. This silently zeroed every week's `days` array everywhere `summarizeWeek` is used (Weeks tab, Dashboard tiles/comparison, Check-in snapshot) while the freshly-written Trends tab (built directly against `.date`) worked fine — exactly the "some data shows, some doesn't" symptom Terra reported. Fixed by correcting both the filter and the sort to `.date`.

**Push reminders**: `supabase/functions/scan-nutrition-reminders` and `scan-nutrition-checkin-available` rewritten from the placeholder schema to `public.*` (redeployed), plus a real new filter neither the placeholder version nor the standalone app needed: only scan clients with `objective_tracking_approved_at` set, since someone mid-onboarding has no daily-log/check-in cadence to nag about yet. `0014_nutrition_reminder_cron.sql` (registers the actual cron schedule) — check whether it's been run with `select * from cron.job;`; if `nutrition-reminders-scan`/`nutrition-checkin-available-scan` aren't listed, it still needs running in the SQL Editor.

**New admin pages** (as originally built this session, since superseded — see "Nutrition coach-tools follow-up pass" below): a standalone `app/(coach)/nutrition/questionnaire.js` template editor and `app/(coach)/nutrition/photo-compare.js` (standalone client-picker + compare board, still current).

**Verification is real for once, not the usual "bundle-checked only" caveat**: Terra logged in and clicked through this build directly during the session (she can log in, this environment still can't). Three real bugs came back and were fixed same-session: the roster's missing sidebar + hard-to-scan filter-chip layout, the Weeks-tab data bug above, and the Photos date-picker gap. Everything else (onboarding end-to-end, native photo capture/compression/zoom specifically) is still bundle-checked only — worth a real click-through, especially anything native-only that the web build can't exercise.

## Nutrition coach-tools follow-up pass (2026-08-02)

Terra's own first click-through of the nutrition rebuild above surfaced nine follow-ups, all built same-session. **Not yet visually verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, no console errors on `/` or `/settings`).

- **Templates moved into Settings, made editable.** `app/(coach)/nutrition/questions.js` and `questionnaire.js` are deleted — both template editors (weekly check-in + onboarding questionnaire) now live inline on `app/(coach)/settings.js` under a new "Nutrition templates" section, via a new shared `components/nutrition/QuestionListEditor.js` (add/rename-in-place/▲▼-reorder/delete — reorder swaps `position` between two rows, no drag-and-drop dependency needed). **This makes both templates admin-only** (Settings redirects non-admins) — previously any coach with `can_view_nutrition` could reach them from the Nutrition index page. Deliberate per Terra's ask, flagged here in case a coach-accessible copy is wanted later. New `updateTemplateQuestion`/`updateQuestionnaireTemplateQuestion` in `lib/nutrition/checkin.js`/`onboarding.js` back the rename+reorder.
- **Per-client question editing is check-in-only, not questionnaire** — confirmed directly with Terra mid-session: the onboarding questionnaire stays copy-from-template-only (unchanged), only weekly check-in questions get per-client editing, and that lives in the new Client Settings modal below (not its own page). New `addClientQuestion`/`updateClientQuestion`/`deleteClientQuestion` in `checkin.js`, reusing `QuestionListEditor`.
- **New `components/nutrition/ClientSettingsModal.js`** ports the standalone app's `EditClientModal` (Name/Phone/Start date/Status/Progress photo frequency/"Starting the week of" + This week/Next week quick-fill) plus embeds that client's check-in question editor. "Starting the week of" is a UI label only — it still writes `photo_frequency_started_at`, don't rename the column to match. New `updateClient(userId, fields)` free-form patch in `lib/nutrition/clients.js`. Opened via a new gear icon (`Ionicons settings-outline`) next to the client name in both header branches of `app/(coach)/nutrition/clients/[userId].js`. **`components/nutrition/PhotoRequirementControls.js` is deleted** — its recurring-cadence picker moved into this modal, its one-off "require next check-in" flag moved into the check-in timeline below; the Photos tab's "Photo requirements" card is gone.
- **Photo-pose backgrounds restored.** Copied `front.png`/`side.png`/`back.png` from the standalone app's `public/photo-poses/` into `assets/nutrition/photo-poses/`. Checked the actual pixel content first (`PIL` bbox analysis) — the silhouettes were already centered within their own canvas (sub-3% vertical offset, negligible), so Terra's "weird centering issues last time" was a layout bug, not bad source art. `components/nutrition/PhotoUpload.js`'s `AngleBox` now renders the pose image via `StyleSheet.absoluteFillObject` + `resizeMode="contain"` (pins all 4 edges, unlike a bare `width/height: "100%"`) at 0.25 opacity behind the placeholder, only when no photo is selected yet.
- **New `components/nutrition/MacroPills.js`** ports the standalone app's `MacroBubbles.js` — fixed per-macro-type pill color (protein/carb/fat/fiber/calories/steps/sleep), not an on-track/off-track comparison. Applied to the Dashboard tab's "Current target" card and `TargetsHistory.js`'s per-row line, both of which were plain concatenated text before. **Deliberately not touched**: `WeekList.js` (kept pixel-faithful to the original per an earlier session) and `WeekComparison.js` (its red/green coloring is a this-week-vs-target comparison, a different thing from a target listing).
- **Trends range picker** (`TREND_RANGES` in `[userId].js`) widened from `30d/90d/6mo/1yr` to `W/1m/3m/6m/1y` (7/30/90/180/365 days) — pure data-array change, the day-count already drives `trendCutoff` generically.
- **New `components/nutrition/CheckinWeekTimeline.js`** — per-client (not roster-wide; confirmed directly with Terra after an initial roster-wide-grid proposal was the wrong read of her ask) check-in status view: Upcoming (next 3 weeks) / This week / Past (last 5), each row showing completion status (Completed/Awaiting review/Missed/Not due yet, via the existing `deriveCheckinStatus`), whether that week required photos and whether they came in (`isPhotoRequirementWeek`/`hasAllAngles`, both pre-existing), and — the "ability to add a requirement" ask — a per-row toggle on upcoming/current weeks for the existing single-column one-off flag (`requirePhotosNextCheckin`/`clearPhotosNextCheckin`; only one week can hold it at a time, same as before, just surfaced per-row now instead of as one blanket Photos-tab button). Rendered above the existing (untouched) `WeekList` averages table in the Weeks tab. New `enumerateUpcomingWeeks()` in `lib/nutrition/weekCycle.js` (forward counterpart to `WeekList.js`'s `enumerateRecentWeeks`) and `listCheckinsSince()` in `checkin.js` back it.
- **Photo compare: 2→3 slots, controls moved above the photo, logo watermark.** Ported from the standalone app's `PhotoCompareBoard.js` (confirmed by reading it directly): `components/nutrition/PhotoCompare.js`'s `leftDate`/`rightDate` pair became a 3-element `slotDates` array (oldest/middle/newest default, same as the original), each column's `DateStepper` now renders above its `Slot` instead of below, and a low-opacity `assets/kova-logo.jpg` watermark sits bottom-right — same as the original, which also has no image-export pipeline, just a live overlay meant for a manual screenshot (`react-native-view-shot` would be the RN equivalent of a real one-tap export, if ever wanted). `app/(coach)/nutrition/photo-compare.js`'s wrapper page got a canvas-background + soft-bordered-card restyle so the board itself is a clean thing to screenshot. The client-detail Photos tab's "Compare" section picks up the 3-slot change automatically since it shares the same component.

**Unrelated but found the same day, worth knowing since it touches the exact tables this section is about**: the standalone Nutrition Tracker app's own `setClientStatus` used to also call `admin.auth.admin.updateUserById(clientId, { ban_duration: ... })` whenever a client's status changed away from "active" — a real, ~100-year Supabase Auth ban on the shared `auth.users` row (`public.clients.id` *is* `auth.users.id` in that app's schema, and this Supabase project's auth is shared with Kova). Terra hit this directly: pausing a test client row under her own email banned her real account, locking her out of Kova too. Fixed in the standalone app's repo (`app/dashboard/actions.js` — status-column-only now, matching its already-existing non-banning `updateClient` path) and documented in that repo's own `CLAUDE.md`/`CHANGELOG.md`. **Kova itself never had this bug** (verified — no `auth.admin.*` call anywhere in this repo touches ban/status), but since `lib/nutrition/clients.js`'s `setClientStatus`/`updateClient` write to that same shared `clients.status` column (including the Status field in the new Client Settings modal above), both now carry an explicit comment warning against ever wiring a ban in from this side.

## Nutrition coach-tools follow-up pass 2 (2026-08-02)

A second round of feedback on the same build, all done same-session. **Not yet visually verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, 1785 modules, zero console/bundler errors).

- **Both question templates (Settings) now sit behind a "Manage →" button, not permanently expanded.** New `components/nutrition/TemplateEditorButton.js` wraps `QuestionListEditor` in a modal popup — `app/(coach)/settings.js`'s Nutrition templates section now shows a compact row (name + question count) per template instead of the full editor inline.
- **`ClientSettingsModal.js` gained a new `ExpandableSection` pattern** (click a header row to expand/collapse) applied to two things: the per-client check-in questions editor now shows an "Available to client" / "Not available yet" badge (based on `questions.length > 0` — matches what a client with zero questions actually sees on their own Check-In tab), and **`CheckinWeekTimeline` moved here from the Weeks tab entirely** (not duplicated) — the modal now takes `checkins`/`photos`/`today` props from `[userId].js`, and the Weeks tab is just `WeekList` now.
- **`TrendChart.js` reworked**: hover-to-inspect on web (mousemove over the whole `<Svg>`, nearest-point lookup) replaces tap-only, with x-axis date labels (`formatDateMD`, up to 5 evenly spaced) added along the bottom. Also fixes a real console warning (`Unknown event handler property 'onResponderTerminate'`) — caused by `onPress` on individual `<Circle>` elements, which react-native-svg's web build turns into RN touch-responder props that don't exist as real DOM attributes on a raw `<circle>`. `onPress` per-point is now native-only; web tracks pointer position against the chart instead.
- **`PhotoCompare.js`'s slot count is now a `slots` prop, default 2** (was hardcoded to 3 everywhere). Only `app/(coach)/nutrition/photo-compare.js` (the dedicated compare tool) passes `slots={3}` — the member's own Photos tab and the coach's per-client Photos tab both stay at 2. `defaultDates()` generalized to N evenly-spaced dates instead of a hardcoded oldest/middle/newest triple.
- **Photo-pose guide images fixed** — the previous "restored" version (see above) rendered full-bleed via `StyleSheet.absoluteFillObject`, which turned out wrong once actually seen: the source PNGs (`assets/nutrition/photo-poses/*.png`) are full illustrated frames (radial-glow background, not a transparent-margin silhouette), so filling the whole box with one read as "way oversized." Now rendered at a fixed 65% of the box, centered via a wrapping `View` with `alignItems`/`justifyContent` (genuine flexbox centering, not an unconstrained absolutely-positioned `Image` guessing its own static position) — can't overflow the box regardless of aspect ratio.
- **Coach-only photo backfill date (`PhotoUpload.js`'s `allowDatePick` mode) is now a real date picker on web** (`<input type="date">`) instead of a `YYYY-MM-DD` text field — native keeps the text field (no date-picker library installed, and this mode is coach-only/web-first per Terra's own framing of that workflow).
- **"Fix a day's photos" (`PhotoSubmissionsEditor.js`) angle picker is now a dropdown** (`<select>` on web, a modal option list on native — same split as `PhotoCompare.js`'s own `DatePicker`) instead of tap-to-cycle. Save is now genuinely blocked (button disabled, not just an error after clicking) unless the day has **exactly** one front, one side, and one back — the old check only caught duplicate angles, not a day saved with 2 angles or 4+ photos, either of which breaks the requirement-gate/compare logic that assumes a complete 3-angle set per date.
- **Targets tab shows the current value as a small colored pill next to each field's label** (`NewTargetForm.js`'s `Field`, now takes a `current`/`styleKey` pair) — reuses `MacroPills.js`'s per-macro color palette, now exported as `MACRO_STYLES` instead of being a private constant.
- **Photo Compare tool page widened** (`app/(coach)/nutrition/photo-compare.js`, `maxWidth: 700` centered → `maxWidth: 1100`, left-aligned like every other coach page) — the 3-slot board was reading as small/lost in the sidebar layout's available width.
- **Check-In tab rebuilt into a task-checklist landing page** (`app/(member)/nutrition/checkin.js`) — two collapsible `TaskCard`s: "This week's progress photos" (only shown on photo-required weeks; done once `hasAllAngles`, or the member can tap "I can't provide photos this week" → a popup asking why → that unblocks submission) and "Check-in form" (the existing questions, done once submitted). Previously, a photo-required week just hard-blocked `submitCheckin` with an alert and no way through at all — there was no skip path. **Deliberately no schema change**: raised directly by Terra mid-session (worried a new column on the shared `checkin_responses` table — `public.*`, also used by the standalone Nutrition Tracker app — might affect that app's own flow). The skip reason is instead appended as one more `{question, answer}` pair inside the existing `answers` jsonb array on submission (`submitCheckin(userId, answers, { photosSkipReason })` in `lib/nutrition/checkin.js`), so the standalone app's rows/rendering are completely unaffected — this only changes Kova's own gating logic and UI. The coach's Check-In tab on `[userId].js` needed no changes to show it — it already renders `checkin.answers` generically. **Superseded same day** — see "pass 3" below: the "collapsible card" interaction shipped here was replaced with real popups per direct follow-up feedback.

## Nutrition coach-tools follow-up pass 3 — real device debugging, a real native rendering bug (2026-08-02)

Terra reported the installed native app crashing on photo upload, and (once that was fixed) that the pose-guide images still didn't render right — "you need to rethink" after several wrong guesses. Two genuinely separate problems, both root-caused for real this time by using actual device/simulator access rather than reasoning from screenshots alone:

**Root cause #1 — stale native build, not a code bug.** `expo-image-picker`, `expo-image-manipulator`, and `react-native-svg` were added to `package.json` during the nutrition rebuild, but nobody had re-run `pod install` in the gitignored `ios/` folder since — every native rebuild kept reusing Pods from before those libraries existed, throwing a JS-catchable "Cannot find native module 'ExponentImagePicker'" the moment the picker was used. Separately, `Info.plist` was missing `NSPhotoLibraryUsageDescription`/`NSCameraUsageDescription` (only declared in `app.json`'s plugin config, which only reaches the hand-maintained native `Info.plist` via a real `expo prebuild`, not a plain rebuild). Fixed by running `pod install` and hand-adding the two Info.plist keys — see the "Physical iOS device builds" section's new bullet for the general lesson (native deps need `pod install`, config-plugin-only settings need hand-porting).

**This session had real Bash access to a Mac with Xcode and a physical device connected** (same unusual-but-recurring situation as the original physical-build session) — used it to pull real crash logs, run `pod install` directly, and eventually spin up an **iOS Simulator build** (via the `mcp__Claude_Code_iOS_Simulator__build`/`control` tools) purely to *see* the bug myself instead of reasoning about it blind, after web-preview checks kept passing while the real device kept failing. Debugging technique worth reusing: temporarily swapping a component under investigation into an already-reachable unauthenticated screen (here, `app/(auth)/login.js`) to view/screenshot it without needing real login credentials (which this environment still can't enter) — revert immediately after.

**Root cause #2 — a real native-only rendering bug, not a caching or asset problem**, despite three wrong turns first:
1. First guess: pose PNGs were "oversized" — shrank them to 65% + 20% opacity. Wrong; way too faint to see (Terra: "the girl is not rendering").
2. Second guess (once a real screenshot was sent as reference): switched to `resizeMode="cover"` at full size. Wrong; cropped heads/feet off since the images are much taller/narrower than the 3:4 box — `cover` always fills the box completely by cropping the overflow.
3. Actual asset bug found by pixel-analyzing the source PNGs directly (`PIL`, per-column/row brightness profiling): `front.png`/`side.png`/`back.png` had genuine dead solid-black margins baked into the canvas (93px/68px/20px respectively) — a previous session's "already centered, sub-3% offset" analysis had only checked vertical centering, never horizontal. Cropped all three to their real content bounds. Correct now, confirmed by direct visual inspection — but the *app* still rendered a tight, wrong zoom even with `resizeMode="contain"` and the fixed assets.
4. **The actual bug**: `StyleSheet.absoluteFillObject` (`position:"absolute"` + all four edges `0`, no explicit `width`/`height`) does not reliably size an `Image` for `resizeMode="contain"`'s scaling math on real native iOS — it rendered correctly every single time in the web preview (react-native-web's CSS-based `object-fit` doesn't have this problem) which is exactly why repeated "bundle-checked, no errors" verification kept giving false confidence. Fetching the exact compiled JS bundle Metro was serving (`curl .../entry.bundle`) and grepping it confirmed the *code* running on Terra's phone was correct the whole time — this was purely a layout/rendering quirk, not stale JS, stale assets, or stale native modules (all three were independently ruled out first: uninstalled/reinstalled the app from scratch, verified Metro served the freshly-cropped image bytes, verified the compiled bundle's asset registry had the correct new width/height). Fixed by switching the base `Image` to plain `style={{ width: "100%", height: "100%" }}` (still a child of a `position:"relative"`-by-default `Pressable`) instead of `absoluteFillObject` — confirmed via a real Simulator screenshot, not just "should work now." Grepped the rest of the codebase afterward for the same `absoluteFillObject`-on-`Image` pattern — nothing else uses it, so this was contained to the one component.

**Lesson for future debugging**: when web-preview verification keeps passing but a real device keeps failing on something visual/layout-related, stop trusting the web preview as a stand-in — react-native-web and true native `Image`/layout behavior can genuinely diverge, and the only way to know is to actually look at native output (simulator screenshot, or a real device).

## Nutrition onboarding review: real gap found + a ported "skip" feature (2026-08-03)

Found via a real client (Roxy) stuck in a state the coach couldn't act on: her roster status was "Needs target," but the review/approve screen (`onboarding/approve.js` — baseline averages + coach prep notes + macro-target form, confirmed to faithfully match the standalone app's own `approve/page.js` byte-for-byte in structure) was completely unreachable for her.

**Root cause**: `approve.js` redirected away for anyone with `objective_tracking_approved_at` already set, treating "already approved" as "nothing to review." But a client can be approved with **zero targets** — e.g. a pre-existing standalone-app client whose Kova nutrition access was just turned on, never run through Kova's own onboarding cycle. That's exactly what "Needs target" means, and there was no path to the review screen for it, and no link to that screen anywhere outside the onboarding hub (which a client stops seeing the moment they're approved).

Fixed:
- `onboarding/approve.js`'s redirect now gates on "does this client already have a target" (`listTargets`), not on the approval timestamp.
- `lib/nutrition/onboarding.js`'s `approveAndSetTargets` now checks whether the client was already approved before deciding whether to re-stamp `objective_tracking_approved_at` (would overwrite their real original approval date) or re-seed `client_checkin_questions` from the template (would duplicate whatever they already have) — for an already-approved client it now only inserts the target.
- `app/(coach)/nutrition/clients/[userId].js` gained a "No target set yet" banner, shown on every tab whenever `!currentTarget`, linking straight to the review screen — the only entry point to it outside the onboarding hub.

**Separately, a real missing feature, not just a bug**: the standalone app's drafts flow has `bypassObjectiveTracking` — lets a coach mark a client approved immediately, skipping the questionnaire/tracking/photos requirement entirely, for a client who won't do that in-app (legacy client being migrated in, paper/verbal intake, someone who'll just never log in). This never made it into Kova's port at all (Kova has no `client_drafts` concept, and the skip action itself got dropped along with it, not just the drafts mechanism). Ported as `lib/nutrition/onboarding.js`'s `bypassOnboarding(userId)` — same behavior as the original (stamps approval, seeds check-in questions, deliberately does NOT insert a target, same as the source) — exposed as a "Skip in-app onboarding →" link on the onboarding hub page (`[userId].js`'s not-yet-approved branch), next to the existing "Approve & Set Targets" button. Confirmed via `window.confirm`/`Alert.alert` (`lib/confirmDialog.js`'s new `confirmBypassOnboarding`, same web/native branch as `confirmOverwrite`/`confirmDelete` — plain `Alert.alert` with a button array doesn't render as a real dialog on web, where coaches do most of this work) before it fires, since it's a real state change with no undo path built.

**Verification real for the approve.js fix** (Terra clicked through it directly on Roxy's real account, confirmed working) — the "Skip in-app onboarding" feature itself is bundle-checked only, not yet clicked through.

## Nutrition onboarding pipeline page + real "never signed in" tracking (2026-08-03)

Same session as the fixes above, prompted by the same real client (Roxy) turning out to have never signed into Kova at all — direct feedback that this used to be visible in the standalone app and "onboarding felt like a black hole" without it. Read that app's actual `/dashboard/onboarding` page + `lib/onboardingClients.js`/`lib/clientStatus.js` directly (not guessed) and ported the real pieces, adapted for Kova's identity model:

- **Never-signed-in tracking** — first built as `core.users.first_login_at` (migration `0021_first_login_at.sql`, a new column stamped client-side via `core.stamp_own_first_login()`, called fire-and-forget from `AuthProvider.js` on every login). Replaced same-day, before `0021` ever ran against the live project, by `0022_login_activity.sql`'s `core.get_login_activity(user_ids)`: a new column has no history, so real prior logins would've shown as "Never signed in" until someone happened to reopen the app after the migration — `get_login_activity` instead reads `auth.users.last_sign_in_at` directly (tracked natively by Supabase Auth since account creation, no backfill gap) via a staff-only security-definer function. `0022` drops `0021`'s column/function first (`if exists`, safe either order), so **only `0022` needs running**.
- **`lib/nutrition/onboarding.js`** gained `describeOnboardingProgress()` (ported from the standalone app's `computeClientStatus` — "Waiting on questionnaire" / "Waiting on Objective Tracking days" / "Waiting on starting photos" / "Ready for review") and `getOnboardingRoster()` (ported from `getOnboardingClients()` — batched fetch of every not-yet-approved client with phases + progress text + `firstLoginAt` attached, cross-schema `core.users` join done as a separate fetch + client-side merge per this app's standing "avoid cross-schema PostgREST embeds" rule).
- **New `app/(coach)/nutrition/onboarding.js`** — a dedicated pipeline list (ported from the standalone app's `/dashboard/onboarding` page + `ClientRow.js`): every mid-onboarding client, a status dot (gray/olive) + progress line, "· Never signed in" appended when `firstLoginAt` is null, and a **"Resend invite"** action shown only for that case. Reachable via a new "Onboarding →" link on the main roster (both `index.web.js` and native `index.js`), next to the existing Archived/Photo compare links.
  - **"Resend invite" isn't a literal port** — the standalone app has a real email-invite system (`client_drafts` → `inviteUserByEmail`) that Kova has no equivalent of (a Kova member's `auth.users` row already exists before nutrition is ever turned on — see `linkMemberByAuthId`). Instead it calls `supabase.auth.resetPasswordForEmail()`, the exact same call this app's own `/reset-password` screen already uses — sends a real, working set-password link regardless of whether they ever completed a first login. Genuinely functional, not a stub.

**Superseded later the same day** — see "Nutrition dashboard rework" below. The pipeline page, `getOnboardingRoster()`, and `describeOnboardingProgress()` are all gone: onboarding phase detail now surfaces directly on the main roster's tiles instead of a separate page, and "Resend invite"/"Never signed in" moved to the main Clients page (an account-level concern, not nutrition-specific). `core.get_login_activity` is still exactly what backs it, just called from a different screen.

## Nutrition dashboard rework: real onboarding/check-in statuses, Finalize relocated, Objective Tracking history (2026-08-03)

Same day as the onboarding-pipeline work above, later session — direct feedback that the dashboard's tiles didn't match how a coach actually thinks about a roster. Replaced the flat `STATUS_ORDER` row (one "Onboarding" catch-all, one vague "On track" catch-all) with two real 3-way splits, and relocated a few actions that were in awkward spots.

- **`lib/nutrition/rosterStatus.js`** now has `NEW_CLIENT_STATUSES` (`otSetup` / `otInProgress` / `readyForReview`) and `ACTIVE_CLIENT_STATUSES` (`checkinPending` / `readyForCheckin` / `checkinCompleted`), plus `OTHER_STATUSES` (`needsTarget` / `paused`) for the rare edge cases that don't fit either grouping. `deriveCheckinStatus` only ever returns pending/ready/completed, so the 3 active-client statuses are exhaustive — there's no "on track" catch-all left. New `getOnboardingPhasesForClients(userIds)` (`lib/nutrition/onboarding.js`, replaces the removed `getOnboardingRoster`) batches phase data for whichever clients are onboarding; `deriveOnboardingBucket` in `lib/nutrition/dashboard.js` splits them by whether tracking days are assigned yet vs. logged vs. fully ready (`readyForReview` requires OT logging *and* the questionnaire *and* starting photos — a client done with OT but still missing photos stays in `otInProgress`).
- **Web roster** (`app/(coach)/nutrition/index.web.js`) groups these into two labeled, one-line tile rows — "Active clients" and "New clients" (`TileSection`, `flex-row` with no wrap) — instead of one flat wrapping row. `OTHER_STATUSES` renders as a small secondary row only when either bucket has anyone in it, so it disappears entirely once there's nobody paused or target-less.
- **Tile labels went through a couple of rounds of direct feedback**: `checkinPending`/`readyForCheckin` are now labeled "Awaiting client check-in" / "Awaiting coach check-in" (clearer than the original "Pending"/"Ready for" wording, though the underlying split already existed). Considered folding `needsTarget` into Active clients as a 4th tile, landed on keeping 3-and-3 instead — see the bypass-onboarding fix below, which should make `needsTarget` a rare-to-nonexistent state going forward rather than something worth a permanent tile.
- **Finalize Check-In relocated** from the bottom of the Check-In tab to the top of the client-detail page, next to the client's name — visible regardless of which tab a coach is on, still wired to the same `checkin`/`selectedWeek` state the tab's own week-navigator drives (so paging to a late-submitted prior week still works through the same button). A small person icon appears on the button only when that check-in cycle has progress photos in (a live "has any" check, not unread/seen tracking — no migration needed). The bottom of the Check-In tab is now just a status readout, not a second action.
- **Check-in submitted-at timestamps** — new `formatDateTimeInBoise()` (`lib/boiseDate.js`, Boise-local "MM/DD HH:MM AM/PM") shows in two places: the Client Settings modal's per-week `CheckinWeekTimeline` (historical, every week), and directly under the roster row's status badge for anyone currently "Awaiting coach check-in" (a better spot for a same-week glance than opening Settings).
- **Bypass onboarding now requires a target immediately** — `handleBypassOnboarding` (`clients/[userId].js`) routes straight into `onboarding/approve.js` right after calling `bypassOnboarding()`, instead of leaving the coach to remember to come back later. `approve.js`'s own gate already only checks whether a target exists (not the approval timestamp — see the onboarding-review fix above), so it was already the right landing screen. This is what should make `needsTarget` a rare state going forward instead of a standing one.
- **New Objective Tracking history on the Targets tab** — `components/nutrition/ObjectiveTrackingHistory.js`, under Target History: averages via the existing `computeBaseline` (same one `approve.js` uses for the one-time review), clickable to a modal listing every individual logged day (date, protein/carb/fat/fiber, derived calories). Backed by new `listObjectiveTrackingLogs(userId)` (`lib/nutrition/onboarding.js`) — unlike `approve.js`'s one-time baseline, this is available any time after onboarding, not just during the initial review.
- **Coach Home's own "Nutrition" summary tile is unaffected** — `lib/programming/coachDashboard.js` computes its breakdown independently off raw `checkinStatus`/`hasTarget`/`needsAttention` fields, not off `rosterStatus`, so the tile-taxonomy rename didn't touch it. Confirmed by reading it directly before assuming otherwise.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, zero console errors). Worth a manual click-through, especially the tile bucketing against real onboarding/active clients and the relocated Finalize button.

## Nutrition/mobile polish batch: milestone emojis, real bugs, layout asks (2026-08-05)

A batch of direct feedback from actually using the app — several real bugs, not just polish.

**Milestones can now carry a coach-picked emoji** (migration `0027_milestone_emoji.sql`, **run**). `MilestoneFormModal.js` gained a quick-pick row of common emoji plus a free-text field (typed/pasted, no picker library needed — RN's native emoji keyboard handles entry fine on both platforms). Shown wherever a completed milestone surfaces on the member side: a new "Completed milestones" slide on the Nutrition Today tab's `TodayCardSlider` (a row of tappable emoji chips, trophy icon fallback for milestones predating this feature) and a new entry type in My History's day timeline (`lib/history.js`'s `listDayTimeline`, own try/catch-isolated fetch so a milestones failure can't take down session/nutrition history). Tapping an emoji in either place opens new `components/nutrition/MilestoneDetailModal.js` — a generic reusable detail popup, distinct from `MilestoneCongratsModal.js` (a one-time "you just completed this" notification, not a reusable view).

**Real bug: the native progress-photo date picker had no scroll mechanism at all.** `components/nutrition/PhotoCompare.js`'s native `DatePicker` modal listed every date via a plain `.map()` inside a `maxHeight: "70%"` `Pressable` — fine for a client with a handful of photos, but a client with "a bunch" (found via a real client's photo page) just overflowed past the modal's bounds instead of scrolling. Fixed by wrapping the date list in a `ScrollView`.

**Weeks tab (shared by the member's Weekly tab and the coach's per-client Weeks tab) got two layout fixes**: the date/week label column was tightened (150px → 120px — the actual text never came close to filling 150px, leaving a dead gap before the Weight column), and — the bigger one — that label column is no longer inside the same horizontal `ScrollView` as the metric columns. `WeekList`/`WeekDayTable` now render a frozen (non-scrolling) label column alongside a separately-scrolling metrics table, built from one shared flattened `rows` array so the two sides can't desync on which week/day is expanded. Previously, scrolling right to see Steps/Sleep/Note meant the date column scrolled away too, losing track of which row you were looking at.

**Finalize Check-In's "this cycle has photos" indicator is now a camera icon**, not a person icon — same lightweight flag as before (`weekPhotos.length > 0`), just a more legible pairing with "photos."

**Native (mobile) coach Nutrition roster's status filter row now stacks 3-per-row** (`app/(coach)/nutrition/index.js`) instead of scrolling horizontally — a wrapping grid (`flex-wrap`, `width: "31%"` each) so every status is visible without sideways scrolling. Native only; the web roster's two-row `TileSection` layout is a different, already-non-scrolling design and wasn't touched.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`expo export -p web`, clean, zero errors). Worth a real click-through, especially the frozen-column Weeks tab (row-height parity between the frozen and scrolling sides is the easiest thing to get subtly wrong) and the milestone emoji flow end-to-end.

**New app icon applied across every platform, same session.** Terra dropped a new cream-background wordmark icon (`assets/kova-app-icon-source.png`, kept for future re-derivation) at 1024x1024 with real alpha transparency outside its rounded-square shape — not directly usable as-is for `icon.png` (iOS icons must be fully opaque). Derived every slot `app.json` references, matching existing dimensions/formats exactly: `icon.png` (flattened onto the source's own cream, RGB), `favicon.png` (48x48), and Android's adaptive icon layers — `android-icon-background.png` (solid cream fill) plus `android-icon-foreground.png`/`android-icon-monochrome.png` (the wordmark isolated from its cream background via color-distance thresholding, not a hard-edged cutout, then scaled/padded to Android's safe zone rather than reusing the source's own baked-in rounded-square framing, which would've double-framed against Android's own adaptive mask shape). **Worth knowing, not fixed since it's a pre-existing, unrelated config choice**: the `expo-notifications` plugin's Android notification-icon slot also points at plain `icon.png` — Android tints status-bar notification icons to a flat white silhouette regardless of the source image's color, so a full-color icon there likely renders as a white blob in the notification tray. Was already configured this way before today; flagging it since it'll look wrong the first time a real push notification's icon is actually seen on an Android device, not something this icon swap introduced.

## Coach can reopen a missed weekly check-in (2026-08-04)

Real ask from Terra: a client (Roxy) missed her weekly check-in filing window and wants to submit it late. There was no path for this at all — `submitCheckin` (`lib/nutrition/checkin.js`) always filed against the live `currentWeek`, computed fresh from today's date every time, never an arbitrary past week, so a missed week was permanently unrecoverable through the app once its own filing window (see `weekCycle.js`'s `computeWeekWindows` — a week stays "current" for filing purposes through the following week, then lapses) closed. Notably, this needed **no RLS or schema change to the shared `public.checkin_responses` table at all**: its insert policy only ever checked `client_id = auth.uid()`, with no `week_start` restriction, confirmed by reading the standalone Nutrition Tracker app's own migration directly — a member could already insert against any past week at the DB level. The only real gap was app-side: nothing ever offered the member a form for anything but the live current week, and nothing gated *which* past weeks a member should be allowed to resurrect (letting a client freely rewrite arbitrary history isn't the goal — only a coach-approved late window is).

**New `programming.nutrition_checkin_reopens`** (migration `0028_checkin_reopen.sql`, **run** — confirmed live via direct schema query 2026-08-07) — genuinely new state with no standalone-app equivalent, so it lives in Kova's own schema rather than touching `public.*`, same reasoning as `nutrition_milestones` (0023). One row per grant: `user_id`, `week_start` (which missed week), `opened_by`, `expires_at`. `expires_at` is computed once at reopen time as the Sunday that already closes the *current* filing cycle (`computeWeekWindows(today).currentWeek.end + 7`) — exactly the "reopens now, but recloses before the new one comes available" safeguard Terra asked for, and it needs no cron job or explicit close action: `lib/nutrition/checkin.js`'s new `getActiveCheckinReopen(userId, today)` just stops returning a row once `today` passes `expires_at` (or once the client actually submits — it also excludes any week that already has a `checkin_responses` row), so the next cycle proceeds normally on its own.

**Coach side**: `components/nutrition/CheckinWeekTimeline.js` (the "Check-in status" section of the Client Settings modal — `components/nutrition/ClientSettingsModal.js`) — a "Missed" row now gets a "Reopen" action (mirroring the existing "+ Require photos" action already on upcoming/current rows), and once reopened shows a new amber "Reopened" status with an "until {date}" line instead of the flat red "Missed". Threaded `reopens`/`coachId` props down from `app/(coach)/nutrition/clients/[userId].js` (`listCheckinReopensSince`, loaded in its own isolated try/catch like the milestones fetch, so an unmigrated 0028 can't break the rest of the page).

**Member side**: `app/(member)/nutrition/checkin.js` now independently loads `getActiveCheckinReopen` alongside the normal currentWeek load. If one's active, a distinct rust-bordered "Missed check-in reopened" card renders above the normal (unmodified) current-week check-in — its own Photo/Form popups and its own "Submit missed check-in" button, filing via `submitCheckin(userId, answers, { weekStart: reopen.week_start, ... })`. `submitCheckin` gained an optional `weekStart` override (defaults to the live currentWeek exactly as before) — the one sanctioned exception to "week_start is always server-computed, never client-supplied." The reopened week's own photo-requirement check uses that week's actual photos (`photo.date >= reopen.week_start`), not a recency-window-relative-to-today check the way the normal flow does, since a late submission is filed well after the missed week itself.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, 1619 modules, zero console/bundler errors). Worth a manual click-through once 0028 is run: reopen Roxy's missed week from Settings, confirm the card appears on her My Nutrition → Check-In tab, submit it, and confirm the card disappears / the week shows "Completed" on the coach's timeline.

## Nutrition onboarding: unreachable phase cards, a calendar date picker, per-client questionnaire editing, and a real "send to client" gate (2026-08-05)

Same day as the auth-fix session above, prompted by Terra hitting a real dead end trying to onboard a genuinely brand-new nutrition client (Cozeth Scott) — confirmed against the live database directly (queried via an authenticated Supabase CLI session, same "don't assume the sandboxed DB-access limitation always holds" exception noted elsewhere in this file) that her `public.clients` row was a fresh insert, `objective_tracking_approved_at` null, zero dates/response/photos — not a data bug.

**Real bug found: `components/nutrition/PhaseCard.js` only wrapped its content in a `Pressable` once a phase was already `done`** (`if (!done) return content;`) — but `onboarding/tracking.js` and `onboarding/questionnaire.js` are exactly where a coach takes the actions that make a phase done in the first place (assigning tracking dates, copying/editing questionnaire questions), and no other screen in the app links to either page. This made Objective Tracking permanently unreachable for **every** new nutrition client, not just Cozeth's — fixed by always wrapping in `Pressable`, dimmed-but-tappable when not done. Starting Photos was unaffected (a pure read-only viewer, nothing coach-actionable pre-completion).

**Calendar date picker — went through three real rounds of feedback the same day, final shape below supersedes the first two.** `onboarding/tracking.js`'s plain `YYYY-MM-DD` text field is replaced by new `components/nutrition/DateCalendarPicker.js`. Pure hand-rolled grid math throughout (`daysInMonth`/`buildMonthGrid`, no calendar library) built on `lib/boiseDate.js`'s existing `dayOfWeekInBoise` — matches this app's standing "never trust device-local Date parsing for date math" rule and its general preference for hand-rolled pickers over new dependencies (same reasoning as `PhotoCompare.js`'s `DatePicker`/announcements' `buildDateOptions`).

1. First version: a `Modal` bottom sheet, tap-to-multi-select, "Assign N dates" bulk-confirms via a sequential loop over the existing single-date `addTrackingDate`. Shipped with no `maxHeight` at all, unlike every other bottom sheet in this app (`WeightCalculator.js`'s `maxHeight: "85%"` precedent) — on a shorter phone viewport this let the sheet (and its 6-row grid) exceed the screen with no scroll fallback, cutting off the header and making the footer buttons unreachable. Fixed with `maxHeight: "85%"` + an inner `ScrollView`, footer pinned outside it.
2. Still wrong: the sheet was `width: "100%"` with day cells sized off that width via `aspectRatio: 1`. Fine on a phone, but this feature is coach-only and coaches mostly use the **web build on desktop** — on a wide browser window the sheet stretched full-window-wide and every cell inflated to 100px+, looking broken. Fixed with `maxWidth: 440` + `alignSelf: "center"`.
3. **Final, current shape — the Modal/confirm-button pattern itself was the wrong interaction**, per direct feedback ("I just want it small... think of a normal date picker"): dropped the `Modal` entirely. It's now a small fixed-280px-wide calendar embedded directly inline in the Tracking dates card — no popup, no select-then-confirm step. Tapping an unassigned date calls `addTrackingDate` immediately (circle fills in); tapping an already-assigned date calls `removeTrackingDate` immediately (circle clears) — `onAssign`/`onUnassign` props instead of the old `visible`/`onConfirm(dates[])`. The per-row ✕ remove control in the dates list below became redundant with tapping the date itself and was removed.

**Actually visually verified at every step, not just bundle-checked** — temporarily mounted on the unauthenticated `login.js` screen (same documented technique used in the 2026-08-04 native-photo-rendering investigation), screenshotted and click-tested on both mobile and real desktop-width (1440px) viewports, reverting the test harness each time before committing. Worth remembering for future verification: the `computer` tool's screenshot-pixel coordinate space did not match naive visual estimation from the rendered image at a couple of points this session (once needing `read_page` element `ref`s instead of guessed coordinates, once needing the tool's own reported "Screenshot size" taken at face value instead of assuming a 2x scale) — when clicks don't land where expected, re-derive the coordinate space from a known reference point rather than assuming a fixed scale factor.

**Per-client editable questionnaire questions** — reopens a deliberate decision from the 2026-08-02 "coach-tools follow-up pass" ("questionnaire stays copy-from-template-only... confirmed directly with Terra") per this session's explicit new ask. New `addQuestionnaireQuestion`/`updateQuestionnaireQuestion`/`deleteQuestionnaireQuestion` in `lib/nutrition/onboarding.js`, same shape as `checkin.js`'s existing per-client `client_checkin_questions` CRUD. `onboarding/questionnaire.js` now renders the existing shared `QuestionListEditor` (add/rename/reorder/delete) whenever the client hasn't submitted yet — editing stops being offered once real answers exist, since editing questions underneath an already-submitted response doesn't make sense.

**Real "send to client" gate — genuinely new state, not just a UI toggle.** Before this, a brand-new-to-nutrition client's `public.clients` row being created was itself the only gate — whatever the coach had or hadn't finished setting up (questionnaire questions, tracking dates) was immediately live the moment nutrition was turned on, with no way to prep things first. Migration `0031_nutrition_onboarding_send.sql` (**not yet run**) adds `public.clients.onboarding_sent_at timestamptz default now()` — the `default now()` is deliberate: every pre-existing row (and any insert that doesn't know about this concept at all, including the standalone Nutrition Tracker app's own client-creation path, since this is a shared `public.*` table) reads as "already sent," so nothing about the standalone app's behavior changes. Only Kova's own brand-new-to-nutrition insert path (`lib/nutrition/clients.js`'s `createOrReactivateClient`) explicitly passes `null` to opt into the held-back state; the reactivate-existing-row path is untouched. New `sendOnboardingToClient(userId)` sets it to `now()`.

- **Coach side**: `app/(coach)/nutrition/clients/[userId].js`'s onboarding-hub branch gained a status banner — a rust "Not sent yet" bar with a "Send to client" button (new `confirmSendToClient()` in `lib/confirmDialog.js`, same web/native branch as every other confirm dialog in that file) when unsent, or a quiet "Sent to client {date}" line once sent.
- **Member side (real gate, not just cosmetic)**: `lib/nutrition/useNutritionAccess.js`'s existing "onboarding" status split into `"pending"` (not yet sent — same not-approved condition, but `!client.onboarding_sent_at`) vs `"onboarding"` (sent). `components/nutrition/NutritionAccessMessage.js` (already shared by all 4 member nutrition screens) gained a `"pending"` branch: a plain "Your coach is getting your nutrition program ready" message, no button, no task list. `app/(member)/nutrition/onboarding.js` — normally only reachable via that message's "Continue onboarding" button, which itself only appears once sent — got its own independent `useNutritionAccess` check too, belt-and-suspenders against a stale bookmark/deep link landing a "pending" client directly on the real task list. **Worth knowing**: this is an app-level gate only, not an RLS one — deliberately, since adding a real RLS restriction on `objective_tracking_dates`/`client_questionnaire_questions` risked affecting the standalone app's own (shared-table) RLS assumptions in ways not worth the risk for this session's scope. A client bypassing the app UI entirely (e.g. hand-crafted API calls) could theoretically still read the data — not a concern raised or asked about this session, just worth remembering if it ever is.
- **Roster status fix, found live mid-session**: Terra assigned Cozeth a tracking date via the new calendar picker and watched her roster tile immediately jump from "Objective tracking set up" to "Objective tracking" — before ever clicking Send. `lib/nutrition/dashboard.js`'s `deriveOnboardingBucket` used to key that transition purely on `trackingDatesCount === 0`, with no awareness of the new sent gate at all. Now takes a third `sent` parameter and stays in `"otSetup"` until `onboarding_sent_at` is set, regardless of how much prep work the coach has done behind the scenes — matches the whole point of the gate (nothing looks "in progress" from the roster's view until the client can actually see it).

**Migration `0031` has been run** (Terra ran it directly) — confirmed live via a direct schema query (`onboarding_sent_at` exists, `default now()`). One real consequence worth knowing: running an `ALTER TABLE ... ADD COLUMN ... DEFAULT now()` retroactively stamps that default onto every *existing* row at the moment the migration runs, not just future inserts — so Cozeth's own row (created earlier the same session, before this migration existed) got backfilled to "already sent" even though nobody had clicked the button for her specifically. Correct/intended per the column's own design (a pre-existing row had already been fully visible to the client the whole time, so grandfathering it in as "sent" matches reality) — but it meant Cozeth's page no longer showed the real "not sent yet" state to test against. Terra deleted her `public.clients` row directly (`delete from public.clients where id = ...` — every FK from that table is `on delete cascade`, confirmed by querying `information_schema` first, so this cleanly removes all her nutrition data with no orphans, and her `core.users`/`auth.users` login is untouched) and re-added her via the Nutrition toggle, which correctly re-triggers the fresh-insert path with `onboarding_sent_at: null`. **I declined to run that delete myself** despite having live query access this session — a permanent `DELETE` against production data is exactly the kind of irreversible action to hand the user precise instructions for rather than execute directly, even on explicit request.

**End-to-end confirmed working by Terra directly**, not just bundle-checked: the phase-card fix, the redesigned inline calendar (assign/unassign by tapping), and the send-to-client gate were all clicked through live. The alphabetical-sort ask below and the calendar's sizing fixes came out of that same real testing pass.

**Nutrition roster sort** — the web roster already defaulted to alphabetical (`useState("name")` in `index.web.js`, from an earlier session). Native (`index.js`) and the Archived list rendered clients in raw query order with no sort at all — both now sort by `name.localeCompare` to match.

## Nutrition check-in: multiple-choice questions, Zoom booking via GHL calendar, editable "check-in available" notification (2026-08-08)

Three-part ask, all built same session:

**Multiple-choice check-in questions + a booking trigger** — the "Loom or Zoom" question was free text like every other check-in question; the ask was to make it (and any future question like it) a real radio-button choice, with one option able to open a scheduler. Migration `0042_checkin_question_choices.sql` (**run**) adds `question_type`/`options`/`booking_option` to `public.checkin_template_questions`/`public.client_checkin_questions` — **these are the standalone Nutrition Tracker app's live `public.*` tables** (confirmed by checking `lib/nutrition/checkin.js`'s calls, which use the plain `supabase` client with no `.schema()` override — the `nutrition.*` versions from migration 0005 are the dead placeholder schema), so this follows the same additive/backward-compatible pattern as 0031/0033. `copyTemplateToClient` now carries the new columns over into a client's own copy, same as `question_text`/`position`.

`QuestionListEditor.js` (shared by all 4 question-list editors in the app) gained an opt-in `choicesEnabled` prop: when editing a question, a "Multiple choice" toggle reveals an options list (add/remove) plus a per-option radio marking it the "opens Zoom scheduler" trigger. Only wired on for the two **check-in** editors (`settings.js`'s template editor, `ClientSettingsModal.js`'s per-client editor) — the questionnaire editors are untouched. This changed `onUpdate`'s contract app-wide: it's now always called with a fields object instead of a bare string, so all 4 `onUpdate` handlers (2 checkin, 2 questionnaire) were simplified to plain passthroughs (`(id, fields) => updateXQuestion(id, fields)`) rather than branching by caller. **That object sent all four keys regardless of `choicesEnabled`, which broke Save on every editor whose table lacks them — see "A shared editor sent columns three of its five tables don't have" below.**

`app/(member)/nutrition/checkin.js` renders a `single_choice` question as real radio buttons (`ChoiceQuestion`) instead of a `TextInput`, in both the live and coach-reopened-week forms. On successful submit, if the member's answer matches that question's `booking_option`, a new `ZoomSchedulerModal` opens automatically.

**Real GHL calendar booking, not a stub** — confirmed live via a disposable diagnostic Edge Function (deployed, curled once, deleted same session, same pattern as the 2026-08-07 Web Push `npm:web-push` import check) that Terra's updated GHL Private Integration Token can read calendar `t7fAF1sImGuso1im6UR6` ("Nutrition Check In", round-robin, 30-min slots) — both calendar details and real free-slots came back clean. Two new Edge Functions, both JWT-verified (default deploy, same auth pattern as `ensure-nutrition-coach` — resolve the caller via their own Authorization header, not a passed-in userId): `get-checkin-booking-slots` (proxies GHL's free-slots API for the next 14 days) and `book-checkin-session` (looks up the caller's stored `ghl_contact_id` from `core.users`, fetches the calendar's real `slotDuration` rather than hardcoding it, then POSTs a real appointment to GHL's create-appointment endpoint). New `lib/nutrition/checkinBooking.js` client wrappers + `components/nutrition/ZoomSchedulerModal.js` (a real slot picker, grouped by day, Boise-local time formatting derived from the ISO string's own UTC offset rather than the device's local zone).

**"Check-in available" notification made editable, moved into Settings' renamed "Nutrition" tab** — the Settings sub-tab `templates` is now labeled "Nutrition" (was "Nutrition Templates") since it now covers more than just the two question templates. The notification's title/body/send-weekday/send-time were previously hardcoded in `scan-nutrition-checkin-available` and fired on a fixed `0 15 * * 0` (Sunday) cron; they're now `core.settings` rows edited from a new card on that tab (day-of-week pill row + a quarter-hour time picker, `NativePickerField` on native / a real `<select>` on web — same pattern as `announcements/index.js`'s own schedule picker). The Edge Function now polls every 15 minutes and gates on the configured weekday/time itself (`0043_checkin_available_notification_polling.sql`, **run**), with a new `nutrition_checkin_available_last_sent_date` setting as an idempotency guard so it doesn't refire on every poll for the rest of the matched day — same "poll cheap, gate inside the function" shape as `scan-payroll-deadline-reminders`, but needed its own last-sent guard since (unlike a payroll nag, which naturally stops once a coach finalizes) nothing else would otherwise end the matching window. The now-redundant entry was removed from the Notifications tab's `NOTIFICATION_TOGGLES` list.

**Deployed this session** (Supabase CLI was authenticated throughout): `get-checkin-booking-slots`, `book-checkin-session` (new), and `scan-nutrition-checkin-available` (redeployed with the new content/timing/idempotency logic). **Migrations `0042` and `0043` have both been run** (Terra ran them directly) — confirmed live via a direct schema query (`question_type`/`options`/`booking_option` exist on both `public.checkin_template_questions` and `public.client_checkin_questions`).

**Real test data wired up, and a real bug found along the way.** The actual live "Preference: Zoom call or Loom video this week?" question was found on the shared template *and* on both Terra's and Dustin's own per-client copies (all three converted to `single_choice`, options `["Zoom","Loom"]`, `booking_option: "Zoom"`, via a direct `db query --linked` UPDATE, same live-write access as the messaging/payroll sessions). Neither `dustin@kovastrength.com` nor `terra@kovastrength.com` had a `ghl_contact_id` on file (neither came in through the GHL import), so booking would've failed for both — Terra had two personal-email GHL contacts (`dsmout3@gmail.com`, `tsmout1@gmail.com`) she'd used to test the standalone app, and asked to tie those real contact IDs onto the two Kova staff accounts instead. Looking those up needed a GHL Contacts read scope the Private Integration Token didn't have yet (confirmed via a disposable diagnostic function, same 401-then-retry pattern as the calendar check) — Terra added it, and the lookup then resolved `dsmout3@gmail.com` → `Y5bLtvYia5p7cF86alWt` ("dustin smout") and `tsmout1@gmail.com` → `EbMFGktHgaGkoHNJnMfm` ("terra smout"). **`Y5bLtvYia5p7cF86alWt` was already hardcoded in `supabase/functions/notify-review-signin/index.ts` as `TERRA_GHL_CONTACT_ID`** (see "Text alert when Apple's App Review account signs in" above) — it's actually Dustin's contact, not Terra's, meaning that Apple-review-signin text alert has likely been going to Dustin's phone the whole time, not Terra's. **Left as-is per Terra's explicit call** ("leave it on dustin's account") — not a bug fix she wanted made. Setting `EbMFGktHgaGkoHNJnMfm` onto `terra@kovastrength.com` first hit a unique-constraint conflict — a leftover `core.users`/`auth.users` row for `tsmout1@gmail.com` itself (a separate real account, not deleted despite Terra having removed `dsmout3@gmail.com`'s auth account) already held that contact id. Per Terra's call, that leftover account was left in place, just cleared of the `ghl_contact_id` so it could move to `terra@kovastrength.com`. Both `core.users` rows now carry real, verified contact IDs. **Superseded 2026-08-09 for Dustin's half** — `Y5bLtvYia5p7cF86alWt` was moved off `dustin@kovastrength.com` onto a re-imported `dsmout3@gmail.com` member account, see "GHL contact collision silently breaks registration" below; `dustin@kovastrength.com` now has a null `ghl_contact_id` (so Zoom check-in booking won't work from that staff account), `terra@kovastrength.com` is unchanged.

**Real bug found and fixed from Terra's own click-through: the Finalize Check-In button gave zero feedback when the form wasn't fully answered.** It was hard-`disabled` whenever `!canFinalize`, so tapping it while questions were still blank did nothing at all — read as "the button isn't working," not as "you're not done yet." Fixed: the button is no longer `disabled` by readiness (only while an in-flight submit is `submitting`, to prevent a double-post) — it's just dimmed via inline `style={{opacity:0.5}}` when not ready, and both `handleSubmit`/`handleReopenSubmit` now check readiness themselves before doing anything, showing a specific message (`buildReadinessMessage` — "Before finalizing, answer the N remaining questions in the check-in form" and/or "upload this week's progress photos") via the same `submitError`/`reopenSubmitError` text that already rendered above the button. Confirmed working by Terra clicking through it directly on `localhost`.

**Verification is real for the pieces above, not the usual bundle-checked-only caveat** — the radio-button conversion, the ghl_contact_id tie-ins, and the Finalize readiness-message fix were all confirmed by Terra clicking through the actual app. **Still unverified**: actually creating a real GHL appointment through the scheduler (write access was never test-fired — read access is confirmed, but a real booking has a real side effect worth Terra trying herself now that both her and Dustin's accounts have real contact IDs), and whether an edited notification title/body/time on the new Nutrition-tab card actually changes what goes out.

## Legacy Google Sheets tracker photo import + two onboarding bugs it exposed (2026-08-09)

Terra's pre-Kova nutrition clients each had a Google Sheets "tracker" (`tsmout1@gmail.com` Drive → `My Drive/Nutrition/Trackers_Macros`) holding their progress photos. **282 photos across 9 clients** were imported into the live `public.photos` table + `photos` storage bucket: Abbi Stauffer (9), Abby Thompson (24), Ashley Curry (50), Banesa Getsinger (2), Bonnie Horsburgh (42), Michelle Dodge (39), Rae Karanjia (17), Rita Cabrera (63), Roxy Franco (36). No schema change — this is pure data.

**How the trackers actually store photos** (worth knowing if more get imported — Lauren Bottelberghe's archived tracker and Terra's own were deliberately skipped):
- Google-native files never sync as real files through Drive for Desktop, and "make available offline" doesn't change that — a `.gsheet` is a 172-byte JSON stub containing `doc_id`. Read the stub to get the id.
- Export via `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx`. **These sheets are link-accessible with no auth at all** — plain `curl` works. That's convenient here and also a real privacy exposure (client progress photos reachable by URL); flagged to Terra, not yet tightened.
- Photos live on a `Progress Pics` sheet: column A = date, columns B/C/D = **Front/Back/Side** (that order, not front/side/back). Images export as `oneCellAnchor` entries in `xl/drawings/drawingN.xml` with exact `<xdr:col>`/`<xdr:row>` and **zero offsets**, so date+angle is an exact cell lookup, not an inference. Map worksheet → drawing via `xl/worksheets/_rels/sheetN.xml.rels`.
- Date cells are messy: Excel serials, `m/d/yy`, and text with weight notes appended (`10/12/25 | 154lb`, `8/14/25 est ~280`). Guard serials to a sane range — Banesa's sheet had a corrupt `6685457` (≈ year 20200), whose 3 photos were skipped rather than guessed at.
- **Always diff on `(client_id, date, angle)` before inserting.** These clients also use the standalone Nutrition Tracker app, which writes to this same `public.photos` table — 88 photos were already present and correctly skipped, including Banesa, who turned out to be 82/84 already migrated.

**`supabase storage` CLI gotchas, both hit for real**: it works off the logged-in CLI session (no service-role key needed) but requires `--experimental`. **`cp -r src ss:///photos/<id>` nests as `<id>/<id>/…` when the destination prefix already exists** — it does not merge, and it reports success either way; upload file-by-file with explicit destinations instead. **`rm` cannot delete at all** — it returns `{"deleted":[]}` with no error even for a file uploaded seconds earlier with the same credentials, so storage deletion has to happen through the Supabase dashboard.

**Two real bugs the import exposed, both fixed** — the import was the trigger, but neither was caused by bad import data:
- **`lib/nutrition/onboarding.js`** — `getOnboardingStatus` and `getOnboardingPhasesForClients` both asked *"does this client have any complete front/side/back set, ever?"* with no date scoping, so Abbi's 2023-2025 historical sets marked her Starting Photos phase complete while she was still mid-onboarding having taken none. New exported `photosSinceEngagement(photos, client)` scopes to photos dated on/after the client's `start_date`, falling back to the client row's `created_at`, then to no filtering if neither is set — so it can never hide a legitimate photo. **Anchored on `start_date` rather than `onboarding_sent_at` deliberately**: it's the earlier of the two, so a client who shoots their photos before the coach gets around to hitting Send still counts.
- **`app/(coach)/nutrition/clients/[userId]/onboarding/photos.js`** — a genuinely separate bug the first fix did *not* solve. That screen never reads the phase flag; it computes its own starting set as "the earliest date among all photos on file," so Abbi's oldest imported set still rendered as her starting photos. Now reuses the same `photosSinceEngagement()` so both paths share one definition, then takes the earliest date within the engagement. Also fixed a latent crash in the same file — the `loadError` Retry button used `Pressable` without importing it, so the error path would have thrown instead of offering a retry. **Lesson worth generalizing**: a "phase complete" flag and the screen that displays that phase's content can compute the same concept independently — fixing one doesn't fix the other, so grep for the concept, not just the flag.

Verified by SQL simulation across every not-yet-approved active client (only Abbi's phase changes, the other four are untouched) plus a clean `npx expo export -p web`. **Not click-tested** — standing login limitation.

## Nutrition coach-side pass: reorder, calories, photo scheduling, plan phases (2026-08-11)

Six asks from real coach use, plus one real bug found while investigating them.

**Shared reorder mechanism, built once and used three times.** New
`components/SortableList.js` + `.web.js` — `@dnd-kit` drag on web (the builders'
proven pattern: 4px activation distance so rows stay clickable, `pointerWithin`,
a *separate* small `⠿` handle rather than a whole-row drag), `▲`/`▼` on native
(`QuestionListEditor`'s pattern), one API: `renderItem(item, controls)` where
`controls` is a ready-made node the caller drops into its own row. **Nested
`DndContext` works** — verified by driving both an inner (phase items) and outer
(whole phases) drag in the same tree. Focus items got it via new
`reorderFocusItems` (`public.focus_items.position` already existed — verified live
as `integer NOT NULL`, no migration); `FocusChecklist` had to gain local state
mirrored from props, since it was purely controlled and a drop would visibly snap
back while the parent's full refetch resolved.

**Calories.** The Targets-tab modal already had them; the screen actually missing
them was the onboarding Tracking page (`onboarding/tracking.js`). Four files were
hand-rolling `4/4/9` — all collapsed onto `deriveCalories`. Week summary
(`WeekList`) gained **Weight, Calories, Protein, …** (Terra corrected the order
mid-session — calories second, not first) plus **Quality** after Sleep.
`sleep_quality` was already averaged by `summarizeWeek` and simply absent from
`METRIC_COLUMNS`; calories are stamped onto each day inside `summarizeWeek` via new
`loggedCalories` (distinguishes "logged nothing" from "logged zero", so a
weight-only row shows `—` instead of `0` and doesn't drag the average down).
`WeekDayTable` was dead (imported nowhere) and was deleted rather than left to drift.

**Real bug found and fixed first: a late check-in submitted *with* photos rendered
"⚠ Photos missing" to the coach.** The same requirement was evaluated against two
different windows — the coach filtered strictly to `week.start..week.end`, the
member gated on a rolling `today − 5 days`. That rolling window was never as
generous as it looked: a week only becomes current once it's over, so `today − 5`
could never reach back before `week.start`; it only clipped the week's own first
days while letting post-week photos count. By Saturday it had **zero overlap** with
the week being checked in on, so the client couldn't satisfy the gate with any
photo from that week, uploaded one dated after it, passed both member and submit
gates — and the coach's row then said photos were missing. New
`photosForRequirementWeek(photos, week)` in `photos.js` is now the single
definition, bounded `week.start … week.end + 6` (the covered week plus the filing
window it stays current for), used by the coach timeline, both member gates and the
server-side submit gate. The coach-reopened path is deliberately *not* routed
through it — it's filed long after its grace period and has its own documented rule.

**Photo scheduling reworked around "pick the Monday."** Coaches think in **check-in
Mondays** (the Monday they review it); everything stored is keyed to the Monday that
*starts* the covered week, 7 days earlier. New `checkinMondayForWeek` /
`weekStartForCheckinMonday` / `mondayOnOrAfter` in `weekCycle.js` convert **at UI
boundaries only** — nothing stored moves, so all five `isPhotoRequirementWeek` call
sites were untouched. The raw `YYYY-MM-DD` text field and its two quick-fills are
replaced by new `components/nutrition/MondayPicker.js`: a Monday-only month grid
(non-Mondays inert) that **dots every Monday the cadence will land on**, so the
resulting schedule is visible while picking. The one-off extra week moved into the
same picker, so `CheckinWeekTimeline`'s per-row "+ Require photos" is gone — with a
single-date column it silently *moved* the flag off whatever week held it.
`requirePhotosNextCheckin`/`clearPhotosNextCheckin` deleted with it. Grid math
extracted to `lib/monthGrid.js`, shared with `DateCalendarPicker`.

**Two corrections worth remembering.** (1) Snapping legacy non-Monday anchors
*backward* to the containing Monday — my first instinct — would have **shifted every
biweekly/monthly client's photo weeks by 7 days**. Forward-snap (first Monday on or
after) is provably a no-op for `floor((week − anchor)/7)`, so `mondayOnOrAfter` runs
on the picker's **read path** and no data migration was needed. (2) `formatDateMDY`
emits dashes, not slashes. Both verified by a real Node arithmetic run, not reasoning:
round-trip exactness, the picked Monday genuinely being the first required check-in at
all four cadences, the UI's dots exactly matching `isPhotoRequirementWeek`, and
forward-snap equivalence.

**Relabeling** is exactly two places, changed together because they're reachable from
the same screen: `CheckinWeekTimeline`'s row label and the Check-In tab's week
navigator, both now `MM-DD-YYYY check-in`. **Deliberately not relabeled**: `WeekList`,
member Weekly, `WeeklySnapshot`, and both member check-in labels — those are
calendar-week/daily-log surfaces (a different week series), where a check-in Monday
would be actively wrong.

**Notification** — answering "do we need to change it?": the function inserts **one
shared** announcement row and then loops **individual** pushes, so the photo reminder
is appended to the per-user push body only, for clients who actually owe photos
(`_shared/photoRequirement.ts`, the usual hand-synced client/server duplication;
ports `computeWeekWindows` rather than assuming Sunday, since the send weekday is
configurable). Editable as `nutrition_checkin_available_photo_line` on Settings →
Nutrition. **Known asymmetry**: only the push can be personalized — the in-app popup
keeps the generic body.

**Plan phases** (new) — `programming.nutrition_plan_phases` +
`nutrition_plan_phase_items` (migration `0050`, **run and verified**). Two levels: a
phase (title + optional note) holding bullet items. **Deliberately not dated** per
Terra — `position` *is* the timeline. Named `plan_phases` because "phase" is already
taken by the derived onboarding phases (`PhaseCard`/`computeOnboardingPhases`). Coach
UI is a card on the Dashboard tab beside Milestones (fetched in the page's **tier-3
isolated try/catch**, like milestones/reopens, so an unrun migration can't blank the
page); members see them on the Today card slider as **one "What we're working on" card
per phase, top three only** — stacking several into a single card didn't read at phone
width, so they follow the same one-slide-each shape as the milestone cards below them.
No status/completed flag in v1 — delete to retire.

**Everything about the phase card is edited in place — there is no form modal.** The
first pass used one and Terra rejected it: "+ New phase" now drops a blank card in
with the name field autofocused, and it becomes a real row the moment the name is
filled in (bullets need a `phase_id`, so they only appear once it's real). Title sits
at the very top in `colors.primaryOnWhite`. **Only whole cards drag** — bullets keep a
`position` as stable insertion order but are deliberately not draggable, so a drag is
never ambiguous about what it's moving; `reorderPhaseItems` was deleted with that
decision.

**Two real interaction lessons from this card, worth reusing:** (1) Bullets are added
via a **"+ Add bullet" button that opens a draft input**, not a permanent empty input
at the bottom of the list. The permanent-input version shipped first and Terra
reported it exactly right — "you hit enter, and then it pauses, loses the cursor
focus, and then it appears and you have to click it again": pressing Enter awaited
`addPhaseItem` *and* the parent's full refetch while the input was still mounted. The
draft now closes **before** the await, so nothing sits half-alive waiting on the round
trip. (2) **Enter fires `onSubmitEditing` and then `onBlur` as the field unmounts**, so
every save-on-blur field here guards with a `useRef` flag — not state, since both
handlers run before a `setState` would apply. Without it a single Enter added the
bullet twice.

**Real bug fixed in `TodayCardSlider` while adding those cards — worth knowing, because
the measurement was silently measuring its own output.** The slider sets its height to
the tallest slide measured via `onLayout`, but a flex row stretches children to the
container's cross-axis size by default, so each slide was being handed the ScrollView's
*current* height and `onLayout` reported exactly that straight back. The height could
therefore never grow past its first measurement, clipping any card taller than it — long
coach notes in practice, which is how Terra found it. Fixed with
`contentContainerStyle={{ alignItems: "flex-start" }}` so each slide sizes to its own
content; that one line is load-bearing, not cosmetic. Verified with a long note (height
grows from the 120 floor to the real content height, short cards keep their natural
height). Slide order is now focus → notes → phases → milestones → completed milestones.

`nutrition_plan_phases.label` (an optional free-text timeframe from the first pass) is
**live but no longer written or read** — the inline rework put the title at the very
top and left it no home. Kept rather than dropped: nullable, costs nothing, and it's
exactly the column a "timeframe" field would need if that comes back. Don't assume it
holds anything.

**Also**: `OptionPicker`/`OptionStepper` extracted (three hand-rolled copies of the
web-`<select>`/native-modal picker existed) and used for the new **date dropdown in
"Fix a day's photos"** — previously a bare `‹`/`›` stepper, which with the 282
imported Google-Sheets photos meant dozens of clicks to reach a date. That editor now
tracks the selected *date* rather than an index, and its list runs oldest-first so `‹`
steps back in time.

**Verification**: `npx expo export -p web` clean throughout; `SortableList` (both
drags, and that a row's own checkbox/edit/delete still work alongside the handle),
`MondayPicker` (non-Mondays inert, picking shifts the schedule and stores the anchor 7
days earlier) and `PlanPhases` (one handle per card and none on bullets, inline typing,
"+ Add bullet" opening a focused draft) all driven and screenshotted via the
login-screen harness, reverted after each. Phase-card drag specifically was confirmed
**by Terra in the real app** — the synthetic pointer-event technique reported it as not
working, which is a known-flaky bit of this tooling, not a code fault; trust a real
click-through over it. **Not verified**: the
redeployed Edge Function was never invoked — the smoke test was blocked, and it can't
be exercised without a real Sunday send. Worth a click-through of the settings modal
against a real client, and confirming the next Sunday push carries the photo line for
someone who owes photos and not for someone who doesn't.

## Check-in answer highlighting: three real selection bugs (2026-08-11)

Reported as "we lost our ability to highlight text" on the coach's Check-In tab.
Nothing had actually been removed — `components/nutrition/HighlightableAnswer.web.js`
was intact, correctly resolved as the `.web.js` variant, present in the **deployed**
bundle (checked by curling `app.kovastrength.com`'s real entry bundle and reading the
compiled function, not assuming), and the writes were landing — 8 of 11 rows in the
most recent check-in week had non-null highlights, and `public.checkin_responses`'
coach policy is a plain `is_coach()`, so RLS was never the gate either. Ruling those
four out first is what turned this from "something broke" into "the selection reader
has always had holes." All three fixes are in that one file; no schema, no deploy step.

1. **Releasing the drag past the end of the text did nothing** — the most likely thing
   Terra was actually hitting, and the reason it reads as a total loss rather than a
   quirk. `onMouseUp` was on the answer's own container `View`, but a mouse event fires
   on whatever is under the pointer **when the button is released** — drag across a
   sentence and let go a few pixels past the last word (or drift onto the next line)
   and the release target is the card, not the answer, so the handler never ran at all.
   Now a `document`-level `mouseup` listener; safe because every offset it computes is
   already clamped to this container's own text, so a global listener can't leak into a
   neighbouring answer (verified: a drag past answer 2's last word highlighted only
   answer 2).
2. **Highlighting over an existing highlight wiped it.** A drag starting *and* ending
   inside one already-highlighted `<span>` fires `mouseup` (adds the range) and then
   `click` on that span (removes it) — net effect, the highlight vanished. So the more
   an answer was already marked up, the more highlighting felt broken. A
   `justSelectedRef` set on a completed drag and cleared on the next `mousedown` makes
   the remove-click ignore the click that's merely the tail of a drag. (A drag that
   *crosses* spans never had this — the click event targets the common ancestor, so the
   span's own handler doesn't fire.)
3. **A boundary landing outside the answer bailed instead of clamping.** Starting the
   drag on the question label above, or ending it in the whitespace to the right, put
   one boundary on a neighbouring node and the old all-or-nothing `contains()` check did
   nothing. Now it tests intersection via `compareBoundaryPoints` and clamps the outside
   boundary to `0` / `text.length`.

**`compareBoundaryPoints`' constant names read source-to-this, and I got them backwards
first** — `END_TO_START` compares *this* range's **start** against the source's **end**;
`START_TO_END` compares this range's **end** against the source's **start**. Swapping
them made every in-text drag silently bail, which the harness caught immediately. Worth
re-deriving from the spec rather than from the name if this is ever touched again.

`textOffset` also switched from a hand-rolled `TreeWalker` to measuring a range from the
container's start to the boundary — same result on text nodes (verified: identical
offsets before and after), but it also handles an element-node boundary, which is what a
drag ending on whitespace produces.

**Verified by driving real mouse drags**, not reasoning: the check-in answers section was
mounted on the login screen with the real `CoachShell`/`ScrollView`/`SectionCard`
ancestors (standing harness technique, reverted after) and all four cases exercised with
the browser tool's actual drag — normal drag, release-past-the-end, re-drag inside an
existing highlight, and click-to-remove. `expo export -p web` clean. **Terra confirmed
working in the real app.**

**Still unexplained if it recurs**: no case was ever found where the text wouldn't
*visibly* select at all. If that specific symptom comes back, it's a different problem —
get browser and device before digging, since none of the above would cause it.

## Coach web v2 — phase 5, the nutrition client record (screens 17-25)  (2026-08-12)

The last phase of the handoff. Nine screens: the module home plus the eight
tabs of one client's record. One migration (`0059`, **not yet run**), two new
lib modules, thirteen new components, seven deleted.

**Screen 17 — the module home is a queue, not a roster.** It used to be
filter chips over a table of everyone, which answers "who do I have" — a
question a coach opening this page already knows the answer to. Now the
status that's genuinely waiting on her opens with its clients listed and
everything else is one collapsed line carrying its count, next to a preview
pane for whoever is selected. Same data, same statuses (`rosterStatus` is
untouched), different question.

- `lib/nutrition/queue.js`'s `getQueuePreview(userId)` is scoped to ONE
  client deliberately and is **not** folded into `getNutritionRoster` —
  that already fetches logs for all ~31 clients to compute the tiles, and
  pulling a week of macros, a target and photo URLs for every one of them
  so a single pane can render would throw 30/31 of it away.
- `components/nutrition/QueueList.js` (left rail) and `QueuePreview.js`
  (right pane). The preview has **no finalize button**, on purpose:
  completing a check-in means reading her answers, and a one-click "done"
  next to a summary invites clearing the queue without doing that.
- **"+ Enrol client" is new as an entry point, not as a feature** —
  `createOrReactivateClient` already existed, buried on a switch on the
  client's *programming* page, which is the wrong place to look when
  you're standing in the nutrition module.

**Screen 18 — the Onboarding tab is gated on FIRST TARGETS, not the
approval stamp.** Those come apart in a real, previously-patched-over way: a
pre-existing standalone-app client switched on in Kova is already approved
with no target, which used to give her a full set of tabs all measuring her
against nothing (the 2026-08-03 fix bolted a "No target set yet" banner onto
every tab instead). The tab now appears whenever `targets.length === 0` and
disappears the moment a target exists. The mock's second button ("Ask her
for more") is replaced by Kova's real one, **Close out onboarding** — the
case that actually comes up is a client who finishes two of three and
stalls, and without it there is no way forward.

**Screen 19 — Dashboard absorbs Trends**, which is gone as a separate tab: a
coach looking at a weight trend is already asking what the macros were
doing, and making that a tab switch meant the two were never on screen
together. One range control governs the weight chart and all four small
charts (handoff note 8); the **macro rings stay pinned to 7 days whatever
the range says**, because a 6-month macro average is not a number anyone
should act on and putting it under the same picker invites exactly that.
New `WeightBarChart.js` (bars, not a line — weigh-ins are discrete daily
readings with real gaps, and a line interpolates straight through a missed
day as though it were measured; bars from the current target's effective
date render clay, so the chart says "this is the stretch under the numbers
she's on now" without a second legend) and `MetricSparkTiles.js`.

**Screen 20 — Weeks is one row per week, opening into its seven days**
(`WeekRows.js`), replacing the flat metric grid. A target change is drawn
BETWEEN the two weeks it separates, not on either of them — the point is
that everything above the line was measured against different numbers.

**Screen 21 — Plan.** `nutrition_plan_phases` gets a coach-set
`status` (migration 0059), reversing 0050's "position is the timeline, delete
to retire" decision. Order and status turned out to be **different facts**:
order says which phase comes next, status says which one she's actually in,
and those diverge the moment two themes run side by side or a phase is
parked. It also means a finished phase stops reading as upcoming without
being deleted, which used to throw away the history of what she'd worked
through. Deliberately a free column, not derived — "the first not-done phase
is the current one" is tempting and wrong.

**Screen 22 — Check-In pairs every answer against last week**
(`lib/nutrition/checkinAnswers.js` + `CheckinAnswerList.js`). Answers
matching word-for-word fold behind one count line so what moved is what's on
screen. `HERS ONLY` marks a question not in the gym template, matched on
question text — a client's copy is physical, not a live join
(`copyTemplateToClient`), so text is the only identifier the two share.
**When the template fails to load the badge is suppressed entirely rather
than defaulted**: silently badging all 18 questions as client-specific is
worse than badging none. The right rail pairs the LIVE game plan with the
focus items FROZEN at submission — showing today's list against last week's
answers had the coach marking her against goals that didn't exist yet.

**Screen 23 — Photos, compare-first** (`PhotoCompareRail.js`, distinct from
`PhotoCompare.js`, which the member tab and the compare tool keep). The
handoff's perf requirement (note 7) is the whole design: the browse rail is
TEXT — dates and weights already in hand from the `photos` rows — and only
the two compared images are ever signed. The legend doubles as the control
(pick a side, then pick a date) because a bare date click would have to
guess which pane you meant.

**Screen 24 — Targets** (`TargetsEditor.js` + `TargetHistoryTable.js`, both
superseding `NewTargetForm`/`TargetsHistory`). History now shows what
*moved* rather than each row's absolute numbers, via a new `diffTargets` in
`lib/nutrition/targets.js`. **Two deliberate deviations**: the mock's
"Recalculate calories from macros" button is dropped — calories are never a
stored column, always Atwater factors over the three macros, so the box
already recalculates as you type and a button would imply an override that
can't exist; and fibre/steps/sleep are kept below the four the mock draws,
because they're real target columns and losing them to a redesign that
simply didn't picture them would be a regression.

**Screen 25 — Settings moves off the gear icon onto a tab**
(`ClientSettingsPanel.js`). `ClientSettingsModal.js` is deleted, not kept
alongside. Name and phone survive even though the mock's Client card only
draws start date / coach / status — same reasoning as the targets above.

**Real bug found by verification, not by review — and it would have shipped.**
`PhotoCompareRail` fired **244 signed-URL requests** where it should have
fired one, on the very screen whose entire purpose is not doing that. The
effect computed "which paths still need signing" as *paths with no entry in
`urls`* — correct-looking, and an infinite loop the moment signing yields a
null URL for a path (which Supabase does per-path for an object that no
longer exists): the write lands, the key is still falsy, the effect re-runs
forever. Now tracked in a ref of attempted paths. **The first fix had the
same bug in slower motion** — clearing the mark on failure to allow a retry
meant a hard failure re-signed on every render; a blank frame until reload
beats a request per render. `NutritionCheckinTab`'s thumbnail fetch had the
identical shape arrived at from the other direction (effect keyed on a
`photos` array the parent rebuilds every render) and was fixed with it.
**Worth remembering as a class: an effect that derives "still needed" from
the state it writes will loop whenever the write doesn't satisfy the
predicate.** Neither instance is visible in a bundle check or a screenshot —
only counting real requests found them.

**Deleted after verifying zero references**: `ClientSettingsModal`,
`NewTargetForm`, `TargetsHistory`, `OnboardingStepper`, `WeeklySnapshot`,
`TrendTiles`, `WeekComparison`. `MacroPills.js` stays despite its own
component being unused — `TargetField` imports its `MACRO_STYLES` palette.
`WeekList.js` stays for `enumerateRecentWeeks`; its table component is now
rendered nowhere.

**Verification.** `npx expo export -p web` clean after every batch. The
rings (stroke colours checked against the ±10% band in the DOM, not
eyeballed), weight chart, spark tiles, week rows with their expanded day
table and target-change divider, the targets editor and history, the
check-in metric strip and answer list with its collapse toggle, the queue
rail, the photo rail, and the plan-phase badges were all rendered against
fake data via the login-screen harness and screenshotted; the harness was
reverted and `git diff` on `login.js` confirmed clean. **Not verified**: any
of it behind a real login (standing limitation). **Migration 0059 is run**,
so the Plan tab is fully live — all 16 existing phases read `planned` (no
badge) until a coach sets one, which is the intended no-backfill behaviour.
Worth Terra's click-through, especially the queue's preview against a real
week, a real target save, and the Settings tab now that it's a tab.


### Phase 5 follow-up — Terra's click-through (2026-08-12)

Sizing and onboarding fixes from real use. Several are the same root cause
wearing different hats: **a component that guesses its own size from the
window instead of measuring what it is actually inside.**

- **Dashboard charts didn't grow with their card.** `chartWidth` was computed
  from `useWindowDimensions` minus a hand-subtracted sidebar, page padding and
  rail — wrong (the sidebar is 232px, not the 320 guessed) *and* capped at
  1180, so the card kept growing while the chart stayed put. Now measured with
  `onLayout` on the chart's own container. **Guessing a child's width from the
  window is the bug; measure the parent.**
- **Macro rings clustered left** — each column now `flex: 1` so the row
  spreads across whatever card holds it (`minWidth` is the wrap point, not the
  width).
- **The Weeks day table sat narrower than the target bars above it** in the
  same card — fixed-width columns became `flex` + `minWidth`, inside a
  `ScrollView` with `contentContainerStyle: { flexGrow: 1 }` and a
  `TABLE_MIN_WIDTH` floor, so it fills when there's room and scrolls when
  there isn't.
- **Check-in: the rings card was shorter than the photos beside it** — `flex:
  1` on the Cards themselves, not just their wrappers, and the rings centre in
  the height the photos set.
- **Photos, twice.** First pass: unbounded 3:4 panes worked out ~550px wide
  and ~730px tall on a desktop card, taller than the viewport, pushing the
  rail below off screen. Capping the width fixed that and made them tiny on a
  big monitor. Now **height leads** — the pair fills the window minus a
  `CHROME_HEIGHT` constant — and width follows from the ratio, clamped so two
  still fit side by side. The date pill on each photo is now that side's
  picker (tap it, get every date on file with its weight); the legend
  selector, chip rail and year toggle are gone with it. "Manage photos" moved
  into `ManagePhotosModal` so the compare area gets the whole window.
- **Targets copy**: dropped "for your history, not shown to her", placeholder
  is now "What changed and why", and the "Every change is stamped on the
  Weeks tab too" footnote is gone.
- **Settings was badly broken and it's a footgun this repo has hit before**:
  the Client card rendered as a sliver with every label stacked one letter per
  line. Cause is `flex: 0`, which react-native-web compiles to `flex: 0 1 0%`
  — the 0% basis collapses the explicit width to nothing. Use
  `flexGrow: 0, flexShrink: 0, width: N`; **never bare `flex: 0` alongside a
  width.** Also: the photo-cadence calendar opened on today rather than the
  selected Monday, because `MondayPicker` reads its month from `value` on
  first render only and the value was arriving a tick later from an effect —
  now seeded synchronously in `useState`.

**Onboarding**, from a separate round of the same click-through:

- **The client record now opens on the Onboarding tab** for a client who is
  onboarding. Tab state starts `null` ("not chosen") so the default can depend
  on data that hasn't loaded at `useState` time.
- **The hero counted a skipped step as done** — "One of three done" for a
  client who had submitted nothing. Objective tracking is optional per client
  and `computeOnboardingPhases` marks it complete when zero days are assigned;
  the hero now counts only the steps actually being asked of her, so that
  client reads "None of two done".
- **"Close out onboarding" left the tab behind.** The tab was gated on first
  targets (the handoff's wording) rather than on approval, so closing out and
  not immediately saving a target left it sitting there looking like the
  action hadn't taken. **Now gated on `objective_tracking_approved_at`** —
  exactly what close-out sets. The approved-but-target-less case that gate was
  protecting against is covered by the restored "No target set yet" banner,
  which is a better fit anyway: she isn't onboarding, she just needs numbers.

**Verified** by screenshot at 1440×900, 1280×680 and 1440×1000: rings and day
table filling their cards, the Settings client card rendering properly with
the calendar on the right month, the photo panes tracking window height, the
date-pill picker opening and actually swapping the pane (header recomputed to
"23 weeks apart · −4.2 lb"), and the Manage photos modal. **Tooling note:** the
Browser pane's `resize_window` changes the viewport *without* dispatching a
`resize` event to the page, so anything driven by window size looks frozen
under test — a manually dispatched `resize` updated it instantly. Don't
diagnose a live-resize bug from that tool alone.


### Phase 5 follow-up, round 2 (2026-08-12)

- **Targets**: "Fibre" → **Fiber** (US spelling, matching every other label).
  Fiber/Steps/Sleep are now the same width as Protein/Carbs/Fat — both rows
  are four flex columns and the second row's fourth slot is an empty spacer,
  rather than three fields splitting the space four had. The sleep unit ("h")
  was rendering outside its box: **an `<input>` will not shrink below its
  intrinsic content width in react-native-web without `minWidth: 0`**, which
  shoves a sibling out past the border. Identical failure to the member v5
  pass's sleep tile — worth grepping for whenever a unit or suffix escapes its
  container.
- **Check-in shows every answer, every week.** The fold-the-unchanged-behind-
  a-count behaviour is gone (`splitAnswers` deleted with it, along with the
  now-unused `unchanged`/`blank` fields) — reading the whole check-in is the
  job, and deciding for the coach which parts deserve her time isn't this
  screen's call.
- **Focus and game plan are editable on the Check-In tab until it's
  finalized**, then frozen. Revising them IS the review, so both stay live
  while the coach works; **`finalizeCheckin` now re-captures them onto the
  response row** and the rail switches to "Game plan that week" / "Focus that
  week", read-only. `targets_snapshot` is deliberately NOT re-captured: a
  target set during review takes effect going forward via its own
  `effective_date`, so overwriting the week's snapshot would retroactively
  claim she was working to numbers that didn't exist yet.
- **No photos, no photos box** — the target card takes the full row instead of
  sitting next to a card whose only content was "none came in". Photos aren't
  policed here, so their absence isn't news.

Screenshot-verified at 1440×950: Fiber spelling and equal field widths with
the unit inside the box, all five answers rendering (including one identical
to last week), the editable rail on an open check-in and the frozen
"that week" rail on a finalized one, and the full-width target card with no
photos.


## Weeks tab: British spellings, week rings, note tap, and the real "everything
is Week 1" bug (2026-08-14)

Four reports off the coach's nutrition client record, plus a data correction
that came out of the third one.

**"programme"/"enrol" → "program"/"enroll".** Reported as "some French".
`weekOnProgramme` → `weekOnProgram` (3 call sites), the Weeks tab's "N weeks
on programme" header, and the Nutrition queue's "+ Enrol client" button,
empty state, modal title and toasts. **"programmed" is deliberately left
alone everywhere** — that's the correct US spelling of the verb, not a
British leftover, and "3 sets programmed" is not a typo.

**Every week reading "Week 1" — two causes, one code, one data.**
`weekOnProgram` clamped any date *before* the client's start date to 1. That
read fine for its original caller (which passes `today`), but the Weeks tab
numbered each row from the week's **start**, so for a client whose
`start_date` sat near today every displayed week ended before she began and
came back as Week 1. Ashley Curry showed three identical "Week 1" rows. Now:
the function returns **null** for a pre-start date, and the Weeks tab numbers
from the week's **end** — so the week that *contains* the start date is week
1, and a week that finished before she started gets no number and falls back
to its date. The two queue callers already handled null (` week ? ... : ""`),
so a future-start client now reads as "not started" rather than "week 1",
which is more honest.

**The data half: `start_date` was the GHL import date for most migrated
clients**, not their real start — Ashley's said 2026-08-06 while her photos
went back to 2025-02-12. Corrected 11 rows from their legacy Google Sheets
trackers (`GoogleDrive-tsmout1@gmail.com/My Drive/Nutrition/Trackers_Macros`,
still synced locally — no links needed), using each client's first genuinely
logged day, or `min(daily_logs.date)` where the tracker's logs were already
imported. **Only `start_date` was written; nothing else touched.** Rollback
SQL with every prior value was saved before applying.

| Client | was | now | | Client | was | now |
|---|---|---|---|---|---|---|
| Abbi Stauffer | 2026-08-02 | 2023-12-18 | | Rae Karanjia | `0026-07-22` | 2025-08-22 |
| Banesa Getsinger | 2026-07-11 | 2024-03-04 | | Roxy Franco | 2026-07-14 | 2025-11-03 |
| MIchelle Dodge | 2026-07-20 | 2024-10-07 | | Bob Getsinger | 2026-07-17 | 2026-01-23 |
| Rita Cabrera | 2026-08-03 | 2024-11-11 | | Abby Thompson | 2026-07-11 | 2026-02-02 |
| Ashley Curry | 2026-08-06 | 2024-12-16 | | Terra | 2026-08-04 | 2026-02-10 |
| Bonnie Horsburgh | 2026-07-20 | 2025-08-20 | | | | |

Rae's was **`0026-07-22`** — year 26, a separate typo found in passing.
Dates were only ever moved **backward**; clients whose `start_date` already
preceded their first log (signed up, started logging days later) were left
alone. All 11 are past onboarding, so moving the anchor back can't retro-
satisfy an onboarding phase via `photosSinceEngagement`.

**Tracker parsing produced wrong dates twice before it was right** — traps
now recorded in [[google_tracker_full_import]]: column layouts differ between
sheets (Rae's is shifted, so fixed indices read her Calories *formula*, which
carries a 0 on untouched days, as protein); **column A is not data** (it holds
`Establish 1` block labels and a `Weight / Start 154` caption that normalises
to exactly `weight`, so every block label read as a logged weight); and a
sheet can carry **several header rows with real data above the first one**
(Abbi's). Final values were checked row-by-row against the raw sheets rather
than trusted from the parser. Still open for Terra: Abbi at Week 139 logged
549 of ~972 days, so a break-and-restart may deserve a later anchor, and
Roxy/Rita/Bonnie each have a starting photo days-to-weeks before their first
log if "start" should mean first contact.

**Week-average bars → rings, with the target stated.** On the PWA the four
macro bars ran off the right edge: each needed ~96px, putting a hard 420px
floor under that row that no `flex-wrap` could shrink. Replaced with a ring
per macro (value inside, macro + `of {target}` beneath) in a fixed 62px
column, so all four fit in ~272px and wrap cleanly. Measured at 375px: page
scroll width equals client width, and **zero** elements overflow outside the
day table's own intentional horizontal scroller. The ring keeps the bar's
three-tone ±10% rule **including red**, deliberately NOT `MacroDial`'s
never-red rule — a finished week's average genuinely can be over target,
where an in-progress day is only ever "not there yet".

**Tapping a note never worked because it was never wired** — the Note cell was
plain `numberOfLines={1}` text with no press handler at all, so a long note
was unreadable from this table. Now a `Pressable` that opens it to full text,
with a chevron marking any day that has one, and the row switching to
`items-start` while open so the day's numbers sit on the note's first line.
Verified by driving a real tap: 16px → 60px, clamp removed.

Rings and the note tap were screenshot- and DOM-verified at 375px and 1440px
via the login-screen harness (reverted, `git diff` clean). `npx expo export -p
web` clean. **Not verified behind a real login** — standing limitation.

## Closing out a check-in, week phases, and a real table-overflow bug (2026-09-01)

Three nutrition asks in one pass. Migration `0111` — applied and verified live.

**Closing out a check-in.** A client who simply doesn't check in sat on the
roster as "Awaiting client check-in" (urgent, red) until the week rolled over
on its own. There was no way to resolve it — a coach who already knew the
check-in wasn't coming had to look at a red row for the rest of the cycle.

`programming.nutrition_checkin_closeouts` mirrors `nutrition_checkin_reopens`
(0028) in shape and for the same reason. **Deliberately NOT a fabricated
`public.checkin_responses` row with empty answers**: that table is shared with
the standalone Nutrition Tracker app, and a blank response would render there
— and on Kova's own Check-In tab — as though she had answered.

Three properties worth keeping:
- **A real response always wins.** `deriveCheckinStatus(response, closeout)`
  checks the response first, so a client who files late un-closes her own week
  with nothing for the coach to undo. That is also why the close-out
  deliberately does **not** gate the member: closing a week out early costs
  nothing, where blocking her would turn a tidy-up into a lockout.
- **Staff-only in every direction, no member policy at all** — same as
  `client_notes`/`client_limitations` (0057). The member never needs to read
  it, because it changes nothing on her side.
- **Unique on `(user_id, week_start)`**, so the write is an idempotent upsert
  and a double-tap can't leave two rows a later Undo only half removes.

Surfaced on the Settings tab's check-in timeline (Terra's own pick), which the
Check-In tab's week picker also renders, so both get it from one component.
Actions are quietest-first: a missed week offers Reopen (grant a late-filing
window) **and** Close out (resolve it); a closed-out week offers only Undo —
"Reopen" there would mean two different things at once.

New roster status `checkinClosed` ("Check-in closed out", **paused** tone, not
onTrack — reading it as "completed" would claim a check-in happened). It slots
into the web queue's Active group, which is a collapsible list rather than a
fixed tile row, so a fourth status was no layout risk. **Coach Home's own
nutrition breakdown deliberately folds it into "completed"** — those four
buckets answer "how much is still outstanding", and a closed-out week isn't;
a fifth tile for the one state nobody has to act on would be worse.

**Week phases.** `programming.nutrition_week_phases` — which named phase a
client is in, week by week, counted ("Diet 1", "Diet 2"), as a pill top-left
of each row on the Weeks tab. Not the same thing as
`nutrition_plan_phases` (0050) despite the shared word: that one is the
coach's **undated** "what we're working on" map where `position` is the
timeline. This is dated, counted, and the member never sees it.

**One row per phase CHANGE, not per week.** A row means "from this week
onward, the phase is X" and holds until the next row. That is what makes the
counter free — a week's number is just how many weeks it sits after the marker
covering it — and it means setting a phase once doesn't have to be repeated
every Monday. A null `phase` is an explicit "no phase from here", which ends a
run without erasing that it ran.

Terra described the edit as "changes all the weeks from the week you have
selected until the current week". The run model gives exactly that in the
common case and stops at a later deliberate change instead of silently wiping
it — so the popup **states its own blast radius** ("Applies to every week from
here until 09-07-2026, where it changes again") rather than promising "from
here on" when that would be a lie.

Two guards worth keeping: a `week_start` CHECK that it's a Monday (the Weeks
tab enumerates Mon-Sun weeks, so a marker half a week off the grid would cover
nothing — same guard `group_blocks`/`spc_blocks` got in 0063), and
`isRedundantPhase`, which refuses "set Diet on a week already inside a Diet
run": a coach opening a pill that reads Diet and pressing Diet expects nothing
to happen, not for the numbering to reset to 1.

The popup is anchored to the pill via `measureInWindow` (a
`getBoundingClientRect` on react-native-web, so it stays right on a scrolled
page) and clamped to the viewport on every edge, falling back to centred if
the anchor is missing.

### The Weeks tab's sideways scroll: it was MAX-content, not min-content

Reported as "open the current week and it fits, open an older one and it
over-expands and you have to scroll left to right". Real bug, and the obvious
diagnosis was wrong in a way worth remembering.

The chain, measured rather than assumed: the day table lives in a horizontal
`ScrollView` whose content container is **`flex-shrink: 0` with `flex-basis:
auto`**, so its width is its **max-content** width, not the scroller's. A
row's max-content is the sum of its cells', and a note cell's is the note on
one unbroken line (`numberOfLines={1}` compiles to `white-space: nowrap`). One
200-character client note therefore asked for **1726px inside a 1066px card —
660px of sideways scroll** — while a note-free row asked for 676. That is
exactly why the current week looked fine (nobody has written a note in it yet)
and older weeks did not.

**`minWidth: 0` does NOT fix this**, despite being the usual flex-overflow
remedy — and it was the first fix tried. It lets a flex item shrink *under
pressure*, and nothing is applying pressure when the container is being sized
BY its content. Measured directly: with `min-width: 0px` on the note text, the
row's min-content dropped to 676 and the table was still 1726, because
max-content was the operative constraint all along.

Fixed with a `maxWidth` on the note cell, applied in **both** the collapsed and
expanded states — lifting it while the note is open put the overflow straight
back, and expanding is about reading every line, not widening the column.
Result: the table now caps at 846px regardless of note length (526 for the
other columns + the 320 cap), so it never scrolls on a card ≥866px and
degrades by a bounded, predictable amount below that instead of by however
long somebody's note happened to be.

**Generalisable: when a table inside a horizontal ScrollView is too wide, check
max-content, not just min-content**, and reach for a cap on the unbounded cell
rather than `minWidth: 0`. `el.style.width = 'min-content'` / `'max-content'`
around a `getBoundingClientRect()` is the measurement that tells them apart.

**Verification.** Migration dry-run in a rolled-back transaction (Monday CHECK
bites, unique bites, both inserts land), then an 8-assertion RLS impersonation
test as a real coach and a real member (coach reads/writes/deletes; member sees
0 rows and is refused 42501 on insert) — also rolled back — before applying for
real; tables, policies, RLS and a live PostgREST 200 confirmed afterwards. 21
unit cases against the **shipped** `weekPhases.js` source (run counting, a
second run restarting at 1, null markers ending a run, unsorted input, the
redundancy guard, the year boundary and a DST fall-back). And all three were
driven for real in a browser through throwaway `app/zz-wkharness.js` /
`app/zz-ciharness.js` routes (both deleted, `git status` confirmed clean): the
overflow reproduced at 660px and re-measured at 0 with the fix, both collapsed
and expanded; the phase popup opened from a pill, applied, renumbered the run,
refused a redundant name with Apply dimmed to 0.45, printed the "until" copy
once a later marker existed, and cleared a run from a chosen week; and the
timeline rendered every row state at once (Not due yet + Close out on the
current week, Completed with no actions, Closed out + Undo, Missed + Reopen +
Close out). `npm run build` + `check:routes` clean, plus a Babel parse /
unresolved-identifier / unused-import pass over all 16 touched files.

**Not verified behind a real login** — standing limitation. Worth Terra's pass:
close out a real week and confirm the client leaves the red group on the
roster, then set a phase on Reviewer and page back through the weeks.

## A green card is not a sent check-in (2026-09-06)

Coaches reported members doing their questionnaire, seeing the card go
green, and walking away believing they were done. No migration; all
client-side.

**The reported premise was stale, and checking it first reshaped the fix.**
"They still have to click submit" stopped being true on 2026-08-25
(`721e6da`), confirmed live in the deployed bundle before touching
anything. Which narrows the failure sharply: on a form-only week a fully
answered form auto-sends, and a partly answered one leaves the card grey,
so **green card == sent**. The confusion can essentially only happen on a
**photo week**, where a week suddenly has two tasks instead of the usual
one.

**And the word was ours.** The form sheet's button read
`{canFinalize ? "Submit check-in" : "Done"}` — and `canFinalize` is false
while photos are outstanding, so a member who answered every question was
handed a button saying **Done**. That is the exact moment described.

**Worth measuring before believing a report is a crisis.** 18-19 of 22
active clients file every week, and photo-required weeks are not worse
(15/18 client-weeks) than the rest. Zero cases of "photos in, no check-in."
So this is polish for a confused few, and the submission numbers should not
be expected to move. Told Terra so she could calibrate.

**No due date anywhere in the copy, and this was Terra's catch.**
`deriveCheckinStatus` takes no date at all — it is purely "is there a
response row". The Saturday a week lapses is only when it rolls off the
current filing window and starts rendering as Missed on the coach's
timeline; nothing changes for the client. Putting "due Saturday" in front
of someone about to file tonight tells her she has six more days, and her
coaching is turnaround-based rather than deadline-based. The nudge says
"You haven't sent your check-in yet. Photos still needed." and stops.

What shipped: tasks **chained in both directions** (finishing one opens the
other, but only when she actually finished the one she was in — bailing out
of a half-answered form returns her to the overview rather than trapping
her); the sheet button never says "Done"; a **"Not sent yet" strip** naming
what is left, in the attention peach rather than an alarm red; **Step 1 of
2 / Step 2 of 2** on the cards; the band flagging a photo week up front; a
full-width **"Complete your check-in" pill** on My Week's Nutrition card
(nothing outside the Check-In tab had ever mentioned a check-in was
waiting); and the two reminders below.

**The reminder is split by moment, deliberately.** Terra asked for a popup
on navigating away. The most common reason to leave that screen
mid-check-in is **to go and take the photos**, so a dialog there blocks the
thing it is asking for and trains people to dismiss it unread. Instead:
- **Leaving:** a toast, suppressed entirely when she is heading to the
  Photos tab (`NutritionTabHeader` gained an `onNavigate` callback for
  exactly this), once a day per app session via a module-scope date guard —
  a component ref would reset on every sub-tab hop.
- **Reopening the app:** the real popup (`components/nutrition/CheckinNudge.js`,
  mounted beside `AnnouncementChecker`, mount + AppState foreground per that
  file's own lesson). Only when she **started and stopped** — nothing typed
  and nothing uploaded is My Week's pill's job, not a popup's. Gated on
  `showNutritionTab` so a member without nutrition never pays for the
  lookup, and every guard answerable without a query runs first, so the
  common case costs one local read. `lib/formDraft.js` gained `readDraft()`
  so "did she start?" can be asked outside the hook.

**`lib/nutrition/checkinProgress.js` is one definition of what is still
owed**, shared by all three surfaces. Three copies of that wording is how
the screen and the reminder end up disagreeing about what she owes.

**Verification gotcha worth remembering: `document.body.innerText` returns
`""` while the Browser pane is hidden.** innerText is layout-dependent, and
a hidden pane does not lay out. This read exactly like "the component
rendered nothing" and sent me looking for a bug that did not exist. Use
`textContent`. (Also: a synthetic tap needs the pressable itself — RNW
renders it as a plain `div` with `tabindex="0"` and **no** `role="button"`,
so climb to the `[tabindex="0"]` ancestor rather than tapping the text node.)

Driven for real in a browser with the data layer stubbed (every stubbed
file restored and md5-verified byte-identical, harness routes deleted):
both chain directions, the button label flipping to "Next: add your photos"
as the last answer lands, exactly one submit firing after the final task,
the toast suppressed toward Photos and firing toward Weekly with the right
combined label, and the popup's once-a-day guard. **Not verified behind a
real login** — standing limitation.

## Members get the weight trend, and the chart becomes thumb-scrubbable (2026-09-06)

No migration, no new query on either screen's normal load.

**Two doors into one sheet, both on numbers that were already there.** Today's
`▼ 1.2 vs last week` under the weight tile and Weekly's `8-WK LB` stat in the
averages band are each a one-line version of exactly what the chart answers,
so both became the tap target rather than growing a button beside them. Same
W/1m/3m/6m/1y ranges and the same 1m default as the coach's dashboard chart,
deliberately, so a coach and a client talking about "the last three months"
are looking at the same window.

**Rejected: the Today card slider.** `TodayCardSlider` is the coach's strip
(focus, notes, plan phases, milestones) and it sizes itself to its tallest
card, so a chart in there inflates the whole strip for every member including
those with no history worth charting.

`WeightTrendSheet` fetches its own logs rather than taking them as a prop.
Weekly has 200 loaded already and Today only has the last 8 days, so one
bounded `listLogsForDateRange` on open is both cheaper than adding a year of
history to every Today load and identical from either door. Range changes
filter what is already in hand rather than refetching a subset.

**The real fix is in `TrendChart`, and it is why the chart was unusable.**
Reading a value was `onMouseMove` on web and an `onPress` on a 2.5px `Circle`
on native. A thumb drag fires neither, so on the PWA, which is where everyone
actually is, the chart could not be read on a phone at all. It is a
`PanResponder` over the plot now:

- **The pointer only has to land in the right COLUMN.** `nearestIndex` snaps
  horizontally, so vertical accuracy is irrelevant and a sloppy drag still
  reads cleanly.
- `onStartShouldSetPanResponder: () => true` keeps a plain tap working, and
  `onPanResponderTerminationRequest: () => true` lets a parent scroller take
  the gesture back, which is what keeps the page scrollable when a finger
  starts on the chart. `touchAction: "pan-y"` on web hands vertical panning to
  the browser outright.
- **The read-out is NOT cleared on release.** She lifts her thumb to read the
  value it was covering; clearing on release removes the answer at the exact
  moment the chart becomes visible again.
- `readoutPlacement="above"` puts it over the plot for the same reason: on a
  phone the hand doing the scrubbing is on the chart, so a read-out below it
  is under that hand. Fixed 34px height so the chart does not shift when the
  hint swaps for a number.
- The responder is created once and reads coords through a ref, so it cannot
  close over a stale render. Mouse hover is kept alongside for the coach at a
  desk, and it has to stay on the `<Svg>` rather than the wrapper: `offsetX`
  is relative to the DOM event's own target, which over a wrapper View is
  whichever child is under the pointer. The PanResponder uses `locationX`,
  which RNW computes as `clientX - currentTarget.getBoundingClientRect().left`
  (verified in `createResponderEvent.js`), so it resolves against the wrapper
  and needs no measurement.

This lands in the shared component, so the coach dashboard and the member's
own lift progress chart both get the drag.

Down is olive and up is neutral, never red, matching the weight tile on Today
rather than the coach's own red-for-up colouring, since not every member is
trying to go down.

**Verified in a browser at 390 and 1280 with real touch events** (harness
deleted, stubbed file restored and md5-verified): touch-down reads a value,
dragging walks the read-out through dates in order, it holds after release,
the read-out swap causes no layout shift, the range pills recompute both the
window and the delta, the chart caps at 560 and centres exactly on desktop,
and the empty and failed-load states both render. **Not verified behind a real
login**, and not on native.

**The lesson that cost real confusion: a dev-server stub leaks into whoever
else is on that server.** Terra was logged in against the same scratch-port
Metro instance while the harness had installed
`globalThis.__ZZ_FAKE_LOGS__` over `listLogsForDateRange` at module scope.
Once that route had loaded in her tab the stub stayed live, so Today compared
her real weight against generated data and reported a 30 lb swing, and the
sheet drew a sine wave. Nothing was written (the stub only intercepted a read,
feeding a displayed delta), but it read exactly like a real data bug and she
reported it as one. **Say so before starting a stubbed dev server, or scope
the stub so it cannot survive leaving the harness route.** The "restore and
md5-verify" discipline covers the repo; it does nothing for a running server.

**Same shared surface, second failure mode, one day later: Terra read a
harness SCREENSHOT as her own app and drew a real conclusion from fake data.**
The coach-dashboard harness stubbed `getFinalizePrompt` with the design mock's
placeholder range, so the payroll banner said "Aug 16 – 31". She reasonably
asked why she was being nagged about a period that isn't even a pay period —
and she was right that it isn't: real periods are 14 days Thu→Wed off the
`payroll_period_anchor_date` anchor (2025-10-02), so Aug 16–31 is 16 days
starting on a Sunday and could never exist. Nothing was wrong with the app;
the number came from me.

The stub-leak fix (say so before starting a server) does not cover this one,
because the Browser pane is hers whether or not she is signed in — she sees
what I drive. **So: when a screenshot comes from a harness, say the data is
fake in the same message as the picture, not just at the end of the session.**
Worth remembering too that a plausible-looking placeholder is worse than an
obviously fake one — the handoff mock's own "Aug 16 – 31" read as real
because it was formatted exactly like the real thing.

**And the actual mechanism, checked rather than assumed, because Terra's read
of it was better than mine.** I did start my own server — the scratch config
on 8095, never her 8081 — so the leak was not a shared Metro. What I did was
take over the Browser pane's only tab: `preview_start` points a tab at its URL,
and with one tab open that tab is HERS. Her window switched to my harness, and
when I later called `preview_stop` it was left sitting on a dead port.

**So the fix is a tool choice, not a warning.** `tabs_create` opens a
BACKGROUND tab and says so in its own result ("the user's current tab stays in
front"); driving that by `tabId` leaves her front tab alone. Reach for
`preview_start` to boot the server, then do harness work in a background tab —
and if the pane does end up on a stopped server, navigate it back to whatever
she was on (`lsof -nP -iTCP -sTCP:LISTEN | grep 808` finds her Metro; hers has
been plain `expo start --web` on 8081, not the 8082 in `.claude/launch.json`)
rather than leaving her looking at a dead page.

## The nutrition roster reloads, and each coach orders her own queue (2026-09-07)

Two asks on the same screen. Migration `0123` — applied and verified live.

**A mount-only `useEffect` on a coach screen is a stale screen, and whether
it is depends on the SHAPE of the route you pushed.** Close out a check-in on
a client's record, come back, and the roster still showed her in her old
group. Measured it rather than reasoning about it, through a throwaway
`app/zz-stack/` probe logging mount/unmount/focus:

| push from a Stack index to | on back |
|---|---|
| a **sibling static** route (`/zz-stack/detail`) | UNMOUNT then MOUNT — a plain `useEffect` re-runs |
| a **nested dynamic** route (`/zz-stack/clients/[id]`) | stays mounted; only `useFocusEffect` fires |

The second is every coach detail page in this app, and it holds for
`router.back()` **and** the browser back button. So the CLAUDE.md note under
"The rosters remember where you were" claiming the SPC roster unmounts on web
is true only of its own route shape (`/spc/[userId]` is a direct sibling) and
must not be generalised. `app/(coach)/nutrition/index.web.js` is on
`useFocusEffect` now, matching what its native sibling has always done.

**Swept the rest of the coach web app for the same shape, same session.**
`app/(coach)/clients/index.web.js` had it for real and is fixed; so were the
two secondary Coach Home hooks, `usePendingDocuments` (the nav's signature
badge) and `useLibraryReview`. `more.js` stopped re-counting documents by
hand now that the hook does it itself.

**Grep the route file and you will get the wrong answer.** Coach Home
(`app/(coach)/index.web.js`) looked mount-only and was reported that way; it
is 20 lines picking a layout by width, and its real load lives in
`useCoachDashboard`, which has been on `useFocusEffect` all along. Look for
where the fetch actually is, not for the screen's own file. `usePendingDocuments`
carried a comment asserting the opposite of what was measured here ("on web
CoachShell remounts on every page navigation, so the mount-effect alone keeps
it current") — that is true of a sibling push and false of a nested one.

### Each coach's own order for the queue

`programming.nutrition_roster_order` (0123) — `(owner_id, client_id)` primary
key holding a `status` and a `position`. Per coach, not shared: the roster
shows every client to every coach, so one order would mean three people
fighting over one list. Own-rows-only RLS, gated on `core.can_access_nutrition()`
like every other nutrition table (revoking access hides the order rather than
deleting it, so it comes back intact).

**The `status` column is the whole design.** A saved position only counts
while the client is still in the status it was saved under, which is what
makes Terra's rule — "when someone moves from one stage to the next, they drop
in at the bottom" — true with **no write at the moment her status changes and
no reconciliation job**. Her row simply stops matching and she falls into the
unordered tail, which sorts by name. One row per (owner, client), so a client
moving between statuses replaces her own row rather than accumulating one per
status she has ever been in. `lib/nutrition/rosterOrder.js`'s `sortRosterGroup`
is the single definition and is pure so it can be checked without a database.

Ordering is **per status group**, not one flat list — that is the only reading
under which "moves from one stage to the next" means anything, and the queue is
already grouped that way. A drag persists the **whole** group (positions 1..N,
including the rows that were only in the unordered tail), so one drag pins the
group instead of leaving it half-placed.

- Reordering is optimistic with a rollback + toast on a failed write, and the
  order fetch is in its own try/catch: an unrun 0123 leaves the roster
  alphabetical rather than blanking it.
- `components/SortableList.web.js` gained `handlePadding` (default 4,
  unchanged for its two existing callers). The queue passes 12, taking the grab
  area from 19x32 to **35x48** — a desktop editor row and a list a coach drags
  on her phone want different targets, and the glyph does not change.
- The handle sits **outside** `ClientRow`'s `Pressable`, not inside it. The row
  is a click target (select / open the record) and a handle nested in it hands
  every grab to that press as well.
- Only the open group renders rows, so at most one `DndContext` is ever mounted
  and two groups can never share an id space.
- **Native (`index.js`) is deliberately untouched** — it is a flat list across
  every status, where a per-status order has nothing to attach to, and per
  [[project_everyone_is_on_the_pwa]] nobody is on it.

**Verified**: `npm run build` + `check:routes` clean; a Babel parse /
unresolved-identifier / unused-import / missing-named-export pass over every
touched file plus the two other `SortableList` callers; 10 assertions against
the **shipped** `sortRosterGroup`/`applyRosterOrder` (empty map = today's
alphabetical exactly, a new arrival at the bottom, a row stamped for another
status not counting, re-dragging replacing rather than appending, left-and-
returned back at the bottom); and the real `StatusGroup` driven at 1280 and 390
through a throwaway `app/zz-roster.js` — a real pointer drag reordering the
list and firing `onReorder` with the full new id order at both widths, a row
click still selecting, a bare tap on the handle changing nothing, and no name
clipping or page overflow at 390. **Not verified behind a real login** —
standing limitation. Worth Terra's pass: drag a group, reload, and confirm the
order sticks; then close out a check-in and confirm that client appears at the
bottom of her new group, under the ones already placed.

## Progress photos can be nudged into a common frame (2026-09-08)

Two photos of the same client weeks apart rarely line up, because what
moved between them is the CAMERA -- she stood a foot further back, or the
phone was propped higher. Every compare surface crops with `cover`, which
centres, so the misalignment survives into the comparison and a coach reads
a difference that isn't there. Migration `0124` -- applied and verified live.

**Stored on the PHOTO, not on the pair, and that is the whole design.** The
distortion belongs to the shot, so nudging a photo once into a standard
frame lines it up against every other adjusted photo rather than only the
one beside it today. Adjust once, correct forever, and the client's own
Photos tab and the shareable board get it for free. Per-pair framing was the
alternative and would mean redoing the work on every new comparison.

`public.photos.framing` is nullable jsonb `{scale, x, y, ar}` -- **NULL means
untouched, which is the entire backward-compatibility story**: all 604
existing photos keep rendering byte-identically until someone deliberately
adjusts one. Additive on the table the standalone Nutrition Tracker app
shares, same pattern as 0031 / 0033 / 0042; that app never selects it.

**`x`/`y` are fractions of the frame, never pixels** -- the same photo draws
at five different sizes across the app, so a pixel offset saved on a desktop
rail would be meaningless in a board cell. `ar` is the source image's
intrinsic ratio, captured once by the editor via `Image.getSize` so that
every *renderer* can work out the cover fit synchronously instead of running
an async measurement on every photo it draws.

**The rule that makes it safe everywhere: the pan is clamped so the image
always covers the frame.** Frame shapes genuinely differ across surfaces --
the compare panes are 3:4, the board's 3-up cell is 356/676 -- and the slack
axis FLIPS between them, so a vertical offset that is legal in a pane has no
room at all in a board cell. `clampFraming` re-clamps at render against
whatever frame it is actually in, so a framing set in one place can never
expose an edge in another. Brute-forced across 750 combinations of frame
shape x photo ratio x scale x offset: zero exposed edges. The cost is that
you must zoom slightly before a photo will move, which is what aligning
takes anyway; the editor says so in place rather than leaving it a mystery.

**`framingLayoutFractions` is the core, and `framingLayout` (pixels) and
`framingPercentStyle` (percentages) are both thin wrappers over it**, tested
to agree exactly across 540 combinations. The percentage path is what lets
`FramedPhoto` serve the flex- and percentage-sized frames (member Photos
tab, starting photos, check-in thumbnails) **without measuring** -- worth
doing deliberately, because react-native-web implements `onLayout` with a
ResizeObserver, which would flash empty on first paint and, per this file's
standing note, never fires in the sandboxed Browser pane at all.

`components/nutrition/FramedPhoto.js` is the single renderer; five surfaces
that each had their own `<Image resizeMode="cover">` now go through it, so a
future framing change cannot be threaded through four of them and forgotten
in the fifth. **An unadjusted photo takes the plain cover path deliberately**
rather than falling through the maths with an identity framing -- the two
agree arithmetically, but a photo nobody has touched should be provably
untouched. The lightbox and `PhotoSubmissionsEditor` deliberately do NOT use
it: one is the full original, the other is where a coach works out which
photo is which, and both want the raw truth.

**Editing is inline on the coach's Photos tab, which is the only place it
can be**: you cannot align against a reference you cannot see. "Adjust
framing" turns both panes into drag-to-move / zoom-to-fill surfaces and
drops three draggable rust guide lines ACROSS BOTH photos -- head, waist,
feet. Without the guides you are judging whether two heads are level across
a gap with nothing to measure against, which is the actual hard part.
**Autosaves on a 600ms debounce with an unmount flush**, not a Save button:
switching tab or paging to another week unmounts the rail, and this file
already records coach notes being lost three times to exactly that. Reset
writes NULL rather than an identity object, so "has anyone touched this?"
stays an honest question of the data. Coaches only -- clients see the result
and get no controls.

`updatePhotoFraming` asks for the row back and throws on zero rows, per the
standing lesson that an UPDATE filtered out by RLS reports success.

**Interaction is PanResponder plus plain +/- buttons, deliberately not a
gesture-handler pinch**: this is coach work done on the web build at a desk,
the responder system is the one thing in this app proven identical on web
and native, and a pinch would have been the one part of the feature that
could not be verified from here.

**Verified by driving it, not by reasoning.** 29 unit assertions against the
shipped source (including the two brute-force sweeps above), then the real
rail driven at 1280x900 through a throwaway `app/zz-frameharness.js` with
two deliberately mismatched figures: zooming to 185% matched their spans to
2px, a drag closed the offset, and the heads finished **0.5px** apart and the
feet **1.2px** apart -- measured off `getBoundingClientRect`, not eyeballed.
Also confirmed: 17 rapid zoom taps produced ONE save, the framing survived
leaving adjust mode, Reset restored the frame exactly and stored null, a
guide dragged pixel-exactly, and the same framing covered all four real
frame shapes with no exposed edge. Harnesses deleted, the stubbed lib
restored and md5-verified byte-identical, `git status` checked.

**Harness gotcha, re-confirmed**: with the Browser pane hidden, rAF is frozen
and a synchronous burst of `pointermove` events is only partly processed --
a 45px guide drag registered as 17px and read exactly like a broken clamp.
A single-move drag measured -60px against -60px expected. Dispatch one move,
or await between them, before concluding a drag is wrong.

**Not verified**: any of it behind a real login (standing limitation), and
none of it on native. Worth Terra's pass on a real client's photos --
especially that the guides land where she wants them and that an adjusted
photo looks right on the shareable board.

## The Weeks tab gets hanging-folder tabs (2026-09-08)

Terra's metaphor, and the shape follows from it: the tabs that stick up out
of a hanging folder, so a coach running down eleven weeks can see what was
going on in each one without opening any of them. Migration `0125` —
applied and verified live.

**What kicked it off was the targets divider, and that is the clearest case
for the whole idea.** A target change was drawn BETWEEN two weeks, which
reads as belonging to the week above it — wrong whenever the change landed
mid-week, which is most of the time. `TargetChangeDivider` is deleted; it is
a tab on the week the change actually happened in. The matching logic was
already right (`w.end >= effective_date && w.start <= effective_date`), only
the rendering was lying.

Four tab kinds: **Phase** (colour-coded), **Targets changed**, any number of
**free labels**, and a **+**. The phase pill that used to sit inside the row
header is gone with `PhasePill`; `WeekPhasePill.js` is renamed
`WeekPhaseEditor.js`, since only the popup survived the move.

**Colours live on the MARKER row, not in a registry keyed on the phase
name.** Phase names are free text with no table behind them, so a registry
would need renames kept in sync for a purely visual concern, and it would
stop a coach drawing this run of Diet differently from the last. Consistency
for the common case is handled in the app instead: `listPhaseNames()` now
returns `[{name, color}]` (the colour that name last carried) and the editor
adopts it as you type or pick a chip. The stored value is a palette KEY, never
a hex, so `PHASE_COLORS` can be retuned without touching a row; an unknown key
falls back to the first entry. Eight muted swatches, deliberately no bright
red or green — a row of eleven weeks with one of those on it would shout
louder than anything else on the page.

**Notes are their own table, NOT another column on `nutrition_week_phases`**,
even though both hang off (user, week). A phase marker is a RUN that holds
until the next marker; a note is about one week and nothing else. Folding
them together would mean writing a note created a phase marker there, which
silently ends whatever phase was running. Several notes per week are allowed,
so the key is a plain id.

**New `components/AnchoredPopup.js`**, extracted from the phase editor once
the strip grew three popups — three copies of that clamping arithmetic is
three chances for one to open off the bottom of a long list. `measureAnchor`
goes with it. One popup is held by `WeekRows` for the whole list, not per
row: sixty weeks each holding their own would mount sixty Modals.

**Why the tabs overlap the card by a pixel, and it is load-bearing.** A tab
has a border on three sides and none along the bottom, sits with
`marginBottom: -1`, and the strip carries `zIndex: 1`. Without the z-index
the card, being the later sibling, draws its top border straight through the
bottom of every tab and they read as detached chips. `rowGap` is 0 on
purpose: when the strip wraps (phone width, or several labels) each row of
tabs then sits on the row below exactly as the bottom row sits on the card,
which is what a stack of folder tabs looks like — a positive row gap leaves
the upper rows floating with an open bottom edge. Measured: tab bottom 502,
card top 501, strip z-index 1 over the card's 0.

### Fiber, and the overflow it exposed

Fiber is in the Weeks view now — a fifth ring and a `Fiber` day column.
`summarizeWeek` has always averaged `fiber_g` (it is in `METRICS`); it simply
was never rendered.

**Adding the fifth ring broke phone width, and only measurement caught it.**
The ring block's own `minWidth` was "five columns plus their gaps", which at
the old 62px floor came to 342px inside a 310px row — so the kcal ring
overflowed the card and was clipped, with `document.scrollWidth` still
reporting zero. Two changes, and both halves matter: `RING_COL_WIDTH` is 48
(the widest thing in a column is the 44px ring; "of 1735" measures 33px), and
the block's floor is FOUR columns, which is big enough to push the block onto
its own line rather than squeezing in beside the logged-days column, and small
enough that it can never exceed the row holding it. Result at 390px: five
rings on one row, block exactly 278px, zero overflow.

**Worth generalising: a `minWidth` meant as "wrap below this" becomes an
overflow the moment it exceeds the parent.** It is a floor on the element, not
a query about the container, so it has to stay under the narrowest row that
element ever sits in.

### A silent no-op worth remembering

Two of the edits in this pass were made with `str.replace` against a pattern
that included surrounding comment text. An earlier edit in the same session
had re-indented that block by two spaces, so the pattern no longer matched and
`replace` did what it always does when it fails: **nothing, silently.** The
build stayed clean, the scope pass stayed clean, and the bug only surfaced by
reading the computed `minWidth` out of the live page. Assert after every
scripted replace (`assert s != before`), and prefer a line-range edit when the
anchor text has already been touched once.

### Verification

Migration dry-run in a rolled-back transaction with six assertions before
applying (Monday CHECK bites, colour stores, coach writes and reads, two notes
on one week, member sees zero and is refused 42501), then table/policy/RLS/
column confirmed by query and a live PostgREST 200 on both. `npm run build` +
`check:routes` clean, plus a Babel parse / unresolved-identifier / unused-import
/ missing-named-export pass over all seven touched files. The strip was then
driven for real at 1360 and 390 through a throwaway `app/zz-weektabs.js`
(deleted, `git status` checked): every tab opens its own popup anchored under
itself, picking a known phase name adopts its colour and retints the Apply
button, the redundancy guard correctly dims Apply on a week already inside
that run, the blast-radius line names the next change, applying repaints the
tab in the new colour, adding a label lands it as a tab with the + moving
along after it, and the wrapped strip stacks cleanly at phone width.

**Not verified behind a real login** — standing limitation. Worth Terra's
pass: colour a real phase, label a real week, and confirm a real target change
lands on the week it happened in.

## The Weeks tab leads with its dates, and a label can carry a colour (2026-09-08)

Three asks on the coach's Weeks tab. Migration `0127` — applied and verified live.

**The running week number is gone.** It counted from the client's `start_date`
(`weekOnProgram`), so "Week 12" said how long she has been a client rather than
anything about the week being read — and it cost a 118px column plus a second line
of height on every row. The week's own dates take its place as a single line at the
top-left of the card, directly under its tabs, and the metric row below it gets the
width back. Measured at 1360: the rings spread from a 278px block to the full
remaining width, with the date line sitting 16px under the phase tab at the same
left edge. `weekOnProgram` is no longer imported by the client page; `week.label`
is no longer built.

**Calories lead the rings; the day table runs Day, Weight, Cal.** Weight leads
there because it is the outcome and the row header already reports its average.
Moving calories is a reorder of the two config arrays, not a new column, so
`TABLE_MIN_WIDTH` is unchanged and the note cell's `NOTE_MAX_WIDTH` cap still
holds — re-measured with a 200-character note in the week, the table fits its
container exactly (1294 of 1294) rather than dragging the row sideways.

**Each ring carries two labels**: the full word on a desktop card and the P/C/F/f
shorthand below `MOBILE_BREAKPOINT`, resolved once per row rather than inside each
ring. **The lowercase f is a phone measure, not the preferred reading** — it exists
only to tell fibre from fat's capital F, and the full words tell themselves apart,
so the case carries meaning in the short set alone. Measured at 800 (just above the
breakpoint) all five full words still fit on one row unclipped.

**The row is two arrangements of the same four blocks**, declared once in
`WeekRow` and placed twice so they cannot drift. Desktop keeps the check-in state
last, after the numbers; a phone gives the first line to the weight, the dots and
the state (pinned right with `marginLeft: "auto"` and content-sized, since a fixed
width there leaves the label short of the edge) and the whole of the second line to
the rings. **Putting the state beside the dots at both widths was right for the
phone and wrong for the desktop**, where there was never a shortage of room — the
arrangements genuinely differ, so it is a branch rather than one order. The chevron
is out of the metric row entirely at both widths: it is the card's expander, and in
the row it was a column the rings wanted. The desktop line keeps `flex-wrap` as a
safety net for a squeezed card (a coach at ~1000px still has the 232px sidebar).

**The date is the first tab, not a line in the card**, and it carries the chevron,
so the card's first line is all numbers and pressing the tab opens the week. It is
unpadded — `formatDateMDShort` ("9/7"), not `formatDateMD` ("09/07"); nothing lines
up under a tab, so the padding only made a short label look long. The calendar
grids keep `formatDateMD` for exactly the reason it exists, and the tab popups keep
the padded form deliberately — changing one popup and not the other would read
worse than either.

**The phase left the strip for the card's left edge**, a coloured spine spelling
the run out a letter at a time (`PhaseRail`). A phase is a property of the whole
week rather than one more thing filed against it, and as a tab it competed with the
labels for a strip that wraps. Three things about it are load-bearing:

- **Stacked letters, not rotated text.** RN has no dependable transform-origin, and
  a rotated block has to be measured before it can be placed where a column of
  single characters lays itself out. A space becomes a spacer `View`, never a
  whitespace-only `Text` — that collapses to zero height under `numberOfLines={1}`
  (the same trap My Week's stripe captions hit), so "Fat loss" would read "FATLOSS".
- **A long name is taller than the card, so the letters step down a size as the
  name grows** (`railType`). This is real, not hypothetical: the live data had
  `Maintenance` on 4 markers, and at full size it made those cards ~65% taller than
  their neighbours. **Terra's fix was to rename it to `Maint` in the data**, which
  is what keeps the spread small — measured, collapsed cards now land within 12px
  of each other across Diet/Maint/Reverse. `SUGGESTED_PHASES` follows, and the
  ladder stays as the guard for anything long typed later.
- The card is `flex-row` with `overflow: hidden` so the spine's fill is clipped to
  its corners, and the content column carries `minWidth: 0` or the day table's own
  horizontal scroller sizes that column to its content and pushes the card off the
  page. The rail is top-aligned rather than centred: the card's height changes when
  the day table opens, and letters floating in the middle of an expanded week drift
  away from the row they belong to.
- **An unset spine must be a fill, never white.** It shipped white-on-white with a
  bare grey `+`, and since the spine is what draws the card's left edge now, that
  edge dissolved — Terra reported a run of unphased weeks as the cards being *gone*.
  Nothing was dropped (rendering her real shape, all twelve weeks and all twelve
  spines were present); it was purely that they had no visible left edge. It is a
  recessed `#f6f3ef` now and reads "+ PHASE" down it, since the tab it replaced said
  "+ Phase" and a plus alone in an invisible gutter is not an invitation.

**Deleted from the Weeks tab header**: the "Targets changed N times, tabbed on the
week it moved" line. The tabs say it on the weeks it happened.

**Two caps were hiding most of a long client's history, and neither was the
import's fault.** Terra reported only seeing data from 7/20 on. The Weeks tab
fetched `listLogs(userId, { limit: 400 })` — and `listLogs` orders newest-first
and truncates, so the gym's longest-running client (777 logs back to March 2024,
730 of them before 7/20) had her oldest 377 never asked for; those weeks would
have rendered "nothing logged" with the rows sitting in the table. `maxWeeks` was
separately `Math.min(60, ...)`, which both truncated the list and made the header
claim she had been on program 60 weeks when it was 131. Both are gone; the only
limit left is `WEEKS_SHOWN` (what renders on arrival, one press from the rest).
**Check the fetch limit before concluding an import is incomplete** — the data
was all there.

**`WeekRow` is memoised, and it has to be.** A 131-week list re-rendered every
card and its five SVG rings to open one week. `onToggle`/`onOpenTab` take the week
rather than closing over it, and `resolveWeekPhase` is resolved once into a map,
because a fresh object per render defeats the memo exactly as an inline arrow
does. Measured at 131 weeks: 217-346ms unmemoised against 21-33ms with it.

**A floating bubble covers whatever a page ends with, and the thing at the foot of
a list is usually the one that loads more of it.** The Weeks tab's "N earlier weeks"
link is bottom-left, which is exactly where `ClientNotesBubble` floats — measured, a
click on the link's own centre hit-tested to the bubble rather than the link, so the
control that reaches a client's history was unclickable. Three pages carried a
bubble with too little bottom padding (48, 32 and 70 against a button reaching
`insets.bottom + 76`). The geometry now lives in `components/CoachMessageBubble.js`
(`BUBBLE_BOTTOM`/`BUBBLE_SIZE`), both bubbles share it, and `bubbleClearance(insets)`
is what a scrolling page spends as its `paddingBottom`. **Any new coach page that
mounts either bubble owes it that clearance.** Still outstanding: `spc/[userId].js`
on native has no scroll container of its own, so the padding belongs inside
`CoachSpcOverview`.

**A hook has to go in the component that uses the value, not the file's default
export.** Adding `useSafeAreaInsets` to `SpcClientDetailWeb` while the ScrollView
that needed `insets` lived in `SpcClientDesktop` several hundred lines earlier gave
a completely clean `npm run build` and would have thrown at render. The
unresolved-identifier pass caught it — which is the whole reason that pass exists,
since Metro resolves no identifiers.

**Measure interactions with a `MutationObserver`, never a `setTimeout` poll.** The
preview browser clamps timers to ~1s while the pane is hidden, so every
interaction reports as a flat 999ms whatever the truth is — and a
`document.body.textContent` scan used as the poll's own detector is itself
expensive enough to dominate the result on a large DOM. Between them they produced
a confident "~800ms" that was pure artifact and nearly went into a code comment as
a measured fact. A MutationObserver fires on a microtask and is immune to both.

**Calories lead `MacroRingRow` too**, the shared component behind the Dashboard,
the Check-In tab and the nutrition queue preview. Those three share one component
precisely so they cannot disagree about what a ring means, so the reorder lands on
all three together rather than on the Dashboard alone.

**A label tab can carry a colour**, sharing the phase palette so a colour means the
same thing on either kind of tab. `Swatch` is now exported from `WeekPhaseEditor`
and rendered by both editors rather than copied, so the control cannot drift.

- **Null is a real choice for a note, not merely "unset"** — a plain white tab is
  what every existing label already is, and a coach who does not want to colour-code
  a particular week should be able to leave it that way. So `NOTE_COLORS` leads with
  a neutral and `noteColor()` falls back to it, where `phaseColor()` falls back to
  the first swatch. That is the only asymmetry between the two, and it is why the
  phase editor correctly offers no "None" swatch.
- **The colour is savable on its own.** Recolouring a label without retyping it is
  the common edit once the label itself is right, so `canSave` compares the colour
  as well as the text. Verified: Save sits at 0.45 with nothing changed and goes to
  1 on a colour change alone.
- The card grew a swatch row, so `estimatedHeight` grew with it — `AnchoredPopup`
  clamps against that figure, and a stale one opens the card off the bottom of a
  long list.

**A scripted-edit trap worth remembering: an assertion can be tripped by the comment
you are inserting.** A guard asserting the old label `"Fib"` was gone from the file
failed because the explanatory comment being added quoted it. Scope that kind of
assertion to the data it is about — here, the array bodies pulled out with a regex —
rather than the whole file. A second assert in the same pass counted `"calories"`
across a line that carries both `key:` and `targetKey:`. Both were the assert being
wrong rather than the edit, which is the right direction for an assert to fail.

**Verified** by driving the real component at 1360, 800, 767 and 390 through a
throwaway `app/zz-weeks.js` route (deleted; `git status` checked): full words above
the breakpoint and the shorthand below it with nothing clipped, all five rings on
one row with zero page overflow at every width, day headers leading Day/Weight/Cal,
the state measured flush to the card's content edge on a phone (17px from the card
edge = its own 16px padding plus the border) and right of the rings above the
breakpoint, the dashboard rings reading Calories/Protein/Carbs/Fat/Days logged,
the date tab collapsing its week and the spine opening the phase editor (in both
its set and its dashed unset state), collapsed card heights measured across
Diet/Maint/Reverse,
the + tab opening a nine-swatch picker, a save carrying `color=slate`, an existing
label seeding its own colour, a colour-only edit enabling Save and firing
`updateNote … color=olive`, and the phase editor still offering no "None". `npm run
build` + `check:routes` clean, plus a Babel parse / unresolved-identifier /
unused-import / **missing-named-export** pass over all five touched files (the
checker was itself proved to catch a planted fault). **Not verified behind a real
login** — standing limitation. Worth Terra's pass: colour a real label, and confirm
the date line reads right on a client with a long history.

## Member mobile v5 — conformance pass over the four nutrition tabs (2026-08-15)

Asked for "a new design pass, design_handoff_member_mobile_v5". **That handoff
was already built** (2026-08-10, its own section above) — so this was an audit
of all 12 screens against the README and a fix of what had drifted or never
quite landed, not a rebuild. Worth knowing if the same ask comes again: read
the built screens against the README first, because most of it is there. My
Week, My Fitness, both My History views and Settings were already conformant
and were left alone; everything below is the nutrition tabs plus one app-wide
sweep.

**Header parity.** Weekly, Check-In and Photos rendered a bare title, so
switching sub-tab silently dropped the gear and the 34px Kova mark that Today —
and every other member tab — carries. New `components/nutrition/NutritionTabHeader.js`
holds the title row plus the segmented control; the four screens render it
instead of four copies. It deliberately owns **no padding or safe-area inset**:
Today puts it in a fixed block above its own ScrollView while the other three
put it inside theirs, and each screen already handles that itself. Today passes
its date-stepper/LOGGED-badge row as `children`, which render between the title
and the tabs.

**Today's slider cards.** The coach's cards above the log (focus list, game
plan, plan phases, milestones, completed milestones) are the one thing the v5
mock doesn't draw at all — they were deliberately kept in the original pass
since nothing else surfaces what the coach wrote, and so they were still on the
pre-v5 `rounded-lg`/`border-stone-200` chrome and read as a different app
sitting on top of the one below them. New local `SliderCard` shares `LogCard`'s
shell, with the tinted ones (plan phase, milestone) passing their own palette
in rather than forking the component.

**Photos (5b).** `PhotoUpload`'s slot framing is the mock now: empty is
`#fdf1ea` on 1.5px dashed `#e0b6a5` at radius 16 with a 34px white `+` circle;
filled carries the olive `FRONT ✓` chip top-left alongside the existing clear-×.
The button says `Upload 2 photos` rather than a bare "Upload". **Two deliberate
deviations, both commented in the file**: the angle label stays *under* the slot
rather than inside it (the handoff keeps the pose illustrations, and they fill
the slot — a label on top of one can't be relied on to stay legible), and a
filled slot drops its caption entirely, since chip-plus-caption renders the word
twice. That second one was only obvious once screenshotted.

**Check-In (5a).** Task subtitles carry real state per the mock —
`Submitted | front, side, back`, `6 questions | 2 answered`, and a partial
`front in | side, back still needed` — instead of a bare "Submitted". The week
band picked up the same decorative bleeding circle My Week's hero has (the app's
two dark surfaces should read as one object). Finalize gets the primary CTA
shape, reads "Finalize check-in", and sits at 0.45 while blocked — still
deliberately **not** `disabled`, since tapping it is how a member finds out
what's missing (`buildReadinessMessage`).

**House-rule sweep, app-wide but member-only.** Rule 4 (`|` as the separator,
never `·` or an em-dash; empty values as an en dash `–`) had never actually been
applied. Fixed in `SessionHeroBar`'s eyebrow, `ExerciseCard`'s target and
"Last time" lines, the session-preview detail strings, several meta lines, and
the five `"—"` empty placeholders. **Deliberately not swept**: `RestTimerBar`,
whose `REST · {LIFT}` is specced by the later lift_v1 handoff, and every
coach-side surface (ActivityFeed, payroll, CoachHome, TargetsEditor…) — v5's own
scope line is "member only. Coach web is untouched by this pass."

**Real bug the bundle did not catch**: a `{/* … */}` comment placed directly in
a ternary's consequent slot — an expression position, not a children position —
is a hard syntax error, and `npx expo export -p web` reported clean over it
anyway. Found by running `@babel/parser` over every touched file (the same
throwaway scope-check the payroll pass used, which also confirms no unresolved
identifiers). **Reinforces the standing lesson: a clean export is weaker
evidence than it looks — Metro neither parses every file you touched nor
resolves identifiers.** Run the Babel pass on any batch of edits.

**Verification**: clean `expo export` after every batch, a Babel parse/scope
pass over all touched files, and the header, both photo-slot states, the
check-in band and task rows, and the slider-vs-log cards all rendered and
screenshotted at 390×844 through a throwaway `app/zz-harness.js` route (deleted
after; the top-level-route form is preferred over mounting on `login.js` for the
reason given in the payroll section). **Not verified**: anything behind a real
login — standing limitation. Worth Terra's own pass on a real photo upload and a
real check-in submit.

**Concurrent-session note, because it actually happened here**: a parallel
session committed mid-write (`d2ecefa`) with a broad `git add` and swept 7 of
this pass's in-flight files into its own commit. The right response is to
**check `git show HEAD:<file>` rather than assume** — the sweep survived intact
in six of them, and the two lines lost in `app/(member)/index.js` were in a code
path that commit had replaced outright, so there was nothing to reapply. See the
staging rule in the working notes below; it cuts both ways, and a file of yours
vanishing from `git status` means it was committed by someone else, not reverted.

## Nutrition dashboard goes to lines; onboarding becomes her first check-in (2026-08-18)

The rest of the 2026-08-17 batch. No migration — see below for why the one
that looked necessary wasn't.

**Charts are lines, default range 1m.** `TrendChart` (already the line chart
for member lift progress) gained `height` / `unit` / `sinceDate` /
`emptyMessage` and now draws the weight chart too; `WeightBarChart.js` is
deleted rather than left to rot. **This reverses that file's own deliberate
"bars, because a line interpolates straight through a missed day" decision —
Terra's explicit call, so don't fix it back.** The honesty it was protecting
is preserved another way: dots sit only on real readings, so a long straight
run between two distant dots still reads as two measurements rather than a
fortnight of daily data. `sinceDate` (the current target's effective date)
survives as a two-tone split — one neutral polyline, one clay, sharing the
boundary point so it's a colour change and not a break — which is the direct
translation of what the bar colouring meant. Dots are suppressed above 60
points, or 6m/1y render as a solid bead of ink; the hovered point still gets
its own. The four `MetricSparkTiles` are lines too.

**Real geometry bug caught by measuring, not looking**: the sparkline's
latest-reading dot sat at `x = width` with `r = 2.5` inside an SVG exactly
`width` wide, so half of it was clipped on every tile (measured `cx 140` in a
140px box). `sparkPoints` now insets by the dot radius on both axes. That
function is exported and pure specifically so it can be checked without
rendering.

**Sparklines measure their own width via `onLayout` but accept a `sparkWidth`
override.** ResizeObserver — which react-native-web implements `onLayout`
with — does not fire in the sandboxed preview browser, so without the
override there is no way to look at these before shipping them.

### The questionnaire as her first check-in

**No migration was needed, and the "open problem" was already solved.**
`public.questionnaire_responses` has had a `highlights jsonb NOT NULL DEFAULT
'{}'` column all along — identical in shape to `checkin_responses.highlights`
— and its RLS policy is a plain `coach can manage responses` (`ALL`,
`is_coach()`). It was already being *read* (`onboarding/questionnaire.js`
renders `response.highlights?.[i]`); it simply never had a writer. Added
`setQuestionnaireHighlights(userId, highlights)` to `coachClient.js` — keyed
by `client_id`, since that table has **no `id` column at all** (one response
per client), unlike `checkin_responses`.

New `components/nutrition/OnboardingCheckinView.js` renders on the Check-In
tab: questionnaire answers, starting photos, objective-tracking days, with
the tab's own Notes/Focus rail unchanged beside it so the whole review is one
screen to talk over. **The answers go through `CheckinAnswerList` rather than
a second copy of the markup** — highlighting has enough hard-won edge-case
handling in it (see `HighlightableAnswer.web.js`) that a parallel
implementation would drift; questionnaire answers just have `hasPrior` and
`hersOnly` false.

**Onboarding is deliberately NOT mapped onto the calendar week containing her
start date.** It has no `week_start` of its own, and inventing one would
collide with a real check-in filed that same week by anyone who started
mid-cycle. It sits at the bottom of the picker under "Where she started".

### The week selector

`CheckinWeekTimeline` gained optional `onSelectWeek` / `selectedWeekStart` /
`pastWeeks` / `onboardingEntry`. Without them it renders exactly as it always
did on the Settings tab, so that surface gains no tap target that goes
nowhere. New `CheckinWeekPicker.js` wraps it in a centred modal (coach
desktop-web convention) opened by pressing the Check-In tab's own date title.
Reusing the timeline means the statuses in the picker are the same ones the
Settings tab shows, from the same code — a second list would be a second
definition of "completed". Verified that the nested Reopen `Pressable` still
swallows its own press rather than also selecting the row.

### Three real bugs found while doing it

1. **Phantom missed check-ins — found by Terra on a real client.**
   `CheckinWeekTimeline` enumerated a flat N weeks back with no awareness of
   `client.start_date`, so every week before a client existed rendered as
   **Missed with a Reopen button**. Melissa Benson (started 2026-08-09) had
   four. The Weeks tab has always guarded against this via `maxWeeks`; this
   timeline never did. Now filtered to weeks whose **end** falls on or after
   `start_date` — the same "the week containing the start date is week 1"
   rule the Weeks tab numbers by, so the two screens agree on where her
   history begins. A week she actually filed a check-in for always shows
   regardless, so a data oddity can't strand real work out of reach.
2. **The picker listed 16 weeks while only 6 weeks of check-ins were
   loaded** (`TIMELINE_PAST_WEEKS`), which would have rendered a
   long-standing client's genuinely completed check-ins as Missed — with a
   Reopen next to them. `PICKER_PAST_WEEKS` is now exported from the picker
   and *is* the load window, so the two cannot drift. Stepping back beyond
   that window is still correct: the selected week's check-in is fetched
   individually by `getCheckinForWeek`, not read out of that array.
3. **"‹ Older" had no floor** — it just incremented `weekOffset` forever, so
   a coach could page back past onboarding into weeks the client never had.
   New `oldestWeekOffset` clamps it, and one step past her first real week
   now walks into **Onboarding** and stops there (Newer already steps back
   out of it), which makes the stepper a complete traversal of her history.
   Arithmetic verified against the real week helpers: Melissa clamps to
   offset 1 (exactly her two filed weeks), a 2024 client still reaches 86
   weeks, no `start_date` falls back to the picker depth rather than
   infinity, and a check-in dated before the recorded start date stays
   reachable.

**Also fixed in passing**: `NutritionOnboardingTab`'s starting-photos card
picked the earliest photo per angle from **all** photos with no
`photosSinceEngagement` filter — so the nine clients migrated off the Google
Sheets trackers were shown 2023/2024 photos as their starting set, the exact
bug already fixed in `onboarding/photos.js` but never in the tab's own copy.
Extracted to `components/nutrition/StartingPhotos.js`, scoped, and shared by
both screens so there is one definition of "her starting set".

**Verification**: clean `npx expo export -p web`, a Babel parse + scope pass
over all 11 touched files (a clean export alone does not resolve identifiers
— it has hidden a missing helper before), and real interaction through a
throwaway `app/zz-harness.js` route: a drag-select on a questionnaire answer
firing `onChangeHighlights(0, [[7,26]])` and rendering, week and onboarding
selection, Reopen not stealing the row's press, sparkline geometry read out
of the DOM, and the Melissa case re-rendered from her real row. **Not
click-tested behind a real login** — standing limitation.

## Coach notes autosave; the Plan tab stops reloading the page (2026-08-28)

Two reports from one sitting, same root shape: work disappearing because a
save was tied to something other than typing. No migration, no deploy step.

**Notes on a nutrition client lost three times in one check-in.**
`components/nutrition/GamePlan.js` was the last field in the app still holding
text in local state behind an explicit Save button — and **every surface that
renders it unmounts on a tap**: the Check-In tab is torn down on a tab switch
or a week page, and `ClientNotesBubble` closes on tap-away. So the text was not
"unsaved", it was destroyed. Now autosaves, with **three flushes because each
covers a case the others miss**: a 700ms debounce while typing (same delay as
the builder's Coach Ed rail), `onBlur` (clicking a tab moves focus first, so
this lands before the unmount), and an unmount flush fired directly rather than
by leaving the timer running. The button is replaced by a status line — *Saves
as you type → Saving… → Saved*, or a pressable **Not saved — tap to retry** on
failure, with the text left in the box. `saveIfDirty()` keeps its three-outcome
contract (`unchanged`/`saved`/`failed`) for the bubble.

**The Plan tab's lag was the page reload, not the input.** Every edit called
the page's `load()` — ~14 queries in three sequential waves with `listPhases`
in the **last** one — so a typed phase title genuinely vanished until the whole
page finished. `PlanPhases` now owns its list: optimistic local edit, persist
in the background, roll back with a toast only on a real failure, and push the
updated list up via a new `onPhasesChanged` prop (the page passes `setPhases`)
instead of refetching. `createPhase`/`addPhaseItem` return the inserted row
(`.select().single()`) so there is nothing to refetch to learn what was just
created; temp ids bridge the round-trip and those rows render dimmed and
non-editable until swapped. Enter now **keeps the bullet input open and
focused** (`blurOnSubmit={false}`) so a list can be typed straight down.

**A near-miss worth remembering: the preview pane runs at `window.innerWidth`
0, and that makes layout measurements lie.** Mid-verification the notes box
crashed with React's "Maximum update depth exceeded" — `onContentSizeChange`
feeding a measured height back into the style, walking 659 → 642 → … → 516. I
had it written up as a pre-existing production bug before checking: at a real
1280px viewport (`resize_window`) it reports once, sanely, and never loops. The
same zero-width viewport also made `scrollHeight` come back as 676px for an
EMPTY textarea, which sent an imperative-auto-grow attempt the wrong way.
**Check `window.innerWidth` before trusting any measurement from that pane**,
and re-derive rather than believing the first number. What the real-viewport
testing *did* establish: react-native-web fires `onContentSizeChange` exactly
once and never again as text grows, so the web notes box has always been fixed
and scrolling — it just opens at 150px now instead of 100px. Native still grows.

**Driving a controlled RN TextInput from the console**: assigning `.value`
through the prototype setter + an `input` event drives an `<input>` but did
**not** drive the multiline `<textarea>` here — React never re-rendered.
`document.execCommand("insertText", …)` on the focused node does, and it is
also what makes a race like "type, then unmount inside the debounce" testable
in a single tool call. A programmatic `click()` on another element unmounts
**without** blurring, which is how the unmount flush was isolated from the blur
flush. Also: `computer left_click` with a `ref` landed ~250px off here; raw
screenshot coordinates worked.

**Verified**: `npm run build` clean, a Babel parse + unresolved-identifier pass
over all five files, and both flows driven for real in a browser at 1280×900 —
one write per typing burst, blur flushing immediately, a note surviving an
unmount with zero writes issued beforehand, and a new phase card on screen 60ms
after Enter. Console errors checked in a **fresh tab** (the pane's log
accumulates stale errors across reloads). **Terra confirmed both live** before
this was committed.
