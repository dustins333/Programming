# History: platform, auth, GHL/registration, audits, PWA, iOS builds, test accounts

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## iOS push confirmed live, Universal Links, GHL import groundwork (2026-08-04, later session)

**Push notifications reached a real phone for the first time.** Build 6's TestFlight submission finished processing, Terra installed it, and a real announcement push (`announcement-scan`'s 15-minute cron) showed up on her device — the last gap noted in the previous section (a device with a real registered push token) is closed. This is a real end-to-end confirmation, not just "should work now."

**Real bug found from that same test: the in-app announcement popup didn't show on reopening the app**, even though the OS push notification itself arrived correctly. Root cause: `lib/notifications/AnnouncementChecker.js` only checked for due/unseen announcements once, in a mount-only `useEffect` keyed on `profile.id`. It's mounted at the `(member)/_layout.js` level, not as a per-tab screen, so the `useFocusEffect` fix already applied elsewhere in the member app (session-completion state) doesn't apply the same way here — reopening/foregrounding an already-running app doesn't remount the layout or change `profile.id`, so the check never re-ran. Fixed by also listening for `AppState` foreground transitions (`AppState.addEventListener("change", ...)`, re-checking whenever the app becomes `"active"`) — the first use of `AppState` anywhere in this app's own code. Worth checking for the same "mount-only effect at a layout/provider level, not a per-screen level" shape if a similar "works on cold start, not on reopen" report comes in elsewhere.

**iOS Universal Links configured and verified live.** `app.json` gained `ios.associatedDomains: ["applinks:app.kovastrength.com"]`; `public/.well-known/apple-app-site-association` (Team ID `CDY5M385LV` + bundle ID `com.kovastrength.mobile`, `paths: ["*"]`) is committed and deployed — confirmed serving with `content-type: application/json` at `https://app.kovastrength.com/.well-known/apple-app-site-association` (a `vercel.json` header rule was needed since Vercel doesn't infer the right content-type for an extensionless file). The three places that built a `kovastrength://` custom-scheme link (`reset-password.js`, the coach's admin resend-invite in `clients/[userId].js`, and `invite-staff`) now build `https://app.kovastrength.com/set-password` instead, so the link works whether or not the app is already installed. **Needs a new EAS build to actually take effect** — `associatedDomains` is a native entitlement, not something a JS-only update can carry to an already-built binary.

**Real Vercel-deploy lesson**: `kovaapp` (the `app.kovastrength.com` project) *is* connected to GitHub (`dustins333/Programming`, `main` branch, confirmed via the `kovaapp-git-main-*.vercel.app` auto-alias only git-connected projects get) — deploys happen by pushing to `main`, not via the Vercel CLI. Running `vercel --prod` directly is actively the wrong tool here: it does a raw local-disk upload that bypasses git's own file filtering and hit Vercel's 15,000-file request limit (uploaded 19,235) even though only 274 files are actually git-tracked. Don't suggest `vercel --prod` for this project again — just commit and push.

**This session's Supabase and EAS CLIs were both already authenticated** (same "don't assume the sandboxed limitation always holds" exception noted elsewhere in this file) — used for real, verified work rather than guesswork: confirmed migrations `0020`/`0022`/`0023`/`0024` and all 4 `pg_cron` jobs (`spc-alert-scan`, `nutrition-reminders-scan`, `nutrition-checkin-available-scan`, `announcement-scan`) were already live (several CLAUDE.md "not yet run" notes were stale), deployed `delete-account` (the one genuinely-undeployed function), and read real EAS build/submit state directly (`eas-cli build:list`/`submit:list --json`) rather than asking the user to check manually. Also cancelled a duplicate EAS submission directly (`eas-cli submit:cancel`) after a client-side TLS disconnect error caused a second `eas submit` attempt to queue alongside a first one that had actually succeeded server-side despite the local error.

**GHL client onboarding is fully built and verified end-to-end, same day, once Terra got a GHL Private Integration Token** — see the "Client onboarding via GHL + phone-OTP registration" bullet under Manual/deferred setup below for the complete current state. Short version: `import-client`, `request-registration-code`, `verify-registration-code`, and `app/(auth)/register.js` are all built, deployed, and confirmed working against the live project — a real account was created via a real GHL-fired webhook, texted a real code via GHL's Conversations API, verified, had its password set, and signed in successfully (confirmed via a direct password-grant token request, not just "the function returned 200").

**Two real bugs found and fixed getting there, both worth remembering as a class**: (1) `import-client`'s original field-parsing was written against a synthetic contract (`{name, email, contact_id}`) that turned out wrong once a real GHL webhook fired — GHL sends `first_name`/`last_name`/`full_name`/`email` as native top-level fields regardless of the webhook action's own Custom Data config, and only `contact_id` (which has no native top-level equivalent on this trigger type) needed to be added there explicitly. Fixed by reading the real fields the real payload actually had, not by asking Terra to reshape GHL's config further. (2) The GHL Private Integration Token returned a real, specific `401 "The token is not authorized for this scope"` from GHL's own API on the first send attempt — the token already had "Edit conversations"/"Edit conversation messages" scopes checked, but sending required a separate, additionally-named scope that wasn't obviously the same thing from the scope picker's own labels. Diagnosed by curling GHL's API directly with the same credentials the Edge Function uses (bypassing the function entirely) to get GHL's real error text, rather than guessing from the function's own deliberately-generic `{sent: true}` response — worth doing again for any future "did the third-party API call actually work" question, since Supabase's CLI doesn't expose remote Edge Function logs (`supabase functions logs` isn't a real subcommand as of this CLI version — only `list`/`deploy`/`download`/`delete`/`new`/`serve`).

**This all works on the web build (`app.kovastrength.com/register`) today, no native rebuild needed** — new Expo Router screens and Edge Function calls are pure JS, unlike the Universal Links entitlement change earlier in this session. The already-installed TestFlight build won't get the new Register screen until a future build bundles it, though (no EAS Update/OTA channel configured for this project as of this writing).

**First Android build ever attempted — finished successfully** (`eas build -p android --profile production`, version code 2) — checked live, Android had never been built before this session. Made it through despite Expo's own active "Elevated Android build failures" partial outage at the time (iOS unaffected); produced a real `.aab` artifact. A cloud-managed Android keystore was auto-generated since none existed. **Play Store is still blocked on**: Terra's Play Developer account finishing identity verification, a Play Console service-account key (for `eas submit -p android`, needs adding to `eas.json`'s `submit.production.android`), and — a real content gap found this session — `kovastrength.com/privacy-policy/` is generic GHL/marketing boilerplate that never mentions the app or any of the health-adjacent data it actually collects (workout logs, nutrition data, progress photos). A drafted addendum covering that was handed off for Terra's/legal's review; not yet published to the site. Also worth flagging when it comes up: Google requires new personal Play Developer accounts to run a closed test with 20+ testers for 14 days before allowing a production release — a real calendar constraint independent of anything else being ready.

**Clarified how the GHL bulk-import rollout is actually meant to work, prompted by direct questions**: a client imported via `import-client` shows up on the Clients list *immediately* when the webhook fires — well before they've ever opened the app — since `listMembers()` has no gate beyond `role = 'member'`. This means a coach can fully set up someone's Flagship/SPC/Nutrition programs ahead of their first session, then walk them through the in-app Register flow in person. No email or SMS goes out automatically when the webhook fires (deliberate — the whole design point of phone-OTP was avoiding an automated message that might not land), so today that first-session hand-holding (or a separately-configured GHL automation) is the only thing that tells a client the app exists at all.

**New: a "Not registered yet" option on the web Clients list's Status filter** (`app/(coach)/clients/index.web.js`) — repurposed the existing Flags dropdown into a combined Status filter (All / Has flag / Not registered yet) rather than adding a fifth control, per direct ask to reuse either the Sort or Flags dropdown instead of growing the row. Backed by `core.get_login_activity` (migration 0022, same RPC the individual client detail page already used) called once for the whole roster, not per-row. Lets a coach pull up exactly who's been bulk-imported but hasn't gone through Register yet, to follow up in person — the actual reason this was asked for, ahead of migrating the existing ~140-200 clients over. Bundle-checked only, same standing login limitation as every other coach-side change in this file.

## Two real "signed out too often" bugs found and fixed — no schema/deploy changes (2026-08-05)

Direct complaint from Terra: both the web app and the TestFlight app were kicking people back to a sign-in-adjacent screen far more often than actual session/token expiry could explain. Traced two separate, concrete mechanisms (not just theory — walked the actual `@supabase/auth-js` 2.110.7 source to confirm both failure paths end in exactly this symptom) and fixed both:

**Bug 1 (both platforms) — a network blip during profile refresh got treated as "you have no profile."** `lib/auth/AuthProvider.js`'s `loadProfile()` re-fetches the caller's `core.users` row on every `onAuthStateChange` event, including the routine background token refresh that fires roughly hourly on both web and native. The old code treated *any* fetch error (a dropped connection, a slow response, a transient 5xx) identically to "this account genuinely has no profile row" — `setProfile(null)`, no retry. `app/(member)/_layout.js` and `app/(coach)/_layout.js` both `Redirect` to `/pending-setup` whenever `!profile`, and that screen reads *"Your account is signed in, but a coach or admin still needs to finish setting up your profile"* with a prominent Sign Out button — which looks exactly like getting logged out, and actually does log you out if tapped. Fixed: `loadProfile()` now retries a failed fetch up to 3 times (500ms/1000ms backoff) before giving up, and never clears an already-loaded profile over a transient error after retries are exhausted — stale-but-correct profile data beats a false "signed out" bounce. Also added a `profileRequestId` ref so an older, slower-resolving call can't stomp a newer call's result if two land close together (e.g. the initial `getSession()` call and an `onAuthStateChange` `INITIAL_SESSION` event racing at boot).

**Bug 2 (native/TestFlight only) — a real storage race could silently corrupt the saved session.** `lib/supabase/largeSecureStore.js` (the `expo-secure-store` + `AsyncStorage` wrapper backing Supabase's native session persistence) used to generate a **new** random AES key on every `setItem` call, write it to SecureStore, *then* write the ciphertext to AsyncStorage as a second, separate write — no atomicity between the two. Since this runs on every background token refresh, and iOS can suspend/kill an app between two sequential awaited writes as a completely routine event (not an edge case), a suspend landing between those two writes left SecureStore holding the new key while AsyncStorage still held ciphertext encrypted under the old one. Confirmed via `@supabase/auth-js`'s own `getItemAsync` (`lib/helpers.js`) that a resulting JSON-parse failure is caught and silently treated as "no session" — no error, no `SIGNED_OUT` event, just a null session on next launch, i.e. indistinguishable from being signed out. Fixed by generating the AES key **once** (lazily, reused after that) instead of rotating it every write, so `setItem` is now a single atomic AsyncStorage write; a fresh random nonce is still prepended to the ciphertext on every write (not a reused counter) so reusing the same key across writes doesn't reintroduce an AES-CTR keystream-reuse weakness. `getItem` also now wraps decryption in a try/catch and treats any failure (e.g. a leftover value in the old pre-nonce-prefix format) as "no session" rather than throwing.

**One-time cost of the storage-format change**: an already-installed TestFlight build's existing stored session won't decrypt under the new nonce-prefixed format (old ciphertext has no nonce prefix) — every native user needs one fresh login after this ships, then sessions should stick. No migration, no Edge Function redeploy, no schema change — both fixes are pure client-side logic. Bundle-checked only (`expo export -p web`, clean); the actual sign-out-frequency improvement itself isn't independently verifiable from this environment (same standing login limitation as everywhere else in this file) — worth Terra keeping an eye on whether the "signed out" reports actually drop off.

## Quality audit & fix pass — all 4 rounds done (2026-08-07)

Terra's ask: stop the "little things keep getting missed" pattern — prompted by a web-vs-app auth bug, the Exercise Library scroll bug surviving two prior fix attempts, and three fresh member-logging bug reports. Full audit of the member flow, coach flow, auth layer, and navigation graph turned up ~60 distinct issues, split into 4 rounds. **Full plan with every finding's file:line detail lives at `/Users/Dustin/.claude/plans/when-my-credits-reset-swift-horizon.md`** — read that before starting Round 3, it has everything this summary compresses.

**Round 1 — the 4 reported bugs, all fixed and confirmed working:**
- Exercise Library (and `clients/index.web.js`) now scroll — both were a plain `View`+`FlatList` inside `CoachShell` instead of a real `ScrollView`; `app/+html.js`'s `body{overflow:hidden}` means every screen must supply its own scroll container, and neither did.
- PWA decimal keyboard — `keyboardType="numeric"` maps to an RNW `inputMode` with no decimal key; switched every real decimal field (weight, sleep, targets, photo weight) to `decimal-pad`.
- Keyboard covering My Fitness's logging cards — added `KeyboardAvoidingView` to the three logging bottom-sheets. Confirmed working by Terra.
- Finalize button now renders on the last focus card and closes back to the overview on success — confirmed end-to-end via a live DB query (`session_completions.completed_at` update), not just a screenshot, after the pixel-hunting in the Simulator became too slow (see `[[feedback_dont_hunt_simulator_taps]]` memory).
- Bonus, same session: the web PWA viewport staying zoomed in after the keyboard closes (Safari's own bug) — `components/ViewportZoomReset.js`, mounted at the app root, forces a viewport-meta reset on every input blur.

**Round 2 — silent failures & auth, DONE, bundle-verified after every commit, NOT yet visually verified (standing login limitation):**
- New `lib/toast.js` + `components/ToastHost.js` — a real cross-platform toast (rendered through an RN `<Modal>` so it stacks above an already-open create/edit modal), replacing **all ~78 `Alert.alert` call sites** across `app/(coach)/**`, `components/nutrition/**`, and the member web-reachable screens with the same gap. `Alert.alert` is `static alert() {}` on react-native-web — every one of those was silently going nowhere on the platform where Terra does most of her work.
- Fixed handlers with no error handling at all: My Fitness's finalize, both web workout builders (had zero error surface — no `Alert` import, no `loadError`, `handleTogglePublish` had no catch so a failed publish looked identical to a successful one, 6 fire-and-forget writes per file), Settings bricking its entire page on one failed fetch, and a drag-to-reassign bug on the SPC dashboard that replaced the whole roster with a red sentence.
- Added Retry to every one of those error screens (~25 files) instead of a dead end, and fixed the 4 member nutrition sub-tabs (Today/Weekly/Check-In/Photos) hiding their own `SegmentedControl` on error — one blip used to trap the member on whichever sub-tab broke with no way to switch tabs.
- 4 auth bugs, all "looks like being signed out but isn't": `AuthProvider`'s `ready` collapsing on every token refresh (roughly hourly, and on native also on every foreground) and unmounting the whole nav tree mid-session — this was the actual bug behind Terra's original web-vs-app auth report; a cold-start network blip still routing to `/pending-setup` with only Sign Out as an exit (now distinguishes "fetch failed" from "no profile row," offers Retry); `(auth)/_layout.js` redirecting away from `/set-password` the instant `detectSessionInUrl` mints a session on web, before the user ever saw the password field; `register.js` reading only `error.message` on a failed Edge Function call instead of the real body (`FunctionsHttpError.context`), so every registration failure showed the same generic message regardless of cause.
- 9 member data-correctness bugs found while touching this code: dead "Extras" one-off bubbles (missing a `published` key), coach's per-exercise notes silently dropped/overwritten on both group and SPC programs, `useNutritionAccess` mount-only-ness making the whole Nutrition tab vanish on a transient error, a trapped `history/[exerciseId]` screen with no back link reachable on failure, `plan-block.js` showing the wrong program's block due to a missing effect dependency, `plan.js` silently reverting a manually-picked program tab back to the original deep-link param on every focus, SPC fetch errors being shown as "not assigned to a program," and a missing `isSpcActive()` check letting a paused SPC client still see their old content.
- Commits: `b5ab052` (Round 1), `38d1b02` (viewport zoom), `a10b629` (toast sweep), `29e0f03` (uncaught handlers), `225a78d` (retry buttons), `a68ef7c` (auth), `d2b45a6` (member data-correctness). All pushed.

**Round 3 — navigation correctness — DONE.** Full detail in the plan file's "Batch 3" section, commit `a11305a`. Added missing back buttons on `exercises/index.js`/`announcements/index.js`/`settings.js`/the nutrition onboarding hub (native has no back at all without one, `headerShown:false`) — all native-only, since web already has the `CoachShell` sidebar. Wrong-destination back links on multi-entry screens (`blocks/[blockId].js`, `clients/[userId].js`, `spc/[userId].js`, `nutrition/clients/[userId].js` ×2, `spc/blocks/[blockId].js`) now use a `router.canGoBack() ? router.back() : router.push(fallback)` guard instead of a hardcoded `Link`, same fix applied to the 4 previously-unguarded `router.back()` calls. Native was losing the `?program=` filter entirely on the Clients list (nothing there ever called `useLocalSearchParams`) — new `lib/programming/clientsRoster.js` extracts the roster-aggregation query so native and web share one implementation instead of diverging again; a `?program=null` race in `blocks/index.js`'s History button is now guarded too. SPC Templates were gated web-only despite a complete native builder already existing (`spc/templates/[templateId].js`) — gate removed. `more.js`/`programs.js` now wrap in `CoachShell` so a direct web visit doesn't strand a coach with no sidebar. Coach screens that are `Tabs` navigator roots (dashboard, clients, nutrition, blocks, spc, exercises, settings, announcements) switched from mount-only `useEffect` to `useFocusEffect`, since native keeps them mounted across tab switches and stats/rosters were going stale for a whole session. 5 destructive actions (delete SPC template, archive exercise, remove one-off, Nutrition switch-to-archived, delete a template/per-client question) now confirm via `lib/confirmDialog.js` instead of firing instantly.

**Round 4 — the 3 features Terra explicitly asked for — DONE.** Full detail in the plan file's "Batch 4" section, commits `7ca52f2`/`9592eb2`/(messaging, below).
1. **Coach sees a member's actual logged reps/weight** — no migration needed, `staff manage logs`/`staff can read session completions` RLS already existed. New `lib/programming/coachLogs.js`'s `listRecentSessionsForUser()` mirrors My History's day-timeline query scoped to an arbitrary `userId`; per-session expansion reuses `memberPlan.js`'s `listLogsForDate` as-is (same precedent as `getCurrentBlock` being reused for the coach side elsewhere in this file). New `components/RecentSessionsCard.js` — a per-client accordion — is wired into `clients/[userId].js` as a "Recent sessions" card.
2. **Exercise library where-used + safe archive.** Archiving flips `is_active`, and every member-facing embed of `programming.exercises` is RLS'd on `is_active` — an in-use exercise going inactive silently blanks its name out of a live session. New `getExerciseUsageCount()` (`lib/programming/exercises.js`) runs 8 cheap head-only counts across group/SPC/template/one-off exercise+warmup tables and feeds the result into `confirmArchiveExercise()`'s message. `listExercises({includeArchived})`/`setExerciseActive(id, true)` already existed but were never called that way — Exercise Library gained a "Show archived" toggle and an Un-archive action. Also renders `exercises.cues` (write-only until now — typed into the form, never shown anywhere) on each Exercise Library row, and warm-up `notes` on the member's My Fitness `WarmupCard` (the actual session-logging screen — `SessionPreviewModal`/`SessionDetailModal`'s plain warmup-name lists elsewhere were deliberately left alone, would need reshaping 4 separate member screens' warmup arrays for a lower-traffic preview-only surface).
3. **Coach↔member messaging.** The only genuinely new schema in this pass — `CommentThread` was coach-to-coach only by design (RLS, copy, API shape all assumed that), and there was no member→coach channel anywhere despite `(member)/settings.js` already shipping a `notify_coach_messages` toggle with nothing behind it. New migration `0032_client_messages.sql` (**run** — confirmed live via direct schema query 2026-08-07) adds `programming.client_messages` — one flat thread per client (`user_id`), not per-coach, matching this app's "all coaches see all clients" design (`core.is_staff()`); `sender_role` (`'member'`/`'staff'`) is stamped app-side rather than inferred from `sender_id`'s own role, since a coach/admin's dual-login "My Training" identity would otherwise misclassify their own messages. Insert-only RLS (no update/delete anywhere — messages are an immutable log, same shape as `program_comments`). New `lib/programming/messages.js` (`listMessages`/`sendMemberMessage`/`sendStaffMessage`) and shared `components/MessageThread.js` (scrollable sender-labeled list + send box, not a chat-bubble UI — this app has no existing chat-bubble pattern to match). Coach surface: a new "Messages" card on `clients/[userId].js`, coach names resolved via `listCoaches()` for staff-authored rows. Member surface: new hidden route `app/(member)/messages.js`, reached via a chat-bubble icon next to the gear icon on My Week's header (not a 6th tab, same `href: null` pattern as Settings). Push fires one-directional — staff→member only, gated on the target member's own `notify_coach_messages` flag (read off `member.notify_coach_messages`, already loaded via `getUser`) — via the existing `sendPush()`/`send-push` Edge Function, fire-and-report so a push failure doesn't look like the message itself failed to send. No coach-side push (member→staff) since there's no per-coach notification preference to gate it on, and the ask only named the one toggle. **Deliberately no unread-message indicator** — a real gap for a coach managing 150+ clients, but out of scope for this pass; worth a follow-up (`programming` schema would need a small `last_read_at`-per-party table, not just a column on an existing row) if Terra asks.

**Also found, deliberately not scheduled** (flagged in the plan file, not forgotten — several since resolved: SPC missed-session flags and the `deletePhoto` wiring were built in the follow-ups section below, and the dead exports (`getNextIncompleteSpcWorkout`, `setPhotoFrequency`/`clearPhotoFrequency`, etc.) were deleted in the 2026-08-09 ship-readiness audit): `dashboard_dismissals` is keyed globally, not per-coach; `getNutritionRoster`/`getSpcRoster`/`listMembers` are unscoped by coach (every coach sees every coach's clients — possibly fine for a one-gym product, worth confirming with Terra before treating as a bug).

**Standing verification gap**: everything in Rounds 1-2 is bundle-checked (`npx expo export -p web`, clean after every commit) but not click-through-verified except the 4 things Terra tested live in Round 1 (keyboard fix, finalize button, and the two she'll check on the PWA herself). Same login limitation as everywhere else in this file. Worth a real pass once Round 3/4 land too, before calling this done.

## Quality-audit follow-ups: SPC missed-session flags, photo staging/delete, nutrition coach assignment, Messages inbox (2026-08-07)

Terra picked four items off the "found, deliberately not scheduled" list above and asked for them built. Full plan at `/Users/Dustin/.claude/plans/its-pushed-ok-we-binary-duckling.md`.

1. **SPC missed-session flags** — `getMissedSessionFlagsByUser()` (`lib/programming/flags.js`) now covers SPC too, not just group. SPC has no day-of-week routing, so this is deliberately **retrospective**: it checks the most recently *completed* week (`currentWeekNumber - 1`), only once a client is at least in week 2 of their block — a session flags as missed only after its whole week has fully passed, never mid-week. New `addSpcFlags()` batch-fetches active `spc_clients` → each one's block covering today → that block's published workouts in the check-week → completions, and merges into the same `flagsByUser` map the group scan already builds (one-offs are structurally excluded — no `week_number`/`spc_block_id` at all, so they're never part of the query). Every flag object now carries a `period` field (`"this week"` for group, `"last week"` for SPC) — `SnapshotPanel` in `clients/[userId].js` interpolates it instead of a hardcoded "this week" string, which used to read wrong for a retrospective SPC flag. No migration — pure query logic against existing tables.
2. **Progress-photo staging "×" + coach-only delete.** `components/nutrition/PhotoUpload.js`'s `AngleBox` gained a small circular "×" on a populated thumbnail (member-facing, and the coach's `allowDatePick` backfill mode which shares the component) — clears the locally-staged pick back to empty before the separate "Upload" tap commits it to Storage; pure local state, no `photos.js`/DB change. Separately, the already-existing-but-uncalled `deletePhoto()` (`lib/nutrition/photos.js`) is now wired into `components/nutrition/PhotoSubmissionsEditor.js`'s `DayEditor` (the coach-only "Fix a day's photos" tool) — a small trash icon per photo thumbnail, confirmed via new `confirmDeletePhoto()` (`lib/confirmDialog.js`), then a real delete (Storage + DB row) with the local `rows` state updated and `isValidSet` re-run. Per Terra's answer: members can clear a staged (not-yet-uploaded) pick themselves, but deleting an already-submitted photo is coach-only — `PhotoCompare.js` (shared by the member's own Photos tab) deliberately got no delete affordance.
3. **Nutrition coach assignment starts unassigned.** `public.clients.coach_id` was `not null` and `createOrReactivateClient()` used to default it to whichever coach flipped the Nutrition switch on — migration `0033_nutrition_coach_optional.sql` (**run** — touches the shared `public.*` schema, not `programming`/`core` — drops the not-null constraint; backward-compatible, the standalone Nutrition Tracker app is unaffected since it keeps setting a real `coach_id` on its own inserts) plus a code change so a fresh insert now passes `coach_id: null` and the function's `coachId` param is dropped entirely (the one call site, `handleNutritionToggle` in `clients/[userId].js`, stopped passing it). New shared `components/nutrition/CoachAssignmentField.js` (same web-`<select>`/native-pill-row split as SPC's own `CoachDropdown`) is wired into two places: the Objective Tracking onboarding step (`onboarding/tracking.js` — also fixed a real pre-existing bug there, a missing `Pressable` import that crashed the `loadError` Retry button), and `ClientSettingsModal.js` (below Status, included in the existing `handleSave`'s `updateClient` payload) so assignment stays editable any time after onboarding too. `getNutritionRoster()`'s coach-name fallback changed from `"—"` to `"Unassigned"` (matching SPC's own wording) now that it's a common real state, not just a display polish for an edge case.
4. **Coach Messages inbox** (`app/(coach)/messages/index.js`, new) — the messaging feature that shipped as a buried per-client card on `clients/[userId].js` (see the Round 4 note above) now also gets a real inbox: `listThreadSummaries()` (`lib/programming/messages.js`) groups `client_messages` by client (client-side reduction over the full message set — same "fetch everything, group in JS" pattern as `listDayTimeline` elsewhere, since supabase-js has no DISTINCT ON), sorted by most recent activity. One universal file (`Platform.OS` branch for layout, not a `.web.js` sibling — no drag-and-drop or platform-specific library involved) renders a two-pane list+thread on web and a list-then-drill-down-with-back on native, reusing `MessageThread` unmodified for the thread pane. Nav: `CoachShell.js`'s sidebar gained a plain "Messages" item (no `permission` gate — this isn't behind any `can_view_*` toggle), native reaches it via `More`, `_layout.js` registers the route as `href: null` same as `blocks`/`spc`/`settings`.
   - **Real unread tracking**, not just a list — migration `0034_client_message_reads.sql` (**run**) adds `programming.client_message_reads` (`user_id` PK, `last_read_by_member_at`/`last_read_by_staff_at`) — two timestamps because the thread itself is shared (any staff can post, and "read" from the staff side is one shared state across all coaches, not per-coach, matching this app's "all coaches see all clients" design), not a per-message flag. Staff side is a plain `for all using (core.is_staff())` policy (any coach can mark any thread read/unread — new `markThreadReadByStaff`/`markThreadUnreadByStaff`, upserting `last_read_by_staff_at`). Member side needs a narrow security-definer RPC (`programming.mark_own_thread_read()`, same pattern as `core.update_own_notification_prefs`/`acknowledge_nutrition_milestone`) since RLS can't restrict *which column* a plain update touches, and a member must never be able to write `last_read_by_staff_at`.
   - **Coach-side**: each inbox row shows a red dot + bold name when `unread` (latest message is member-authored and newer than `last_read_by_staff_at`), plus an explicit "Mark as read"/"Mark as unread" Pressable per row (no need to open the thread first, per direct ask) — `handleToggleRead` doesn't stop the row's own `onPress` from also opening the thread; the row's own `onPress` and the mark-read button's `onPress` are separate elements so they don't collide. Opening a thread also auto-marks it read via the same `markThreadReadByStaff` call.
   - **Member-side**: `app/(member)/messages.js` calls `markThreadReadByMember()` in its existing `useFocusEffect` (fire-and-forget, doesn't block the thread load) — opening the screen is what clears the flag, no explicit button, matching Terra's ask that the explicit mark-read/unread control is coach-inbox-only. `app/(member)/index.js` (My Week) gained one more isolated `hasUnreadMessages` fetch (own try/catch, same "one domain's failure shouldn't hide another" pattern as groups/spc/nutrition/one-offs on that screen) and renders a small red dot on the header's chat-bubble icon when true.

**Migrations for this session**: `0033_nutrition_coach_optional.sql` and `0034_client_message_reads.sql` are both **run and confirmed live** (schema queries: `public.clients.coach_id` is nullable, `programming.client_message_reads` and `mark_own_thread_read()` both exist), `NOTIFY pgrst, 'reload schema'` sent after. This session had live read *and* write access via an authenticated Supabase CLI — the harness's auto-mode classifier initially blocked the mutating `db query -f` call as too high-risk to run unattended (used to confirm real schema state throughout in the meantime — e.g. `public.clients.coach_id` really was `not null`, `programming.client_messages` and `0028`'s `nutrition_checkin_reopens` were already live despite this file previously saying "not yet run" for both, now corrected above and below), then allowed it once Terra explicitly confirmed in chat.

**Not visually verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`npx expo export -p web` after each logical batch, clean, zero errors). Both migrations are run, so all four features are live end-to-end, not just code-complete — worth a manual click-through: an SPC client with a genuinely missed week showing the "· last week" flag, clearing a staged photo before upload, a coach deleting a duplicate submitted photo, assigning/reassigning a nutrition coach from both the onboarding step and Client Settings, and the Messages inbox's unread dot/mark-read-unread/two-pane behavior on web plus the drill-down on native.

## Ship-readiness audit pass (2026-08-09)

Full-app sweep per direct ask ("overall check... excess code... efficiencize... missed buttons... ready to ship"), run as three parallel audit agents (dead code / interactive wiring / efficiency-consistency) plus a live check of migrations, Edge Function deployments, and the original build plan. The good news first: **no orphaned handlers (the handleAddWarmup class of bug is gone), no buttons without onPress, no Alert.alert stragglers, no console.log/TODO debug leftovers, no dead files, no misplaced components in app/, no invalid Tailwind fractional spacing, and zero remaining `StyleSheet.absoluteFillObject` usages.** All 16 Edge Functions deployed with correct verify_jwt flags; migration ledger above corrected (0014/0020/0041/0045/0046 were all already live despite stale "not yet run" notes).

**Real bugs found and fixed:**
- **All three drag-to-reorder lib functions (`reorderWorkoutExercises`/`reorderSpcWorkoutExercises`/`reorderTemplateExercises`) never checked the Supabase error** — their `Promise.all` over per-row updates discarded each result, so the already-written `.catch(toastError)` handlers in all three web builders were dead branches: a failed reorder (RLS/offline) looked like success and silently reverted on next load. Each now throws on any row error.
- **The native SPC template editor (`app/(coach)/spc/templates/[templateId].js`) had zero error handling** — missed by the Round-2 toast sweep that hardened its `.web.js` sibling. All five write handlers now toast on failure, and the two optimistic deletes (exercise/warm-up) roll their row back into local state instead of leaving a phantom-deleted row. Its `adjustSets`/reps writes still don't maintain `rep_scheme` the way the web sibling does — **deliberately left alone**, that's the separate 0029/0030 session's active territory.
- **`CommentThread`'s post had try/finally with no catch** — a failed coach note showed nothing. Now toasts.
- **`checkAndAutoDraft()` was a serial per-client N+1** (`getLatestSpcBlock` in a loop) running on every SPC-dashboard *and* coach-Home load — now one batched `spc_blocks` query with the same newest-first/first-match semantics.
- **Stale-data fixes**: `more.js`'s messaging-toggle check, `clients/[userId].js`'s whole load, member `settings.js`'s assigned-coach fetch, and both payroll Report tabs' finalization/lock fetch all moved from mount-only `useEffect` to `useFocusEffect` (all are kept-mounted Tabs children; the payroll one additionally never re-ran because `useOwnReport` restores the same `selectedPeriod` on refocus).
- **Blast-radius isolation**: `clients/[userId].js` no longer blankets SPC+Nutrition+programming in one `Promise.all` — SPC/Nutrition now fetch via `allSettled` with a per-card inline error, and the enrollment `Switch` is *withheld* on error (a silently-null row would read "Not enrolled" and invite a wrong re-enroll toggle). `nutrition/clients/[userId].js`'s 10-way `Promise.all` split the same way: render-gating fetches stay strict, display-only ones (focus items, photos, check-in timeline, OT logs) are isolated.

**Excess code removed** (each verified 0 references before deletion): dead exports `listSpcClients`, `listRequestsForPeriod`, `listEntriesForDate`, `listPhotosByAngle`, `getPhotoSignedUrl` (singular), `setPhotoFrequency`/`clearPhotoFrequency`, `getNextIncompleteSpcWorkout`; 16 unused imports across 12 files; `PayrollTabBar`'s dead `t.adminOnly` filter (no tab defines that key). **Deliberately kept**: `lib/supabase/client.js`'s inert `nutrition` schema handle, `components/NumericInputAccessory.js` (documented no-op, 27 files still pass its ID harmlessly), `unsubscribeFromWebPush` (inverse of a live API — there's no UI to turn web push off yet, a real gap worth a Settings toggle someday), and `EXERCISE_TYPES` (the exercise-library area is the parallel 0029/0030 session's workspace).

**Known duplication, flagged not consolidated** (each copy works; merging them is churn with real divergence risk mid-parallel-session): `addDays` ×5 and `daysBetween` ×5 across lib files — the `daysBetween` copies have *three different* rounding/offset semantics (`Math.round` vs `Math.floor`, one `+1`), so any future consolidation must check each call site's intent, not just dedupe; calendar-grid math duplicated between `DateCalendarPicker`/`PayrollDatePicker`; `stripGroups`/tab-bar shells ×3; a few small formatters (`fmt` ×3 with different rounding, `pct` ×2, `groupByExercise` ×2, `extractFunctionErrorMessage` ×2, `snapshotStaff` ×2).

**Flagged for Terra, not built** (feature gaps, not cleanup): native SPC template editor has no "+ New exercise" (web does — native can attach but not create); native nutrition roster has no coach filter (web does, and native *SPC* does, so nutrition is the odd one out); `app/support.js` has no in-app entry point or back link (fine if it's only the App Store support URL); unused deps `expo-crypto`/`expo-linking`/`@expo/ngrok` could be dropped from package.json but weren't (npm reinstall fragility documented above isn't worth the risk for zero runtime benefit); Exercise Library renders unvirtualized (`ScrollView` + `.map`) — fine at current library size, worth a `FlatList` if it ever feels slow.

Verified: `npx expo export -p web` clean (zero errors/warnings) after all edits, and zero remaining references to every deleted export. **Not visually verified** — standing login limitation; the touched screens (client detail, payroll reports, native template editor, More tab) are worth a quick click-through.

## GHL contact collision silently breaks registration (2026-08-09)

Real report: re-importing `dsmout3@gmail.com` via the GHL "won" webhook appeared to work, but Register never texted a code. Diagnosed live (authenticated Supabase CLI) — **the webhook half genuinely did work; the failure was entirely in the second write.**

`import-client` does two writes: `auth.admin.createUser`, then an upsert onto `core.users` carrying `ghl_contact_id`. The auth row was created fine. The `core.users` upsert then failed with a unique violation — `core.users.ghl_contact_id` is `UNIQUE` (migration 0026), and the contact GHL sent (`Y5bLtvYia5p7cF86alWt`, which *is* dsmout3@gmail.com's own GHL contact) was already sitting on `dustin@kovastrength.com`'s row from the 2026-08-08 tie-in. So the function 500'd, **GHL's webhook action surfaces nothing on a non-2xx**, and the result was an `auth.users` row with no matching `core.users` row at all.

That orphan state is exactly what makes the symptom confusing: `request-registration-code` looks the member up in `core.users` by email, finds nothing, and — deliberately, for email-enumeration reasons — returns a uniform `{sent:true}` with no text sent and no error. **A silent "no code arrived" on Register almost always means no `core.users` row (or no `ghl_contact_id` on it), not an SMS/GHL problem** — check that before touching GHL scopes or the Conversations API.

Fixed by moving the contact per Terra's call: cleared `ghl_contact_id` off `dustin@kovastrength.com`, inserted the missing `core.users` row for `dsmout3@gmail.com` (role `member`) holding the contact. **Consequence, accepted deliberately**: `book-checkin-session` is the only thing that reads a caller's own `ghl_contact_id`, so `dustin@kovastrength.com` can no longer book a Zoom check-in through the nutrition flow. `notify-review-signin` is unaffected — it hardcodes the same id as a literal (`TERRA_GHL_CONTACT_ID`), it does not read the DB.

**Two real gaps this exposed, neither fixed (not asked for):** (1) `import-client` has no handling for a `ghl_contact_id` collision — it just 500s into a void, and since GHL doesn't surface that, every future collision will look like a successful import. Options if it ever comes up: retry the upsert without the contact id so at least a usable `core.users` row lands, or return 200 with a warning payload so GHL's log isn't blank. (2) Nothing in the app flags an `auth.users` row with no `core.users` row — an account in that state can't register, can't be found by the Clients list, and is invisible everywhere.

## The refresh pill that never went away, on Chrome (2026-09-07)

Reported from an installed Chrome PWA: tap Refresh, the page reloads, a few
minutes later the same pill is back, over and over. Not the 2026-08-09
nagginess (that one was accurate and merely relentless) but a **false
positive that no refresh could ever satisfy**. No migration, no deploy step,
one file.

**`AppUpdateChecker` compared two different things and called them the same.**
It read the running version as `document.querySelector("script[src]")` — the
first script with a src *anywhere in the DOM* — and the deployed version by
regexing the first `<script src>` out of a freshly fetched `/`. Those only
agree when nothing else has put a script on the page, and **the entry bundle
is the very last element in `<body>`** (verified against both the deployed and
a freshly built `index.html`), so literally anything injected ahead of it
wins the DOM query. A browser extension does exactly that, extensions run
inside an installed Chrome PWA window, and an extension URL can never equal a
deployed filename — so the comparison failed identically on every single
load, forever. Reproduced on the real page: injecting one script into
`<head>` flips the old selector to `chrome-extension://…` while the entry tag
sits untouched at the bottom of the document.

Two changes, and the second matters more than the first:

1. **Match the app's own bundle explicitly on both sides** — a
   `script[src*="/_expo/static/js/"][src*="entry-"]` selector and the
   equivalent regex, kept next to each other so they cannot drift. If Expo
   ever moves that path both sides stop matching, the effect bails early and
   the checker quietly does nothing, which is the right direction to fail in.
2. **A reload-didn't-help guard**, because I could not see the reporter's
   browser and "an extension is injecting" is an inference, not a
   confirmation. Tapping Refresh stamps the target src into `sessionStorage`;
   on the next mount, if the version actually running still isn't that one,
   the reload demonstrably did not help, so that version is retired for the
   session instead of being offered again. Any cause — an extension, a stale
   PWA cache, two edge nodes disagreeing — degrades to **at most one prompt
   per deploy** rather than an unbreakable loop. The wall display's
   auto-reload goes through the same marker, or it would have reloaded itself
   every minute forever on the same trigger.

**Worth generalising: comparing "what's running" against "what's deployed"
means naming the artifact you care about, not taking the first thing that
looks like it.** "The first script on the page" is a description of a
document you control end to end; a real page in a real browser is not that.

`sessionStorage` is wrapped in try/catch on every access and the reload fires
**outside** it — a private window with storage blocked must still be able to
refresh, the marker is only a safety net.

**Verified**: the shipped regex run against the live and freshly built HTML
plus injected-script variants (4 cases); the DOM selector driven in a real
browser on the real page, where the old one breaks and the new one holds; the
shipped marker helpers exercised through both outcomes and with
`sessionStorage` stubbed to throw (12 assertions, including that Refresh
still reloads when storage is blocked); `npm run build` + `check:routes` and
a Babel parse / unresolved-identifier / unused-import pass. **Not verified**:
the fix in Terra's own Chrome, which is the only place the original symptom
lives — worth her confirming the pill stops coming back.

**Builder contrast + library filter** — every lift row in the group and SPC web builders now carries a 2px warm border (`#dcc9bf`) instead of a 1px `stone-200` hairline, with full terracotta + a `#fdf6f2` fill for superset members. New `components/SupersetConnector.js` replaces the 10px grey "+" glyph between rows with a real 26px circle, and it does double duty: white circle + `add` icon when unlinked, filled terracotta + `link` icon **plus a vertical spine** when linked (tap to unlink). The spine needs negative `top`/`bottom` to overhang the connector's own box — sized flush to the gap it's entirely hidden behind the circle, which is how the first version shipped and looked like nothing.

**New shared `components/ExerciseLibrarySidebar.js`** — all three web builders (group, SPC, SPC templates) had their own near-identical copy of the library column; extracted so the new grouping toggle lives in one place (net −642/+174 lines across the three). Adds a **Muscle group / Movement** toggle, section headers as real bordered rows with an item count and an 18px Ionicons chevron (the old `▸` was ~10px and unreadable), and **every section collapsed by default**. Anything with no value for the active grouping lands in a trailing "no movement pattern" bucket rather than silently vanishing — `movement_pattern` is optional on the exercise form, so that was a real disappearing-exercise risk, not a hypothetical.

**Real bug caught only by actually clicking it**: the first "all collapsed by default" implementation used a `null` sentinel for "never touched" and derived collapsed-ness from it. First click on any header created a Set containing just that key — which **collapsed the one you clicked and expanded every other section**. Rewritten to track the *expanded* set instead, so "all closed" is just an empty Set and no seeding from a bucket list (which changes when the grouping toggle flips) is needed. Verified via the standard login-screen-mount technique.

**Archived exercises showed up as pickable parents** in `ExerciseFormModal`'s "Variation of" dropdown. `app/(coach)/exercises/index.js` deliberately loads with `includeArchived: true` so its own "Show archived" toggle has something to show, and hands that same unfiltered list to the modal as `allExercises` — `parentOptions` filtered on type and parent-less-ness but never `is_active`. Also added a pinned ✕ in the modal's top-right corner (a sibling of the `ScrollView`, not inside it, so it doesn't scroll away), per direct ask.

**Not visually verified**: anything inside a real builder against real data — same standing login limitation as everywhere else in this file. The sidebar, connector, row borders, modal ✕ and the archived-parent filter were all screenshot/DOM-verified in isolation, and `npx expo export -p web` is clean. The `vercel.json` rewrites specifically **cannot** be verified without a deploy — worth a real refresh on a deep URL as soon as this ships.

## First-run audit: 17 findings, 5 batches, all closed (2026-08-21)

An unbiased first-run walkthrough (brand-new member, then a coach checking a
client) produced 21 findings; 17 survived triage into a 5-batch plan. All are
now closed. **The audit and plan artifacts are the working documents** —
`~/.claude/projects/.../memory/first_run_audit_fix_plan.md` holds the live URLs
and per-item detail. What follows is only what stays useful afterwards.

**Batch 1 — auth email links.** Root cause was the Supabase email *templates*,
not the redirect allow-list: all three hardcoded `{{ .SiteURL }}/auth/confirm`
(a *Nutrition Tracker* route — 200 there, 404 on Kova) and never used
`{{ .ConfirmationURL }}`, so the app's `redirectTo` had never mattered for
email at all. Also why coach invites always landed on the old app. Fixed in
the dashboard; the management API 403s on `mailer_templates_*`.
**Sequencing trap:** templates before Site URL — flipping Site URL first moves
every auth email from a working page to a 404. **To test a redirect without
sending mail:** `GET /auth/v1/verify?token=bogus&type=recovery&redirect_to=<url>`
and read the `Location` header. `admin/generate_link` ignores `redirect_to`
entirely and `POST /auth/v1/recover` 200s for anything, so both are useless here.

**Batch 2 — de-gendered the coach copy.** Terra chose **drop the pronoun, not a
they/them swap** — that's the standing convention for any new coach-facing
string. `HERS ONLY` → `CUSTOM`, `hersOnly`/`hersOnlyCount` → `custom`/`customCount`.
Code comments were left alone (not user-facing).

**Scope user-facing copy with an AST pass, never grep** — grep over-reported by
more than half here (mostly code comments): `@babel/parser` + `@babel/traverse`,
visit `StringLiteral` / `JSXText` / `TemplateElement`, report
`p.node.loc.start.line`. Real count was **44 strings across 21 files**, not the
29/14 a grep-based estimate claimed. Reusable for any "find all copy matching X".

**Batch 3 — dynamic routes, and a build gate for them.** Three routes had no
`vercel.json` rewrite and 404'd on a fresh load or a refresh
(`/events/:eventId`, `/events/:eventId/responses`, `/spc/overview/:userId`);
the events one mattered most because event push notifications carry that exact
URL. **This bug class is silent by design** — client-side navigation never asks
the server, so a missing rewrite only breaks for someone following a link
straight in.

`scripts/check-vercel-rewrites.mjs` (`npm run check:routes`) walks a real
export for every dynamic route, builds the URL a member would actually request,
and fails with the exact rewrite line to paste; it also flags a rewrite whose
destination file no longer exists. It skips `(group)`-prefixed paths — those
are a file-layout artifact, not URLs. **It is wired into `"build"`**
(`expo export -p web && npm run check:routes`), which is what Vercel runs in
place of its own detected Expo command whenever a `build` script exists — so a
future dynamic route without a rewrite fails the deploy rather than shipping
broken. Mutation-tested in both directions; it passed on its first real deploy.
A failed build cannot take the site down: Vercel only points the domain at a
deployment that built.

**Don't call a Vercel deploy failed too early.** This one took several minutes
during which production kept serving the *previous* commit's bundle, which
reads exactly like a failure — I said so, and was wrong. Verify by re-checking.
The reliable probe: `curl -o /dev/null -w '%{http_code}'` against a dynamic
route, plus grepping the live entry bundle
(`curl <site>/<page>` → the `/_expo/static/js/web/entry-*.js` path) for a marker
string unique to the new commit.

**The gym-floor TV is a real `core.users` row** (`is_gym_display`, migration
0071, role `member`). It was showing on the Clients roster as a client called
"Gym Display", counting toward the unassigned tally, and sitting inside the
audience for every all-gym push. Filtered out of `listMembers()` and the
`"all"` branch of `_shared/announcementAudience.ts` — the other three audience
branches resolve through membership tables it isn't in. **Anything new that
enumerates members or push recipients needs the same filter.** Known and left
alone: CCrew's `listKovaUsers()` still offers it as a Kilo-attendance match.

**Batch 4 — `/register` and `/reset-password` are now one flow.** They had
drifted into 95% the same code and *the drift was the bug*: reset-password kept
picking up improvements register never got, so the screen a brand-new member
meets first was the worse of the two. `components/auth/CodeAuthFlow.js` is the
shared flow; the two screens are ~25 lines each, differing only in a `copy`
prop. 451 lines of duplication removed.
- **`request-registration-code` returns the same `{sent:true}` whether it
  texted a code, found no account, or refused inside its 45s cooldown** —
  deliberate, anti-enumeration. So a Resend inside that window would report
  success having done nothing; the button counts down instead, and is only
  pressable when it will actually act.
- The countdown tracks a **deadline** (`resendAt` + `Date.now()`), not a
  decrementing number: browsers throttle timers in a backgrounded tab, so a
  counter drifts behind real time. That's a *duration*, so plain `Date.now()`
  is correct and the `boiseDate` rules don't apply — commented in the file so a
  later pass doesn't "fix" it into `todayInBoise`.
- Both screens are reachable signed-out, so they can be **driven in a browser
  for real**. Use an address that matches no account (`…@example.invalid`,
  checked against `core.users` first) — the uniform response means nothing is
  sent and no real member is texted.

**Batch 5.** Announcement expiry (migration 0072, above; compose picker
defaults to **2 weeks**, counted from `send_at` not from now, `Never` still
available; `scan-announcements` skips expired rows). Clients page made usable
at phone width. Member Settings' two nutrition-only notification toggles are
gated on nutrition enrollment and the card hides when empty — **starts hidden
so it can't flash in and vanish, but a failed lookup shows it: a blip must
never hide a setting somebody genuinely has.** Showing a member their assigned
coach was declined, not built.

### Two things worth generalising from this pass

**A bare `flex-wrap` on a react-native-web row does nothing unless the row
itself can shrink.** RNW's `View` defaults to `flex-shrink: 0`, so a row of
buttons keeps its full intrinsic width, its own wrap never engages, and it runs
past the viewport — while `document.scrollWidth` stays put, so it can't even be
scrolled to. Bit twice in this pass (the nutrition header's "+ Enroll client",
then the Clients header) and both times the row *already had* `flex-wrap`, so
the obvious fix was not the fix. Add `flexShrink: 1` + `minWidth: 0`, and
**measure `getBoundingClientRect()` rather than eyeballing a screenshot** — the
overflow is invisible in one.

**An audit finding can be stale, and Terra questioning a premise is worth more
than the finding.** M-C3 claimed finishing a workout "empties the page". It
doesn't: `components/session/FinalizePlate.js` + `lib/finalizePlate.js` show a
full-screen plate with PRs, session volume and weekly progress, and a
"✓ No remaining sessions this week" card sits underneath. The audit had been
written against a reading of the screen that predated that handoff. Going and
reading the code turned a redesign question into a two-line bug fix: once the
last session is finalized nothing is `"ready"`, so `focus` resolves to null in
`plan.js` and SPC's empty-state lines rendered by default — a member finishing a
group workout got "Your SPC coach hasn't published this block yet" under her
done card. Now gated on `focus?.type === "spc" || groups.length === 0`.

## Registration: duplicate GHL contacts, and matching any email on one (2026-08-28)

"Has C.J. tried to sign in?" turned into a real failure mode. No migration —
the fix is `_shared/ghlContacts.ts` plus both registration functions
(deployed, `verify_jwt: false` preserved on each).

**Diagnosing "no code arrived", in order.** The tables answer most of it
before any GHL call:
- `auth.users.last_sign_in_at` null = never signed in, ever.
- A `core.registration_codes` row means the function ran, found the member,
  passed the cooldown, and reached the send. No row means it never got that
  far — almost always no `core.users` row or no `ghl_contact_id`, since
  `request-registration-code` returns a uniform `{sent:true}` for both.
- **`attempts = 0` is the tell**: the code was never submitted. A wrong code
  increments it. So zero means nothing arrived, not that she fumbled it.
- Compare against other recent requests. Two members registered fine hours
  before C.J., which ruled out the token, scopes, location id and the
  function in one query and made it contact-specific.

**The actual cause: a duplicate contact, which is NOT the merged-contact case
the self-heal was built for.** A 2026-08-22 webhook test (tagged `testhook`,
`conditioning form`) built her Kova account from a phone-less **lead** record
while her real member contact sat separately with her number. The heal only
fires on a deleted/merged id; here the stored id was alive and healthy and
simply had no phone, so nothing repaired and nothing complained.

**Why the duplicate was invisible in GHL's UI:** the two records were "C.J.
Smith" and "CJ Smith". GHL's contact search does not match across the
periods, so searching one name returns exactly one contact and the other is
nowhere. Liz Marsden was worse — "Liz Marsden" vs "Elizabeth Sharp-Marsden".
**Search by last name, or by both emails, before concluding there's only one.**

**The fix — read every address on the contact.** `resolveMemberByEmail`
(shared) tries Kova's own records first, then asks GHL which contact carries
the typed address on *any* email, primary or `additionalEmails` (where a
merge demotes the losing record's address). Two points worth keeping:
- **Both halves must use it.** `verify-registration-code` resolved by email
  independently, so an address that could request a code couldn't necessarily
  verify it — stranding someone one step further in than before. One function
  now, so they can't drift.
- **Ambiguity refuses.** Two contacts sharing an address returns null. The
  wrong pick texts a verification code to the wrong person's phone.

This also repairs the heal, which only ever compared the primary email — a
merge that promoted the other address left it finding nothing and giving up
silently, which is precisely what a merged contact looks like.

**Scanned all 37 never-signed-in members** with a GHL contact: only two had
no phone, both from that same test batch — Liz Marsden (fixed by merging)
and Terra's own test account. Both merges kept the id Kova already held, so
no data change was needed either time. Worth re-running that scan after any
future webhook test batch; the failure is silent until each person tries.

**Verification, honestly mixed.** The new lookup was smoke-tested in
production against a GHL contact belonging to no Kova member: ran clean,
uniform response, no code issued, no text sent. The **positive** path
(secondary email → real member → text) is unverified — neither Terra's nor
Dustin's contact has a second address to match on, and testing on C.J.
mid-signup was off the table. Add a secondary email to a staff contact to
prove it properly.

**Also found:** the GHL token has no *read* scope for conversations (401 on
`/conversations/search`). Sending is unaffected, but message threads and
delivery status can't be inspected from here — relevant next time the
question is "did the text actually go out?"

**Standing constraint that shaped the whole session:** never fire a real code
at a client to test. Terra's rule is Dustin's or her own account only, and
even then the code row is the evidence, not the text.

## A blank screen can be diagnosed now, and the first one it caught (2026-08-29)

A client's SPC session went blank on her phone and stayed blank. Every
server-side layer checked out — one row everywhere (no duplicates left by a
GHL repair the day before), a well-formed block, live schema matching the
deployed bundle, all six member SPC embeds returning 200, and RLS as her
showing all 6 exercises and 6 warm-ups. No member file differed from HEAD,
so she was running the same code as clients who were fine. **That
investigation cost most of a morning and could not have concluded anything,
because the app had no error boundary at all: an uncaught render error
painted a silent white screen with no message and nothing logged.**

**`components/AppErrorBoundary.js`** now sits inside `SafeAreaProvider` (so
the fallback still has the contexts it needs) but around `AuthProvider` (so
an auth-layer crash is caught too). It shows the screen path, the error, and
the innermost few component-stack frames with their bundler URLs stripped,
plus a reload button — something a member can screenshot. **The path is
there because the production bundle minifies most route components away**
(`MyFitness` and `MyWeek` both become single letters, checked against the
real production bundle), so the stack alone can't say which screen she was
on.

**`programming.client_errors`** (0100) is the same thing for the coach, who
is rarely standing next to whoever is stuck. Deliberately no in-app view —
Terra asks directly. Three of its columns were chosen from what that
morning's investigation actually needed: `user_agent` ("is it her phone?" is
the first question about any single-client report), `app_build` (a stale
cached bundle is a real recurring cause of a blank screen), and `platform`.
Reporting is best-effort and never awaited, so a reporting failure can't
compound the crash.

**It caught a real bug the same day, from a different client.** Ania
Krzywicki, Chrome 152 / Android 10, React error #185 ("Maximum update depth
exceeded") with `textarea` innermost, four times in a minute.

**The bug: `ExerciseCard`'s lift-notes field auto-grew by measuring itself.**
`onContentSizeChange` set `noteHeight`, and `noteHeight` set the box's
height. On web that can feed back, because the box is `overflow: hidden`
with an explicit height, so the measured content size is the height just set
rather than the text's own. **This is the third time this codebase has met
this hazard** — `CommentThread`'s `NoteField` says it outright ("an
auto-growing version was tried and feeds back on itself"), and `GamePlan`
was switched to native-only after watching a box walk 659 → 642 → 516.
`ExerciseCard` was the last member-facing field still doing it, on the
screen members are in every day. **The rule, now settled three times over:
auto-grow a multiline TextInput on native only; on web give it a fixed
height and let it scroll.** Never derive an element's height from a
measurement of that same element on web.

**Honest limit on the mechanism**: the first explanation written for this —
a 2px-per-pass runaway — was tested and is WRONG. Reproducing the pre-fix
field in isolation, react-native-web fires `onContentSizeChange` only on
mount and on typing (not continuously; there is no ResizeObserver in
`TextInput/index.js`), and it converged every time: 62 → height 64, stop;
nudged taller, 66 → height 68, stop, including through six keystrokes. **The
loop could not be reproduced here at all.** RNW re-fires only when the
measured value *differs* from the last (`newHeight !== dimensions.current
.height`), so something about her rendering — Android font scaling, device
pixel ratio, or how Chrome 152 rounds `scrollHeight` — makes each
measurement come back different and it never settles. That is inference, not
proof. The fix does not depend on it: on web the measurement no longer feeds
the height at all, so no variant of the loop can exist.

**Whether it was ALSO the original client's bug is unresolved, and an earlier
version of this note wrongly claimed it was.** Only Ania confirmed a fix. The
first client resumed logging at 08:43 Boise — twelve minutes after her coach
reported the blank screen, and well before any member-code fix existed (the
only deploy by then changed no member code at all) — then logged 15 sets
steadily through 09:24. So her screen cleared on its own, and **the most
likely explanation is the boring one: a new bundle hash replaced the stale
cached copy her home-screen PWA was holding.** She has zero crash reports,
though she was on an older bundle with no reporting for part of it.

The notes loop remains a plausible candidate for her too — on My Fitness
every lift starts expanded (`SessionLogger` seeds `expandedIds` with every
exercise in "session" layout), so a 6-lift SPC session paints six of these
notes boxes the instant it opens, six chances to trip with no interaction,
which matches "opens her session and it goes blank" exactly. But the timing
argues against it and nothing confirms it. **Two clients, two blank screens,
and only one of them has an established cause.**

**Deliberately left alone**: `HubClientColumn` writes to a ref off a
ScrollView, whose content size is genuinely independent of its own height;
`MilestoneFormModal` (coach) has a similar auto-grow but no `overflow:
hidden`, so it lacks what drives the loop, and nothing has been reported.
Worth fixing if either ever misbehaves.

**Worth remembering about the reporting itself**: a crash logged `screen: /`
while the member's screenshot said `/plan` — not a contradiction. Tabs keep
screens mounted, so a still-mounted My Fitness card kept re-measuring while
the URL read My Week. And a *missing* row is information too: if a bundle
fails to load at all, nothing in JS can catch it, so "reports blank, no row"
points at the device or a stale cached copy rather than the code.

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

- **`nutrition-reminders-scan` is broken and deliberately left broken — waiting on Terra's go-ahead (found 2026-08-27).** Its pg_cron job carries the 64-hex SHA-256 digest `supabase secrets list` prints instead of the real 8-char `CRON_SECRET`, so it has returned **401 Unauthorized on every run since it was registered** — the evening daily-log reminder and the Monday check-in nag have never once gone out. Same root cause as `announcement-scan`, which was fixed the same day (see "Popup and push become separate choices" for the diagnosis query and the SQL-only repair, which never puts a secret through a tool call). **This one was NOT fixed, on purpose**: repairing it immediately starts pushing real nutrition clients on a recurring schedule nobody has ever seen working, and the standing rule is never to message clients without permission — see [[feedback_never_text_clients_without_permission]]. It's a one-statement fix once she says yes. Old command captured at `~/kova-cron-fix-2026-08-27/rollback-commands.json` (outside the repo — it holds real secrets). **Before flipping it on**, worth confirming with her what would actually go out on the first run, since the function scans for clients who haven't logged today and could reach a lot of people at once.
- **`supabase/functions/send-push/index.ts`** — stale bullet, kept for history: it's actually deployed and live as of the "Coach push notifications (Phase 6)" section above, along with `scan-spc-alerts`. This line just never got updated when that happened.
- **Abandoned-session push reminder** (member starts logging a workout, doesn't tap Finalize within ~2 hours) is designed but not built — needs `session_completions.started_at`/`reminder_sent_at` columns, a new Edge Function to scan for them, and Supabase cron (`pg_cron`/`pg_net`, or the Dashboard's Cron Jobs UI) to invoke it on a schedule. Deferred by user request — ask before building.
- **`eas init`** — stale bullet, kept for history: it was already done by the time this was written (`app.json`'s `extra.eas.projectId`/`eas.json` already existed) — see the 2026-08-04 update in "Coach push notifications" above.
- **Apple Developer Program** — done as of 2026-08-04. Real APNs push credentials (`eas credentials`, needs Terra's own Apple ID login) and a fresh EAS build/TestFlight submit with the Push Notifications capability enabled are the remaining steps — see "Gym-wide announcements + real push notifications finally unblocked" above. Google Play Developer account still not set up.
- **iOS Universal Links configured (2026-08-04)** — see "iOS push confirmed live, Universal Links, GHL import groundwork" below for the full writeup. Android App Links (`assetlinks.json`) still not configured — needs the release keystore's SHA-256 fingerprint, only obtainable via an interactive `eas credentials -p android` session, and Google Play isn't set up yet anyway.
- **No simulator testing has happened** — everything verified via UI so far is the Expo web build, plus one physical-device run (see "Physical iOS device builds" below). The native `[workoutId].js` builder screen, native push, and the whole native auth deep-link flow are code-complete but visually unverified on-device beyond basic app launch.
- **Client onboarding via GHL + phone-OTP registration — the new-client half is fully built and verified as of 2026-08-04**, see "iOS push confirmed live, Universal Links, GHL import groundwork" above for the full writeup. Original design decisions, still standing:
  - Skip GHL-tag-driven auto-sync of program/frequency (2x Group, etc.) — decided not worth it: membership-type changes are infrequent enough that a coach's own toggle on the Clients page costs less than the ongoing risk of GLM tag names and this app's webhook parser drifting out of sync (a rename in GMS silently breaking or mis-setting someone's program). The two webhooks below (new client / cancellation) are still the plan.
  - **Won't be a plain SQL insert for either the "won" webhook or the planned bulk backfill of the existing ~140-200 members** — `auth.users` isn't writable via a normal `INSERT` (Supabase manages it internally: password hashing, required internal fields, triggers). Both need the Admin API (`auth.admin.createUser`, no email sent) — the webhook calls it one person at a time, the backfill is a one-time script that loops the same call over the existing member list. `core.users.id`'s FK to `auth.users.id` is *why* — a `core.users` row literally cannot exist without a real auth account behind it already.
  - **Registration verifies over phone/SMS via the GHL API, not email** — direct lesson from the standalone Nutrition Tracker app: email invites landed in spam and a real number of people never completed signup. **Correction from the original design**: Kova does *not* store a phone number at all — GoHighLevel's `/conversations/messages` send endpoint takes a `contactId`, not a raw phone number (confirmed against GHL's actual API), so `core.users.ghl_contact_id` (migration `0026`) is what gets stored instead. The rest of the flow: the "won" webhook silently creates the account (no email sent); member installs the app whenever, taps Register, types their email; backend looks up their `ghl_contact_id` and calls GHL's Conversations API to text a one-time code; member types the code in, sets a password. Still sidesteps the same original problem — a `https://app.kovastrength.com/set-password` email link can't do anything useful on a phone that doesn't have the app installed yet, which a code typed into the already-installed app avoids entirely.
  - **Built and verified end-to-end against the live project** (real GHL-fired webhook → real account → real SMS → real password → real sign-in, not just individually bundle-checked): `supabase/functions/import-client/index.ts` (the "won"/new-client webhook receiver — shared-secret header auth via `GHL_IMPORT_SECRET`, not JWT; create-or-find on `auth.users` same fallback pattern as `invite-staff`; upserts `core.users` with `ghl_contact_id`, preserving an existing role rather than downgrading it on re-import), `supabase/functions/request-registration-code/index.ts` (rate-limited to one live code per 45s per user, hashed + 10-minute expiry, uniform response regardless of whether the email/contact exists to avoid enumeration), `supabase/functions/verify-registration-code/index.ts` (attempt-limited to 5 tries, sets the password via the Admin API directly since there's no magic-link session to exchange here), migration `0026_ghl_import_and_registration.sql` (`ghl_contact_id` on `core.users`, `core.registration_codes` with zero RLS policies — every access goes through these two service-role Edge Functions, never a direct client query), and `app/(auth)/register.js` (email → code → password, linked from `login.js`).
  - **A real GHL Private Integration Token permissions gotcha, worth remembering**: the token needed a specific "send message" scope beyond the "Edit conversations"/"Edit conversation messages" scopes that looked like they should already cover it — GHL's own API returned a real `401 "The token is not authorized for this scope"` until that additional scope was added, diagnosed by curling GHL's API directly rather than guessing from the Edge Function's own deliberately-generic response.
  - **Still needed, none of it built**: a cancellation-tag webhook (archives — `core.users` has no archived/inactive concept yet either), and the one-time bulk-backfill script for the existing ~140-200 members (`import-client` could be called once per existing client, either via a GHL bulk workflow or a one-off script — the receiver itself needs no changes, it already handles being called for someone who already has an `auth.users` row from the standalone Nutrition Tracker app).

## Physical iOS device builds (USB via Xcode)

Done at least twice now from sessions that unusually had real Bash access to Dustin's actual Mac (not the normal sandboxed environment — see the "No DB credentials"/"No device/simulator access" notes below, which still hold for *typical* sessions, but apparently not every session — check for a connected device with `xcrun devicectl list devices` before assuming you don't have it). First time: got the app running on Dustin's iPhone (on the iOS 27 developer beta) via `npx expo run:ios --device` and Xcode. Worth knowing if this ever needs to happen again, either on this Mac or a new one:

- **iOS 27 beta needs Xcode 27 beta**, not the App Store's stable Xcode — download from `developer.apple.com/download/applications` (free Apple ID is enough) and install alongside stable Xcode as `/Applications/Xcode-beta.app` (don't overwrite the stable one). CLI builds need `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` exported so `xcodebuild`/`pod`/`xcrun` all target the beta toolchain instead of the default.
- **CocoaPods needs a real Ruby, not macOS's system Ruby** (2.6.10 here, ships with a `ffi`-native-extension version wall — no version of `ffi` newer than what's needed by current CocoaPods still supports Ruby < 3.0). Installed Homebrew, then `brew install cocoapods` — self-contained modern Ruby, doesn't touch the system one. Homebrew's own installer needs `sudo` (a real password prompt) — ask the user to run it themselves in Terminal; don't try to work around a partial/interrupted install with `git reset --hard` etc. inside `/opt/homebrew`, the harness's auto-mode classifier blocks destructive git ops outside the project directory anyway.
- **`pod install`/CocoaPods scripts need `LANG=en_US.UTF-8`/`LC_ALL=en_US.UTF-8` exported** — without it, CocoaPods' Ruby throws `Encoding::CompatibilityError` on `unicode_normalize` inside `pod install` itself.
- **A project path containing a space breaks multiple CocoaPods/RN build-phase scripts** — this repo lives at `/Users/Dustin/Claude Code/Programming` (space in `Claude Code`). Two real upstream bugs hit and fixed via `patch-package` (see `patches/expo-constants+57.0.6.patch`, reapplied automatically via the `postinstall` script): `node_modules/expo-constants/ios/EXConstants.podspec`'s script phase and `node_modules/expo-constants/scripts/get-app-config-ios.sh`'s `basename $PROJECT_DIR` both word-split on the space. A **third** instance of the same bug class lives in `ios/KovaStrength.xcodeproj/project.pbxproj` itself (the "Bundle React Native code and images" build phase's `` `"$NODE_BINARY" --print "..."` `` backtick invocation) — that one's *not* patch-package-able since it's inside the gitignored, prebuild-generated `ios/` folder. If `ios/` is ever regenerated (`expo prebuild --clean`, or deleting and rebuilding it), this exact fix needs reapplying: wrap the backtick expression in `\"..\"` so the resulting path stays one shell word. Search the pbxproj for `react-native-xcode.sh` to find it again.
- **iOS 27 beta hard-crashes any app without proper `UIScene` lifecycle adoption** (`EXC_BREAKPOINT`/`SIGTRAP` in `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke` — confirmed via a real device crash log pulled with `xcrun devicectl device copy from --domain-type systemCrashLogs`). This app's Expo-generated `AppDelegate.swift` used the legacy pattern (creates its own `UIWindow` directly in `didFinishLaunchingWithOptions`, no scene delegate at all) — this was almost certainly fine on stable iOS as of this writing, but iOS 27 beta enforces it as a hard crash, not a deprecation warning. Fixed with two layers, **only one of which is durable**:
  - **Durable** (in `app.json`, survives `expo prebuild`): `ios.infoPlist.UIApplicationSceneManifest` declares `UIApplicationSupportsMultipleScenes: false`.
  - **NOT durable** (hand-edited directly in the gitignored `ios/` folder, no Expo config plugin captures this): `ios/KovaStrength/SceneDelegate.swift` (new file — creates the `UIWindow` from the connecting `UIWindowScene` instead of `UIScreen.main.bounds`), `ios/KovaStrength/AppDelegate.swift` (window creation moved out of `didFinishLaunchingWithOptions` into the new scene delegate; added `application(_:configurationForConnecting:options:)`), `ios/KovaStrength/Info.plist`'s full `UISceneConfigurations` block (the `app.json` version above only sets `UIApplicationSupportsMultipleScenes` — the `UISceneConfigurationName`/`UISceneDelegateClassName` pointing at `SceneDelegate` only exists in the generated file directly), and the `project.pbxproj` registration of the new Swift file (`PBXBuildFile`/`PBXFileReference`/group/`PBXSourcesBuildPhase` entries — this project uses classic explicit file references, not Xcode's newer synchronized-folder groups, so new files never auto-attach). **If `ios/` is ever regenerated, this whole scene-delegate fix needs redoing** or the app will crash on launch on iOS 27+ again, even though `app.json` still looks correct. Worth turning into a real Expo config plugin (`withDangerousMod`/`withXcodeProject` from `@expo/config-plugins`) next time this comes up, so it survives prebuild like the Info.plist half already does.
- **Free/personal Apple ID signing teams don't support the Push Notifications capability** — had to remove it from Signing & Capabilities (Xcode GUI) for the personal-team automatic-signing build to produce a valid provisioning profile at all. Not an issue long-term since `send-push` isn't deployed yet anyway (see "Manual/deferred setup" below), but if push ever needs testing on a real device, that needs an actual paid Apple Developer Program membership.
- **A device only "trusts" a developer certificate until every app from that developer is removed from it** — deleting/reinstalling the app can silently reset this, surfacing as the exact same generic "invalid code signature, inadequate entitlements, or profile not explicitly trusted" launch error whether the real cause is (a) not trusted yet, (b) trust got reset by an app deletion, or (c) an actual signing/provisioning problem. Don't assume which one it is — check Settings → General → VPN & Device Management on the device.
- **Launch the app via Xcode's own Run button, not `xcrun devicectl device process launch` / `expo run:ios`'s CLI launch path**, at least for the very first run. Xcode's own launch sets up USB port-forwarding so the device's `localhost:8081` reaches the Mac's Metro bundler; launching via `devicectl` directly bypasses that, and the app fails with "No script URL provided... unsanitizedScriptURLString=(null)" trying to reach a Metro that's unreachable from the device's perspective.
- **Real crash logs are pullable without Xcode's GUI** via `xcrun devicectl device info files --device <udid> --domain-type systemCrashLogs --search <AppName>` to list them, then `xcrun devicectl device copy from --device <udid> --domain-type systemCrashLogs --source "<Name>.ips" --destination /tmp/crash.ips` to pull one. The `.ips` file is JSON (two concatenated JSON objects, header then body) — `python3 -c "import json; ..."` parses it cleanly; the crashing thread's symbolicated frames are usually enough to diagnose without needing a `.dSYM`/full symbolication pass. Note this only surfaces hard OS-level crashes (`EXC_BREAKPOINT`, `SIGABRT`, etc.) — a plain JS exception (e.g. "Cannot find native module X") shows as a red-screen/error-boundary error on-device and never produces an `.ips` file at all, so an empty or stale crash-log search doesn't mean nothing's wrong.
- **Adding a native (non-JS-only) dependency to `package.json` does NOT automatically reach an already-generated `ios/` folder.** Hit this for real 2026-08-02: `expo-image-picker`/`expo-image-manipulator`/`react-native-svg` were added to `package.json` during the nutrition rebuild, but nobody re-ran `pod install`, so `ios/Podfile.lock` stayed a day stale and didn't know those pods existed — every subsequent Xcode "Run" rebuilt the *same* binary still missing them, throwing a JS-catchable "Cannot find native module 'ExponentImagePicker'" the instant the photo picker (or `react-native-svg`, i.e. Trends) was used. Symptom looked exactly like a fresh-install-still-broken bug but wasn't — it was a stale `Pods/`. Fix: `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`, then rebuild. **Separately**, `expo-image-picker`'s `app.json` plugin config (the `photosPermission`/`cameraPermission` strings) only gets written into `Info.plist` by a real `expo prebuild` run — since this project's `ios/Info.plist` is hand-maintained (see the scene-delegate note above, prebuild would wipe those fixes), those two keys (`NSPhotoLibraryUsageDescription`/`NSCameraUsageDescription`) had to be added by hand too, or the app would hard-crash (this one *would* produce a real `.ips`) the instant camera/photo-library access was actually requested, even after `pod install` fixed the linking. **Whenever a new native dependency is added going forward: `pod install` in `ios/`, and check whether its Expo config plugin writes anything to `Info.plist`/entitlements that needs hand-porting into the gitignored `ios/` folder** — same class of "not durable, doesn't survive without `expo prebuild`" issue as the scene-delegate fix.
- **Both Xcode installs plus simulator runtimes plus repeated `DerivedData` builds filled the disk to `ENOSPC` twice this session** — once so completely that even the harness's own Bash-output-capture file couldn't be written (every command failed, including `df -h`). Safe things to clear if this happens again: any leftover installer `.xip` in Downloads (already-extracted, multi-GB), `~/Library/Developer/Xcode/DerivedData` (fully regeneratable), and in Xcode's own Settings → Platforms / About This Mac → Storage → Developer panel — old **bridgeOS device-support entries for iOS builds the device is no longer on** (each is 10GB+; check the device's *current* build number first and keep only that one).

- **2026-09-08 run, on Terra's iPhone 16 Pro Max (iOS 27.0, build 24A5390f).** Everything above still held (Xcode-beta for iOS 27, `DEVELOPER_DIR`, `LANG`/`LC_ALL` for pods, SceneDelegate fix intact). Pods were already current — no native dep has been added since Aug 2, so `pod install` was a no-op re-run. New findings:
  - **`xcodebuild` fails with `error: No Accounts: Add a new account in Accounts settings.` when Xcode has no Apple ID signed in, and `-allowProvisioningUpdates` CANNOT work around it.** The tell is zero files in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`. Only the user can fix it (Xcode → Settings → Accounts → **+**), since it needs their password and 2FA — hand it over rather than trying to script around it. Note `defaults read com.apple.dt.Xcode IDEProvisioningTeams` stayed absent even *after* a successful sign-in, so its absence proves nothing; check for a generated `.mobileprovision` instead.
  - **The local Xcode project builds `com.kovastrength.app` while `app.json`/EAS build `com.kovastrength.mobile`.** Different bundle IDs, so a local dev build installs **alongside** the TestFlight app instead of replacing it — confirmed live, `devicectl device info apps` listed both. This is a feature, not a bug to fix: her working TestFlight copy stays intact. The cost is that Universal Links don't work in the dev build, since the AASA file lists `.mobile`.
  - **Xcode issued a 7-day LOCAL fallback profile, not a portal-issued one**: `LocalProvision => true`, `TimeToLive => 7`, expiring 8 days out — despite the paid team `CDY5M385LV` and an `Apple Development` cert (`OU=CDY5M385LV`) valid to Aug 2027. **Cause not established.** Guessed it was a pending Program License Agreement and was wrong (see the next bullet). It means a rebuild roughly weekly; check Xcode → Settings → Accounts if it ever matters.
  - **NEVER click "Perform Changes" on Xcode's "Update to recommended settings" dialog.** It is a *build settings* nag, unrelated to the developer account. It bundles **`ENABLE_USER_SCRIPT_SANDBOXING`**, which breaks RN/Expo builds outright (their script phases read and write across `node_modules`, and this repo's space-in-path problem makes it worse), and **"Use Recommended iOS Deployment Target"**, which raises the minimum out from under Expo's own config. It also bulk-rewrites `project.pbxproj`, which holds the hand-maintained SceneDelegate and space-in-path fixes that do not regenerate. Cancel it; it is a suggestion, not an error.
  - **A failed launch is not a failed build.** `expo run:ios` exits 1 with `FBSOpenApplicationErrorDomain error 3` ("invalid code signature, inadequate entitlements or its profile has not been explicitly trusted") *after* a successful compile and install. Check `xcrun devicectl device info apps --device <udid>` before assuming the build broke; the fix is the user trusting the profile on the phone (Settings → General → VPN & Device Management).

## The dev server as a PWA on a phone (2026-09-08)

Terra asked to install the **local** dev server as a PWA, alongside the dev build. It needs no code changes at all: `app/+html.js` runs on the dev server too, not only during `expo export`, so `http://<host>:8081` already serves the full PWA head (`apple-mobile-web-app-capable`, `manifest`, `apple-touch-icon`), and `/manifest.json`, `/apple-touch-icon.png` and `/sw.js` all return 200 out of `public/`. Add to Home Screen therefore gives a real standalone icon, not a bookmark.

- **Use the Bonjour name, never the IP** — `http://MacBook-Pro.local:8081` (`scutil --get LocalHostName`). iOS resolves `.local` natively and Safari needs no Local Network permission prompt, so the URL survives DHCP changes and the saved home-screen icon can't break. The one weakness is a second Mac with the same default name joining the network, which forces macOS to rename one to `-2`; renaming the Mac to something distinctive closes it. Their gym already relies on this working (`kova-display.local`).
- **Safari only.** Chrome on iOS will not install it standalone.
- **It is a separate origin from `app.kovastrength.com`**, so separate storage and a separate login — which is also why it cannot disturb her real PWA.
- **Web push does NOT work there.** Service workers need a secure context and this is plain HTTP on a LAN name. `getWebPushStatus()` degrades cleanly to `"unsupported"`/`"ios-needs-install"` rather than throwing, so nothing breaks — it just can't be tested from the local PWA.
- **`expo start --tunnel` would give HTTPS (and so service workers), but Terra reports it does not work on the iOS 27 beta** — she had already tried before asking, so don't suggest it as the fix.
- **Don't set a manual static IP in macOS** to stabilise the URL. The router is Google Wifi/Nest (`192.168.86.1`, `192.168.86.0/24`) handing out a pool that includes the Mac's current `.24`, so a hand-set address can collide with another device later. A DHCP reservation in the Google Home app is the safe version — and the `.local` name makes even that unnecessary.

## Test accounts (real accounts in the live shared Supabase project, not mocks)

- **Admin**: `terra@kovastrength.com` — bootstraps automatically on first login via `EXPO_PUBLIC_ADMIN_EMAIL`.
- **Member**: `dustin@kovastrength.com` — same account Nutrition Tracker uses as its test client (shared `auth.users`, confirmed by a real "Invalid login credentials" response before he was linked here). Linked to a `core.users` profile via the admin-only "Link account" flow (`app/(coach)/clients/LinkMemberModal.js`) since there's no self-serve signup and the email-invite Edge Function isn't deployed yet — this manual-UUID-paste bridge is intentional interim scaffolding, described in the code comments in `lib/programming/clients.js`. Assigned to Flagship.
- Two test Flagship blocks exist in the live DB as of this writing (one starting 2026-07-21, one starting 2026-07-20) — both have Week 1 / Session 1 published with the same three exercises (Barbell Bench Press, Goblet Squat, Seated Cable Row) for manual testing. Real coach usage will eventually want these cleaned up; not urgent.
- Dustin's account now also has real `session_completions`/per-set `logs` test data from verifying the workout-logging rework above (a finalized group session and a finalized SPC session, both with per-set weights and a lift note) — useful for exercising History/Finalize/View-Block without needing to log fresh data first. His group-program assignment and block dates were being actively edited by the coach in a parallel session while this was built, so don't assume the specific program/dates mentioned elsewhere in this file are still current — check live.
- **Nutrition QA accounts** (dedicated synthetic accounts, kept separate from Terra's/Dustin's real accounts so repeated automated testing never touches them): `test1@kovastrength.com` (`role: member`) and `test2@kovastrength.com` (`role: coach`) — role was set directly via SQL (`update core.users set role = 'coach' where email = ...`) since the app's own "+ Link account" flow always creates `role: member` and has no coach-creation path (`linkMemberByAuthId` in `lib/programming/clients.js` hardcodes it). **Stale as of the 2026-08-02 nutrition rebuild**: test1's seeded target/daily-log/check-in data below lives in the now-dead placeholder `nutrition.*` schema, not `public.*` — it won't show up anywhere in the rebuilt nutrition module. Test2 got a real `public.coaches` row via the 0018 backfill migration (role was already `coach` in `core.users` when that ran), so test2 itself is fine to use as a nutrition coach; test1 needs a fresh `public.clients` row (via the normal Nutrition-toggle-on flow) before it has anything real to test with. Original seed, for reference: Test1 was assigned to nutrition, had an active target (P150/C140/F50/Fiber25, effective 2026-07-21), a finalized daily log, and a submitted+finalized weekly check-in — full core-loop verification was run against these two accounts against the old schema.

## Web build is installable as a PWA (2026-08-04)

Prompted by Terra realizing clients like Roxy (see the check-in-reopen investigation above — Roxy turned out to have no `core.users` row, i.e. never linked into Kova at all) don't need to wait on App Store review to start using Kova — the already-live web build works today. It just wasn't set up to install cleanly: no manifest, no iOS meta tags, so "Add to Home Screen" would have produced a plain bookmark that opens in Safari chrome, not a real standalone app icon.

Added `app/+html.js` — Expo Router's static-export root-document override (only runs in Node during `expo export`, confirmed via `docs.expo.dev/router/web/static-rendering` since this SDK's docs can genuinely differ from memory, per this repo's own standing "Expo HAS CHANGED" rule) — with a `<link rel="manifest">`, `apple-touch-icon`, `theme-color`, and the `apple-mobile-web-app-*` meta tags iOS Safari specifically needs to launch without its address bar once added to the home screen (manifest.json's `display: "standalone"` alone isn't enough on iOS). `public/manifest.json` + `public/icon-192.png`/`icon-512.png`/`apple-touch-icon.png` (derived from the existing `assets/icon.png`, same source used for every other platform's icon) live in `public/`, the same static-passthrough directory the Universal Links `.well-known` file already uses.

Verified for real, not just bundle-checked: ran a real `npx expo export -p web` and confirmed the manifest link/icons/meta tags all land in the generated `dist/index.html`, served the export locally, and screenshotted the login screen rendering normally (no regression from the new root document).

## Backend audit: 12 findings closed (2026-08-21)

A full read-only audit of the Supabase project (schema, RLS, functions,
orchestration) cross-referenced against all four local repos, followed by an
approved fix pass. Full report:
https://claude.ai/code/artifact/365e64ad-d60e-4084-a5f9-d788e3e506c0 —
rollback SQL and evidence for every change are in `~/kova-audit-2026-08-21/`
(see its README for what each file undoes; the 107 storage files and 3 auth
accounts are the two changes that cannot be undone).

**The estate is in better shape than "grown organically" implies**, and this
is worth knowing before anyone plans a big cleanup: all 85 tables have RLS
enabled, there are **zero** blanket-`true` policies, none granted to `anon`,
every `SECURITY DEFINER` function pins `search_path`, and there are **zero
broken table references** in any repo. The identity layer — the risky part,
with three apps sharing one `auth.users` — has no orphans in either
direction. Naming is already consistent across all 688 columns.

**Fixed this pass** — `logs` duplicates (see 0073); a $247,132 approved pay
request that should have read $2,471.32 (only `approved_amount` was wrong;
`amount_requested` and the pay entry both already read correctly, so no money
moved); 1,140 `pay_entries` backfilled from `staff_email` to a real
`user_id`; `import-client`'s silent-500 collision path; five RLS policies
that anon could read; rate snapshots for all 22 closed periods; settings-key
drift; three junk auth accounts; three redundant indexes; a size/MIME cap on
the public `graphics` bucket; and 107 orphaned progress-photo files.

**Things worth carrying forward:**

- **`import-client` no longer 500s on a `ghl_contact_id` collision.** It lands
  a usable profile without the contact id and returns **200 with a warning
  payload**, because GHL's webhook action surfaces nothing on a non-2xx — a
  500 there is invisible, and used to leave an `auth.users` row with no
  `core.users` row, which is unregisterable and invisible on every screen.
  There is still **no import log or retry** (audit F8); Safety Fair's
  `public.entries` already does this properly (`ghl_sync_status`,
  `ghl_sync_error`, unique `dedupe_key`, a retry endpoint) and is the thing
  to copy rather than redesign.
- **Anon could read every announcement.** Four event/announcement policies
  plus `core.settings`' messaging keys gated on content state (`send_at <=
  now()`) with no caller check, and `to public` includes `anon`. Confirmed
  with a real unauthenticated request before fixing. **Standing rule: an RLS
  policy gates on the caller first, content state second.**
- **Closed pay periods now freeze their rates.** 21 of the 22 closed periods
  had no `closed_period_rate_snapshots` row (they were closed by SQL during
  the Glide import), so the report repriced them live at today's rates.
  Snapshots are now in place. `owner_pay`/`staff_pay` were deliberately left
  null — writing them would mean reimplementing the pay formula in SQL, and
  the report already recomputes from entries, now against frozen rates.
- **`payroll.finalizations` is still empty** — the submit → approve →
  send-back → close flow has never run on real data. **Terra's call on
  2026-08-21: she is walking it on the next real payroll run and will follow
  up if anything breaks.** So this is scheduled, not outstanding — don't
  treat it as an open action item, and don't fabricate test finalizations to
  exercise it. If she does report a problem, the things most worth checking
  first are the ones with no live coverage at all: whether a sent-back coach
  actually regains write access to their entries (`sendBackFinalization`
  writes `reopened_at` as well as `sent_back_at` precisely because
  `pay_entries`' four write policies gate on the finalized/reopened
  comparison alone), and whether closing a period with an undecided custom
  request is still correctly blocked.
- **Half of payroll history was keyed on an email string**, not a user. Now
  backfilled except 41 rows for **Kelsie Neidner**, a departed coach with no
  account of any kind — `core.users` has no inactive/archived state, so
  representing her would mean an *active* staff account. The `user_id ??
  staff_email` fallback in the admin report must stay for her alone.
- **`core.settings` is a shared bag** — one owner per key, whitelist your own
  keys, never render or write it wholesale. Three superseded block-length
  keys were renamed `zz_deprecated_*`; the key the UI actually reads
  (`default_block_length_weeks`) had no row at all and now does.
- **Storage deletes need the Storage API.** `supabase storage rm` reports
  success and deletes nothing, and direct deletes from `storage.objects` raise
  `42501` from a protection trigger. A `service_role` key **is** reachable via
  `supabase projects api-keys`, so a batch `DELETE /storage/v1/object/<bucket>`
  with a `{"prefixes":[...]}` body works — that is how the 107 orphans went.
- **Still open** (updated 2026-08-21 — see the follow-up section below):
  F8 and F13 are both closed; F14 (TrueCoach retention) was decided as
  keep-for-now; the "~12 hot unindexed FKs" turned out to be a
  leading-column artifact and needs no action. Nine orphaned photo files
  remain by choice: five are real images with no duplicate, four are junk.

## Backend audit follow-up: GHL import log, and a real Data API outage (2026-08-21)

Second pass over the audit's remaining findings — see the section above for
the first twelve. Rollback SQL and evidence stay in `~/kova-audit-2026-08-21/`.

**F8 closed — `core.ghl_import_log` + a retry (migration `0074`, run).**
`import-client` was fire-and-forget from GHL's side: GHL's webhook action
surfaces nothing on a non-2xx, so a failed import was only discoverable by
noticing, later, that someone was missing from the Clients list. With 140-200
clients still to migrate through that path, that is not a detection mechanism.
Shape lifted from the sibling Safety Fair repo's `public.entries`, adapted for
the opposite direction — **Safety Fair pushes to GHL and retries by
re-pushing; Kova receives from GHL and can only retry by replaying the payload
it was sent**, which is why the row stores `payload` and why that is the point
of the table rather than an audit nicety.

- **One row per person, not per delivery.** `dedupe_key` is the email (the
  identity `import-client` actually resolves on — `createUser` is by email and
  `core.users.id` comes from the auth row), or `payload:<sha-256>` when the
  webhook carried no email at all. GHL has been observed firing the same
  contact twelve times; that now leaves `attempts = 12`, not twelve rows.
- `core.record_ghl_import(...)` does the upsert-with-increment in one
  statement. `attempts + 1` cannot be expressed through supabase-js's
  `.upsert()`, and a read-then-write from the Edge Function would race those
  concurrent webhooks.
- **Admin-read only, deliberately narrower than `core.is_staff()`**: `payload`
  is GHL's raw contact body (phone, address) and RLS cannot scope a policy to
  a subset of columns. The client lib never selects it; only the retry
  function does, under the service role.
- The import moved to `_shared/ghlImport.ts` so `retry-ghl-import` runs the
  **same** code path the webhook does — a retry with its own implementation
  would prove nothing about the path GHL actually takes.
- **A wrong shared secret is deliberately not logged** — it is not an import
  attempt, and logging it would let anyone who can reach the URL grow the
  table at will.
- UI is `components/GhlImportIssuesCard.js` on the Clients page, admin-only,
  rendering nothing when nothing is wrong. **It cannot be a per-row action on
  the roster**, which is the obvious place to look for it: a failed import
  means the person is not on the roster at all. That invisibility is the whole
  problem.

**The big lesson — PostgREST fails its ENTIRE schema-cache build if any schema
listed in Exposed schemas is missing.** It does not skip the missing one. Every
request, on every schema, answers `503 PGRST002 "Could not query the database
for the schema cache"`. Renaming the dead `nutrition` schema on its own took
`public`, `core`, `programming` and `payroll` down together for ~45 seconds;
`alter schema nutrition_deprecated rename to nutrition;` brought them back on
the first poll, with all five confirmed 200 again. **Never rename or drop a
schema that is in the exposed-schemas config without removing it from that
config first.**

**F13 closed, by renaming the TABLES instead of the schema (migration `0075`,
run).** That sidesteps the whole problem: the schema keeps existing so
PostgREST stays happy, while `nutrition.daily_logs` and its five siblings are
now `zz_deprecated_*` — so anything still reaching for a dead name breaks
loudly with a scoped `PGRST205` on that table alone, and it reverts in six
statements. Confirmed live: the old name 404s with a helpful hint, all five
schemas still answer 200, and all 12 policies / 7 FKs / 10 rows survived the
rename untouched. **It also means the exposed-schemas entry never has to be
touched at all** — when these are dropped after 30 quiet days, an empty
`nutrition` schema is a perfectly good end state. Worth remembering as the
general move: *renaming the tables gets you everything the schema rename was
for, with none of the blast radius.*

The exported `nutrition` schema handle in `lib/supabase/client.js` is gone too.
Verified against the live database rather than the note — 10 rows across all
six tables, every FK crossing **out** into `core.users` so nothing depends on
it, zero functions or views referencing `nutrition.`, and exactly one reference
in any repo (that export, which nothing imported).

For the record, the exposed-schemas setting is genuinely hard to find in the
current dashboard and the Supabase CLI has no command for it (`supabase
projects` covers list/create/api-keys only); reading or changing it needs the
Management API's `/v1/projects/{ref}/postgrest` endpoint and a personal access
token, which the CLI keeps in the macOS keychain rather than on disk. Not
needed for anything above.

**"~12 hot unindexed FKs" was largely a leading-column artifact — no action
taken.** `programming.logs` already has `logs_user_exercise_idx (user_id,
exercise_id, date_performed DESC)`, and every app query on `logs` filters by
user as well as exercise, so the hot per-lift path is served (measured: index
scan, 2.9ms). The genuinely unindexed FKs sit on tables of a few hundred rows
where the scan measures ~7ms end to end, most of it round-trip. Indexing them
would add write cost for no measurable read gain. **A FK flagged as
"unindexed" by a leading-column check may well be covered by a composite —
check the real query shape and EXPLAIN it before adding an index.**

**F14 (TrueCoach retention) — decided, nothing built.** It was a policy call
rather than a migration. Current numbers: 12,550 imports / 117,764 sets, ~30 MB of a 57 MB
database; 134 people in the corpus, **108 with no Kova account yet**; 26 have
accounts and only **3 have ever linked anything** (17 lifts). Two facts that
reframe it: the 108 are largely people whose GHL migration has not happened yet
rather than people who declined, and **pruning is fully reversible** — the
source corpus (143 files, 9.1 MB) is intact in dustin@kovastrength.com's Drive
under `TrueCoach/`, and `scripts/truecoach_import.py` re-imports idempotently
(uuid5 ids). At 30 MB there is no cost pressure, so the useful decision is a
*trigger*, not a date — and **Terra's call on 2026-08-21 was keep it all for
now and revisit once the GHL migration is finished**, when it is actually
clear who is not coming. Nothing to build; don't prune this without asking
again.

Also cleaned: one `public.clients.phone` held a valid 10-digit number wrapped
in two invisible Unicode directional-isolate characters (pasted from a contact
card), which would defeat any exact match or search. Stripped; rollback in
`f20_phone_bidi_rollback.sql`. The remaining phone-format variance (4 shapes
across 25 rows) is left alone — it is display-only here, and normalising a
shared `public.*` column could surprise the standalone Nutrition Tracker app.

**Nothing from the audit remains open.** All fourteen findings are closed,
decided, or shown not to be findings. The one live task left anywhere in it is
the payroll finalize → approve → send-back → close walkthrough, which Terra
scheduled for the next real payroll run — see the note in the section above
before poking at it.
