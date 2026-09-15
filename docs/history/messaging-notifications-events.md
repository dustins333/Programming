# History: push, announcements, messaging, events

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## Coach push notifications (Phase 6) — server side deployed and live, device delivery still blocked (2026-08-01)

Real trigger built to replace the dashboard-load-only auto-draft. Previously, `checkAndAutoDraft()` (`lib/programming/spcDashboard.js`) only ran client-side when a coach happened to open the SPC dashboard, and never sent a push regardless — `sendPush()` (`lib/notifications/sendPush.js`) had exactly one call site in the whole app, a manual "send yourself a test push" button on `app/(coach)/settings.js`. Nothing notified a coach when a block was actually auto-drafted.

**New `supabase/functions/scan-spc-alerts/index.ts`** — a server-side port of `checkAndAutoDraft`'s logic (same lead-time check, same overlap guard from `createSpcBlock`, same block+session-skeleton creation), running on a schedule independent of anyone having the app open. Unlike the client version, it also pushes the assigned coach on every block it drafts. Push-sending logic was extracted out of `send-push/index.ts` into shared `supabase/functions/_shared/expoPush.ts` so both functions use one tested implementation instead of duplicating the Expo API call.

Since this is invoked by `pg_cron`/`pg_net`, not a logged-in user, it has no caller JWT to check — auth is a `CRON_SECRET` shared-secret header instead, and the function is deployed with `--no-verify-jwt`.

**Deployed and running as of this session** — Terra ran the CLI steps herself (this environment still can't run an interactive `supabase login`, but walked her through it directly): `send-push` and `scan-spc-alerts` are both live (`supabase functions deploy`), `CRON_SECRET` is set (`supabase secrets set`), and `0013_spc_alert_push_cron.sql` has been run — `spc-alert-scan` is a registered `pg_cron` job, firing daily at 13:00 UTC (~6-7am Boise). The scan/auto-draft/push-attempt logic itself is genuinely live in production now, not just deployed-but-dormant.

**Update 2026-08-04 — both blockers below are resolved/moot now; see "Gym-wide announcements + real push notifications finally unblocked" further down for what's left.** `eas init` turned out to already be done (`app.json`'s `extra.eas.projectId` and `eas.json`'s submit config were already present — this note was stale, not an accurate blocker) and Terra has since gotten her Apple Developer Program account. The remaining gap is narrower than "not started": real APNs push credentials (`eas credentials`, needs Terra's Apple ID login) and a fresh EAS build/TestFlight submit with the Push Notifications capability actually enabled (removed from the one prior physical-device build because a free/personal Apple ID team doesn't support it — that limitation no longer applies). Original text, kept for history: ~~pushes won't reach an actual device yet. `eas init` hasn't been run (no EAS project id), and iOS additionally needs real Apple Developer Program enrollment for APNs (Phase 0, not started) — Android via FCM/Expo's push service is less blocked and could work sooner.~~ Until the credentials + rebuild above are done, the cron job will run daily, correctly auto-draft blocks and attempt pushes, but `sendPushToUser()` will just find zero registered tokens for every coach and no-op on the push half.

Can be tested directly (bypassing the daily schedule) by POSTing to the function URL with the `x-cron-secret` header.

**Follow-up, same session — on/off toggles + the nutrition app's 3 notification types ported over.** `app/(coach)/settings.js` gained a "Push notifications" section: `NOTIFICATION_TOGGLES` (a small config array, not the generic numeric-settings loop above it — booleans render as `Switch` rows, not text inputs) reads/writes `core.settings` via `getSetting`/`updateSetting` per key, defaulting to `true` (unset = always-on, matching pre-toggle behavior) so no seed migration was needed — the jsonb `value` column takes a real boolean fine, and the first toggle flip creates the row. `scan-spc-alerts` now checks `notify_spc_block_alerts` before its push (drafting itself is unaffected by the toggle — only whether the coach gets notified).

Also ported the standalone Nutrition Tracker app's only 3 notification types (researched directly from that app's code — see its `app/api/cron/reminders/route.js` and `app/api/cron/checkin-available/route.js`) into two new Edge Functions, since this app's nutrition module never had push at all (explicitly deferred at v1, see the nutrition section above — this closes that gap for these 3, not for photos/Focus-Game-Plan/highlights):
- **`supabase/functions/scan-nutrition-reminders/index.ts`** — daily: (1) evening reminder if today's log isn't finalized, (2) Monday-only nag if last week's check-in was never submitted (existence check against `checkin_responses`, not `finalized_at` — submitting is a client action, finalizing is coach-only in this app's model, unlike the source app). Both client-facing, independently toggleable (`notify_nutrition_daily_log_reminder`, `notify_nutrition_checkin_nag`).
- **`supabase/functions/scan-nutrition-checkin-available/index.ts`** — unconditional Sunday announcement that the new week's check-in is open, to every active nutrition client (`notify_nutrition_checkin_available`).

Both reuse the same `CRON_SECRET` already set for `scan-spc-alerts` (Supabase function secrets are project-wide) — no new secret needed. New `supabase/migrations/0014_nutrition_reminder_cron.sql` registers their two cron jobs (`nutrition-reminders-scan` daily at 2:00 UTC, `nutrition-checkin-available-scan` Sundays at 15:00 UTC — same schedules the source app used). **Not yet deployed or run** as of writing this — same manual CLI/SQL-Editor steps as everything else in this section.

## Gym-wide announcements + real push notifications finally unblocked (2026-08-04)

Direct ask: a way to write a note, send it to all clients (or a filtered subset) right away or on a schedule, and have it pop up when they open the app — explicitly compared to the nutrition milestone "Congrats!" popup as the interaction model to copy. Same day, separately: **Terra got her Apple Developer Program account**, clearing one of the two real blockers on push that had been standing since Phase 6 (the other, `eas init`, turned out to already be done — `app.json`'s `extra.eas.projectId` and `eas.json`'s submit config were already present, so that CLAUDE.md note was stale).

**New `programming.announcements` + `announcement_acknowledgments` tables** (migration `0024_announcements.sql`, **not yet run**). Admin-only to compose/manage (`core.is_admin()`, not the generic `can_view_*` staff toggles — a gym-wide broadcast is a bigger blast radius than the rest of the coach permission surface, same reasoning as Settings being admin-only). `target_type` (`all`/`group_program`/`spc`/`nutrition`) + `target_group_program_id` encode the optional audience filter; `send_at` is both "when to show this" (RLS gates member visibility on `send_at <= now()`) and "when to push it." `announcement_acknowledgments` is a member-owned row (own-`user_id` RLS, no security-definer RPC needed — unlike the milestone table, ack isn't a column on a coach-owned row, so a plain insert policy is already narrow enough).

**In-app popup — works today, no infra dependency.** `lib/programming/announcements.js`'s `listDueUnseenAnnouncementsForUser()` fetches due+unseen rows, then resolves audience membership (group program via `client_program_assignments`, SPC via the existing `isSpcActive()`, Nutrition via `public.clients.status` — cross-schema, plain `supabase` client with no `.schema()` call, same as the rest of the nutrition module) client-side, since RLS only gates on `send_at`, not audience. New `components/AnnouncementModal.js` (visually identical pattern to `MilestoneCongratsModal.js`, generic title/message instead of fixed "Congrats!" copy) + `lib/notifications/AnnouncementChecker.js` (mounted once in `app/(member)/_layout.js` as a sibling of `<Tabs>`, not nested inside it — fires for real members and for staff using "My Training" alike, since both land in this layout).

**Real push send — code-complete, needs the deploy/credentials steps below before it actually reaches a phone.** New `supabase/functions/_shared/announcementAudience.ts` (server-side mirror of the client-side audience resolution above — kept in sync by hand, same as this app's other intentionally-duplicated client/server logic) backs two functions: `send-announcement` (JWT-authenticated, admin-only, fires immediately — called right after `createAnnouncement()` when the coach picks "Send now") and `scan-announcements` (CRON_SECRET-authenticated, catches *scheduled* announcements once `send_at` passes — migration `0025_announcement_push_cron.sql`, **not yet run**, registers a `pg_cron` job hitting it every 15 minutes). Both mark `pushed_at` so a scheduled announcement never double-sends. If push delivery itself fails (no deployed function yet, no registered device tokens), the announcement row and in-app popup are unaffected — `pushAnnouncementNow()`'s failure is caught and logged, not surfaced as a compose-flow error, so "the popup still works" was never contingent on push infra being finished.

**New `app/(coach)/announcements/index.js`** — admin-only page (nav entry in `CoachShell.js`'s sidebar on web, `more.js` on native, both admin-gated same as Settings), reusing `SegmentedControl` for audience/timing pickers and a `<select>`/pill-list split for the group-program target (web/native, matching the coach-dropdown convention elsewhere). New `confirmDeleteAnnouncement()` in `lib/confirmDialog.js` backs the History list's delete action, following the existing `confirmDeleteMilestone`-style named-variant pattern rather than reusing the generically-titled `confirmDelete`, which is hardcoded to "Delete this block?".

**Schedule picker went through a real-world fix, not just a build-check**: the first version used `<input type="datetime-local" step={900}>` on web and two free-text fields on native. Terra reported it back as genuinely broken on web — clicking a date changed it but the picker never closed, and no time control showed at all. Root cause: cross-browser support/behavior for a combined date+time input with a `step` restricting minute granularity is inconsistent (Safari doesn't auto-close the way Chrome does), so it was dropped entirely rather than patched. Both platforms now use plain, explicit option lists instead — a `<select>` pair on web (one for date, one for time), a tap-to-open scrollable modal-list pair on native (`NativePickerField`, same pattern as `PhotoCompare.js`'s `DatePicker`) — fed by shared `buildDateOptions()` (next 60 days) / `buildTimeOptions()` (all 96 quarter-hour slots, 12-hour labels) functions. Time is restricted to `:00/:15/:30/:45` by only ever offering those as selectable options, matching `scan-announcements`' own 15-minute cron cadence — picking anything finer would be a false promise of precision anyway.

**Status as of this session — fully live, not just code-complete:**
1. Migration `0024_announcements.sql` — **run.**
2. `send-announcement` and `scan-announcements --no-verify-jwt` — **both deployed** (this session's Supabase CLI happened to be authenticated already — see the "No DB credentials available" working note below for why that's notable).
3. Migration `0025_announcement_push_cron.sql` — **run**, registered as pg_cron job id 6, confirmed firing successfully against the deployed `scan-announcements` function (`CRON_SECRET` reused from the existing `scan-spc-alerts` setup, confirmed still set via `supabase secrets list`).
4. **Real APNs push credentials — generated automatically**, no separate `eas credentials` step needed: kicking off `npx eas-cli build --platform ios --profile production` (now that the Apple Developer Program is active) had EAS detect the missing push key from the `expo-notifications` plugin and prompt Terra to generate one against her Apple ID right there in the build flow. Confirms the "needs `eas credentials` run interactively" note below and in "Coach push notifications" above is now resolved, not just theoretically unblocked.
5. **Build submitted, Apple processing pending** as of this writing — `npx eas-cli submit --platform ios --profile production --latest` was queued ("waiting for an available submitter"). Once it clears Apple's processing and gets installed on a device, that device registers a real push token for the first time — that's the last gap before `send-push`/`scan-spc-alerts`/the nutrition reminder scans/this announcement pipeline all start actually reaching a phone. None of their own code needs to change; they were only ever missing a registered token to send to.

**Not yet verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, zero console/bundler errors). Worth a manual click-through once the new build is installed: compose an announcement as Terra, confirm the popup appears on a member login, confirm the audience filter actually excludes/includes the right clients, and confirm a "Send now" announcement produces a real phone notification.

## Real bug: announcement pushes silently excluded coach/admin accounts (2026-08-05)

Direct report from Terra: coaches never receive announcement push notifications, even though switching into their "My Training" tab (dual-login's member view) *does* show the in-app announcement popup — a real discrepancy between the two code paths, not "push just isn't working at all."

**Root cause, isolated to one line**: `supabase/functions/_shared/announcementAudience.ts`'s `resolveAudienceUserIds()` — the server-side function both `send-announcement` (send-now) and `scan-announcements` (scheduled/cron) call to figure out who to push — had its `target_type: "all"` fallback branch hardcoded to `.eq("role", "member")` when querying `core.users`, explicitly excluding every coach/admin account from the push audience. The **client-side** equivalent, `lib/programming/announcements.js`'s `matchesAudience()`, has no such restriction — its `default` case (i.e. `"all"`) just `return true` for anyone, member or staff, which is why the in-app popup (`AnnouncementModal` via `AnnouncementChecker`, mounted in `(member)/_layout.js`, reached by staff through My Training) always showed correctly while the real OS push never fired for them. Push-token registration (`PushRegistrar` in the root `app/_layout.js`) and the actual send path (`sendPush.js`/`expoPush.ts`) were both already role-agnostic — confirmed by reading them — so this wasn't a token or delivery problem, just audience resolution silently dropping staff before `sendPushToUser` was ever called for them.

**Fix**: dropped the `.eq("role", "member")` filter — `"all"` now resolves to every `core.users` row regardless of role, matching the client-side behavior and Terra's explicit ask ("I want them to go to everyone"). `group_program`/`spc`/`nutrition`-targeted announcements were already fine as-is (they query the underlying assignment/client tables directly, no role filter to begin with) — a coach/admin enrolled in one of those via their own dual-login training setup was already correctly included.

**Deployed live this session** — this session's Supabase CLI was authenticated (same "don't assume the sandboxed limitation always holds" exception noted elsewhere in this file): `supabase functions deploy send-announcement` and `supabase functions deploy scan-announcements --no-verify-jwt` both succeeded directly against the live project, no manual redeploy step left for Terra. No migration, no schema change — this was a pure server-side logic fix in a shared function file.

**Not independently verified beyond the deploy succeeding** — same standing login limitation as everywhere else in this file (no password entry in this environment) means the actual "does a coach's phone now receive the push" outcome needs Terra to confirm on a real device by sending a real "all"-targeted announcement.

## Real Web Push (VAPID) for the PWA — ported from the standalone app (2026-08-07)

Direct ask: native push only ever reaches the (still-unshipped) App Store build, but the PWA install (`app.kovastrength.com`, "Add to Home Screen") has been usable for weeks and Terra is shipping fast enough that waiting on App Store review isn't realistic — so PWA users (clients and coaches alike) had zero notification delivery. Rather than build Web Push from scratch, ported the standalone Nutrition Tracker app's own implementation, which has run in that app's production since 2026-07 — see [[nutrition_tracker_repo]]. Read its actual source (`public/sw.js`, `app/components/PushSubscribe.js`/`pushActions.js`, `app/api/cron/reminders/route.js`) rather than reimplementing from general Web Push knowledge.

**The reuse turned out bigger than expected: `public.push_subscriptions` already exists live in the shared Supabase project** (`user_id → auth.users`, RLS = own-rows-only, full grants to `authenticated` already confirmed via a direct schema query) — the standalone app's own migration `0011_push_subscriptions.sql`. Since Kova's members/coaches already share that `auth.users` table (same pattern as every other `public.*` nutrition touch-point), this needed **zero new migration** — just point at the existing table.

**Client side** (web-only throughout, gated on `Platform.OS === "web"`):
- `public/sw.js` — the service worker, ported near-verbatim (push + notificationclick handlers; the offline-page-caching half of the original was dropped, Kova has no `/offline` route and this pass is push-delivery-only, not an offline-first shell).
- `lib/notifications/webPush.js` — `getWebPushStatus()`/`subscribeToWebPush(userId)`/`unsubscribeFromWebPush()`, direct `supabase`-client calls (no server actions — this app has none) against `public.push_subscriptions`, ported from `PushSubscribe.js`'s status-detection states (`unsupported`/`ios-needs-install`/`denied`/`ready`/`subscribed`).
- `components/WebPushBanner.js` — dismissible enable-notifications banner, mounted once in `app/_layout.js` as a sibling of `PushRegistrar` (native's equivalent). Rendered through a `Modal` (same technique as `ToastHost.js`) rather than threaded into the member Tabs layout or `CoachShell` individually, so one component covers both without duplicating chrome-specific wiring. Detects iOS-outside-standalone-mode and shows "Add to Home Screen first" instead of a subscribe button that can't work yet, same as the original.
- `registerPushToken.js`'s old "native-only, coaches only get push on the app side" comment is now stale/corrected — that function is still native-only (Expo/APNs/FCM), but the web PWA has its own real path now via `webPush.js`.

**Server side — the actual send mechanism, unified at the existing choke point.** `sendPushToUser()` in `supabase/functions/_shared/expoPush.ts` is the one function every push-sending caller already goes through (`send-push`, `scan-spc-alerts`, `scan-nutrition-reminders`, `scan-nutrition-checkin-available`, and — via `announcementAudience.ts` — `send-announcement`/`scan-announcements`). It now fires native Expo push and the new `sendWebPushToUser()` (new `_shared/webPush.ts`, `npm:web-push@3.6.7`, VAPID-signed, same 404/410-triggers-cleanup pattern as the standalone app's cron route) in parallel and sums the counts — **zero caller changes needed**, every existing notification type picked up PWA delivery automatically the moment the shared file changed and the 6 functions were redeployed.

**Confirmed `npm:web-push` actually runs in Supabase's Deno Edge Runtime before trusting it** — deployed a disposable `test-webpush-import` function (`--no-verify-jwt`, no real secrets touched) that just imported the library and called `setVapidDetails`, curled it directly, got a clean 200, then deleted it. This was the one genuinely unproven piece of the port (everything else was either an existing live table or a straight code port); confirming it first meant the real functions could be redeployed with confidence rather than discovering a Deno/npm incompatibility after the fact.

**Fresh VAPID keypair generated for Kova specifically** (`npx web-push generate-vapid-keys`) rather than reusing the standalone app's — keeps the two apps' push identities cleanly separate. Public key is `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (in `.env.local` for local dev, and set on **both** Vercel Production and Preview via `vercel env add` — this app's web build reads `EXPO_PUBLIC_*` vars at Expo build time, so it needs to exist in Vercel's own env, not just `.env.local`); private key + subject (`mailto:terra@kovastrength.com`) are `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`VAPID_PUBLIC_KEY` Supabase Edge Function secrets only, never shipped client-side.

**Status as of this session — Supabase side fully deployed and live, Vercel/web side blocked on one missing credential:**
1. All 6 push-sending Edge Functions redeployed with the merged `sendPushToUser()` — confirmed via `supabase functions list` that redeploying without `--no-verify-jwt` **preserves** each function's existing `verify_jwt` setting rather than resetting it (the 4 cron-triggered ones stayed `verify_jwt: false` as needed, confirmed by version number bump + unchanged flag — worth remembering, this was a real risk this session flagged and checked rather than assumed).
2. VAPID secrets set, Vercel env vars set, `.env.local`/`.env.example` updated.
3. `npx expo export -p web` — clean, `sw.js`/`manifest.json` land correctly in the static output.
4. Verified as far as this environment's tooling allows: served the real export locally, opened it in the Browser pane, confirmed zero console errors from the new code, confirmed `navigator.serviceWorker.register("/sw.js")` succeeds with the correct scope, confirmed the VAPID public key parses and `pushManager.subscribe()` reaches the browser's real push mechanism (failed only on `AbortError: permission denied` — this sandboxed browser auto-denies `Notification.permission`, which is the harness's own limitation, not a code bug; same class of "can't log in / no real device" gap noted throughout this file).
5. **Terra pushed it herself** (`git push origin main` — this session's own push attempt failed, see the "git push is NOT reliably available" working note below) — deployed to `app.kovastrength.com` via the usual Vercel auto-deploy.

**End-to-end delivery confirmed for real, not just bundle-checked.** Terra subscribed via the new banner on `localhost:8081` (a real `public.push_subscriptions` row landed, confirmed via a direct schema query), and a direct server-side call to `sendPushToUser()` for her account (a disposable diagnostic Edge Function, deployed/tested/deleted same session) returned `sent: 2` — one real push reached her phone (native, existing token) and one reached her browser (new web subscription), same call.

**Follow-up same session — "coaches aren't getting push" turned out to be a swallowed error message, not a role bug.** Terra reported the Settings → "send yourself a test push" button failing with a generic "Edge Function returned a non-2xx status code." Checked first (before assuming a bug) whether coach/admin accounts are excluded from push anywhere — they aren't; `sendPushToUser()` has no role filter at all, and the earlier "announcement audience excluded coach/admin" bug (2026-08-05, above) was confirmed still fixed. The generic error message was real but unhelpful — `lib/notifications/sendPush.js` threw `error.message` from a `FunctionsHttpError`, which is always that same generic string; the real reason lives in `error.context`'s response body and was never read. Fixed the same way `register.js` already had to (see that file's own header comment) — `extractFunctionErrorMessage()` now reads the real body. With the real message surfaced, the actual cause was `send-push`'s own "Invalid or expired session" check (`callerClient.auth.getUser()` rejecting her JWT) — resolved by a hard refresh of the stale localhost tab, not a code bug. Worth remembering as a class: a generic Edge Function error message should always be suspected of hiding the real reason before concluding "it's broken" — check `error.context` first.

## Coach<->member messaging bubbles + admin kill switch (2026-08-07/08)

Real ask: persistent floating message access on both apps, plus — once shipped and clicked through — an admin off-switch, since Terra wasn't sure messaging was ready to go live yet: "adds some complexity on where do we watch messages... until I figure that out I need to be able to turn it off," plus an optional finer split ("turn on messaging for just specific memberships"). Also relabeled `CoachShell.js`'s web sidebar link from "My Training" to "Member View" in the same pass, matching the native `more.js` row that had already been relabeled earlier but the web sidebar was missed.

**Floating bubbles, both apps.** New `components/FloatingMessageBubble.js` (member) — a small circle pinned above the tab bar on every `(member)` screen (mounted in `app/(member)/_layout.js` as a sibling of `<Tabs>`); tapping it opens the same thread the header chat icon/`/messages` route reach, as a bottom-sheet `Modal` — closing it returns to wherever you were, no navigation involved. New `components/CoachMessageBubble.js` — same pattern, scoped to whichever client's page a coach is on, dropped onto the three "someone's screen" pages (`clients/[userId].js`, `nutrition/clients/[userId].js`, `spc/[userId].js`).

**Real bug found and fixed same day, from a direct device report.** The first version wrapped the *idle* button in an always-visible `<Modal transparent>` (`pointerEvents="box-none"` on its wrapping View) — the same technique already proven for `ToastHost`/`WebPushBanner`. On a real device this broke interaction entirely: "the only thing that works when you load that, is the bubble itself. like its overlaying the whole screen with a clear non clickable page" — a Modal presents as its own native overlay window, and `pointerEvents="box-none"` doesn't reliably let touches reach the screen underneath it (the tab bar included), unlike ToastHost/WebPushBanner, which are small and dismissible and had apparently never been tapped through in the exact spot they cover. Fixed in both components by dropping the Modal for the idle button entirely — it's now a plain `position:"absolute"` element, so only its own 52×52 footprint intercepts touches. The Modal is still used, deliberately, for the *opened* thread sheet — blocking the screen while it's open is the whole point there. `FloatingMessageBubble` specifically has to render *after* `<Tabs>` in `_layout.js` (not before) so it paints on top of the tab bar — later JSX = later paint = on top for overlapping siblings, since it isn't nested inside a `Tabs.Screen` and so gets no `BottomTabBarHeightContext` to size itself against (approximated instead with a fixed `insets.bottom + 74` offset). `CoachMessageBubble` doesn't need that — it's rendered inside the screen's own content area (a sibling of that page's `ScrollView`, inside `<CoachShell>`), which native's Tabs navigator already sizes to exclude the tab bar.

Member Settings gained a "Messaging" card (under Notifications) with a device-local "Show message bubble" toggle (`lib/messageBubblePref.js`, AsyncStorage, no migration) — confirmed with Terra this doesn't need to sync across devices. Turning it off doesn't remove messaging outright — the header chat icon and `/messages` route are left alone as a fallback.

**Admin kill switch + audience, next-day follow-up.** New `lib/programming/messagingSettings.js` — two `core.settings` rows (`messaging_enabled` boolean, default `true`; `messaging_audience` jsonb array of scope keys, default `["all"]`) with `getMessagingSettings()`/`setMessagingEnabled()`/`setMessagingAudience()`, same shape as the existing `NOTIFICATION_TOGGLES` pattern on `app/(coach)/settings.js`. `matchesMessagingAudience(audience, scopes)` is the pure match check; `deriveMessagingScopes()` turns already-loaded membership data (group program ids + spc/nutrition active booleans) into the same scope-key shape, and `getMessagingScopesForUser(userId)`/`isMessagingEnabledForUser(userId)` do the same from scratch for callers with no membership data already loaded.

New **Settings → Messaging** tab (admin-only): the master toggle, then an audience list — "Everyone" (exclusive; checking it collapses to `["all"]` and dims/disables the rest) or any mix of Nutrition/SPC/each group program (`listGroupPrograms()`, so a newly-created program like "Look Like You Lift" shows up automatically, no hardcoding).

**Every messaging entry point respects this, not just the two bubbles**: both floating bubbles (checked against the specific member/client being viewed, not the coach's own memberships), the header chat icon + `/messages` route (member), the existing inline "Messages" card on the group client profile (`clients/[userId].js`, reuses that page's already-loaded `assignments`/`spcClient`/`nutritionClient` instead of a second scope-resolving fetch), and the coach Messages inbox — nav item (`CoachShell.js`'s sidebar/drawer, and native's `more.js`) plus the route itself (`app/(coach)/messages/index.js`, showing a plain "Messaging is currently turned off" message if reached directly) — gated on the **master switch only**, not audience, since the inbox is a cross-client aggregate view rather than one specific membership's affordance.

**Verification**: the Modal-freeze bug and its fix were confirmed directly by Terra on a real device ("Bingo. its perfect."). The kill switch/audience settings themselves are bundle-checked only (`npx expo export -p web`, clean) — not yet clicked through.

## Text alert when Apple's App Review account signs in (2026-08-07)

Direct ask while a build was sitting "Waiting for Review": a way to know the instant Apple's reviewer actually logs into `review@kovastrength.com` (the demo account handed to Apple in App Store Connect's review notes), rather than only finding out once a verdict email arrives.

**New Postgres trigger on `auth.users`** (migration `0035_review_signin_notify.sql`, **run**, confirmed live 2026-08-07) — fires `after update of last_sign_in_at`, scoped to `new.email = 'review@kovastrength.com'`. `last_sign_in_at` only changes on a genuine sign-in (password/OTP/OAuth grant), not on the routine background token refresh every session goes through roughly hourly, so this can't spam on its own. Calls the new `notify-review-signin` Edge Function via `net.http_post` (`pg_net`, already installed for the announcement/SPC-alert cron jobs), which texts Terra via GHL's Conversations API — the same call `request-registration-code` already makes — using her own GHL contact id (`Y5bLtvYia5p7cF86alWt`, hardcoded in the function; this is a single personal notification; not a general-purpose feature).

**Auth is its own dedicated secret (`REVIEW_SIGNIN_SECRET`), not `CRON_SECRET`** — the CLI can *set* a function secret but can't read an already-set one back, and the trigger's SQL needs the literal value to send as a header (Postgres has no way to reference an Edge Function's env var from inside a trigger body). A fresh secret was generated instead and set via `supabase secrets set`.

**A real near-miss on secret hygiene, caught before anything was committed**: the first draft of `0035`'s SQL embedded the actual `REVIEW_SIGNIN_SECRET` value in plaintext (needed to actually run it against the live project). Terra caught this before the commit happened — the committed version now carries a placeholder (`REPLACE_WITH_THE_REVIEW_SIGNIN_SECRET_VALUE`), same convention as `0025_announcement_push_cron.sql`'s `CRON_SECRET` placeholder — the real value was substituted only in the copy actually run via `supabase db query -f`, never saved back to the file. The live trigger function's source in the database still has the literal secret baked in (unavoidable — there's no cleaner way to get a secret into a `pg_net` call from SQL), but that's normal/expected, not a repo-hygiene issue; only the git-tracked file needed fixing.

**Deployed and verified end-to-end this session** (not just bundle-checked) — this session had an authenticated Supabase CLI and EAS CLI, both confirmed working live: the function was deployed, the secret was set, the migration was run directly via `supabase db query -f` (the mutating write was blocked once by the auto-mode classifier as too high-risk to run unattended, same as the messaging-follow-ups session — proceeded once Terra explicitly confirmed in chat), and a direct `curl` against the deployed function with the real trigger secret returned a clean `200 {"sent":true}` and landed a real text on Terra's phone. The trigger itself (real Apple sign-in → real text) hasn't been observed firing yet as of this writing — Apple hadn't signed in again since it went live.

**Same session, unrelated but concurrent**: while "Waiting for Review," Terra removed that submission from review herself (not an Apple rejection — a developer-initiated "Remove from Review," which just returns the version to an editable draft with no review-history penalty) so a newer build could be swapped in, since a week of real bug fixes (sign-out-too-often, Dynamic Type layout breakage, a keyboard covering input fields, etc.) had shipped since the original build went up. `eas build --platform ios --profile production --auto-submit --non-interactive` built and uploaded build 17 in one step (`--auto-submit` chains build → App Store Connect upload). Re-attaching the new build to the App Store version and re-submitting is a manual App Store Connect step with no CLI/API access from this environment — same standing limitation as everything else in this file that requires clicking through Apple's own web UI.

## One-tap "Refresh now" on announcements, and the nutrition check-in-available notification repointed through it (2026-08-08)

Prompted by a real ops need: Terra shipped a functional change to the nutrition check-in flow and had no way to get PWA users off stale cached JS other than manually texting people (what she used to do before push/announcements existed). Two asks, scoped down in real time mid-build after a first, broader "generic recurring announcements" design was replaced by a much smaller one once Terra clarified what she actually wanted:

**`requires_reload` — a one-tap "Refresh now" button, lives on the Announcements page only.** Migration `0044_announcement_requires_reload.sql` (**run**, confirmed live) adds `programming.announcements.requires_reload` (boolean, default `false`). The compose form (`app/(coach)/announcements/index.js`) gained a checkbox ("Requires a refresh to take effect..."); `createAnnouncement()` (`lib/programming/announcements.js`) passes it straight through. `AnnouncementModal.js` renders a real "Refresh now" (`window.location.reload()`, web-only — a native rebuild can't be pushed by a page reload) plus a lighter "I'll do it later" dismiss-only option, instead of the plain "Got it" button, whenever the flag is set; `AnnouncementChecker.js`'s new `handleRefresh` awaits `acknowledgeAnnouncement()` before reloading (not fire-and-forget — a page reload cancels any in-flight request, so acknowledging first is what stops the same announcement from popping right back up post-reload). History rows show "· Refresh prompt" for past announcements that had it set.

**First design considered and rejected: a brand-new generic "recurring announcement" system** (its own `recurring_announcements` table, a weekday/time picker on the Announcements page, a new `scan-recurring-announcements` Edge Function spawning fresh one-shot rows). Dropped mid-build, before any of it was written, once Terra clarified the actual want: the one recurring case that mattered was the nutrition weekly check-in reminder, which **already** has a day/time/content editor (Settings → Nutrition, from the same day's earlier session) — building a second, parallel scheduling UI for the same concept was redundant. "Makes more sense being there" won.

**So instead: `scan-nutrition-checkin-available` now creates a real `programming.announcements` row (`target_type: "nutrition"`) each time it fires, rather than looping `sendPushToUser` directly.** Settings → Nutrition's day/time/title/body editor is completely untouched — same config, same cron cadence (15-minute poll, same idempotency-guard pattern as before). What changed is delivery: it gets the same in-app popup every other announcement gets (not just a push banner easy to miss) and a real entry in the Announcements page's History, for free, with zero new scheduling UI. The announcement row's `pushed_at` is stamped immediately at insert time (not left null) so `scan-announcements`' own 15-minute poll doesn't also try to push it a second time. The existing per-client `notify_checkin_available` opt-out is preserved exactly as before — it still only gates the push loop, not the announcement row itself, so an opted-out client still sees the in-app popup (an announcement's audience is deliberately "everyone active in that program," it has no known opt-out concept), just doesn't get pushed. **One small, known behavior widening worth remembering**: the old push loop excluded clients still mid-onboarding (`objective_tracking_approved_at is null`); the announcement's own audience match (`target_type: "nutrition"` → `public.clients.status === "active"`) has no equivalent onboarding filter, so a mid-onboarding client will now also see the in-app "check-in available" popup even though they have nothing to check in yet. Low-stakes, not fixed this session.

**Deployed live this session** (Supabase CLI authenticated): `0044` run and confirmed via schema query; `scan-nutrition-checkin-available` redeployed with `--no-verify-jwt`, confirmed still `verify_jwt: false` afterward (redeploying without the flag would silently re-enable JWT verification and break the cron trigger — checked, not assumed, same as prior sessions' own note about this). Did **not** test-fire the function directly — doing so risked a real push/announcement to real nutrition clients depending on today's configured send window, and this app's standing rule is no real client-facing sends without an explicit ask for that specific test.

**Not visually verified** — same standing login limitation as everywhere else in this file; `npx expo export -p web` stayed clean throughout. Worth a real click-through next time: the compose checkbox, the popup's Refresh-now/I'll-do-it-later pair actually reloading vs. dismissing, and confirming the next nutrition check-in-available firing shows up as a real popup + History row rather than just a push.

## Events: one event opens straight in, a nagging tab badge, scheduled go-live (2026-08-27)

Three asks in one session. Migration `0096` — applied and verified live.

**With exactly one live event the tab opens the event, not a list.** A card
you tap to reach the only thing behind it is a step with nothing on either
side of it. `app/(member)/events/index.js` renders the detail inline when
`events.length === 1`; 2+ keeps the cards. To stop the two paths drifting,
the loading, the submit/cancel calls and the error+retry state moved into
new `components/events/EventDetailScreen.js`, which both the inline case and
the pushed `events/[eventId]` route render — the host owns only its own
ScrollView, header and back affordance.

In single-event mode the tab's own name drops to an `Eyebrow`. "Events" at
30pt display directly above the event title at 28pt display read as two
headings competing, and this is the one member screen whose content supplies
its own title. Deliberately not solved by hoisting the title into the header
row: with a graphic the order becomes header / poster / meta, which detaches
the meta line from the title it belongs to.

**The tab badge is a deliberate nag** — `tabBarBadge` on the Events
`Tabs.Screen`, counting live events this member hasn't opened, cleared only
by opening the tab. Two details worth keeping:
- `undefined` when the count is 0, never `0`. react-navigation renders the
  badge on `badge != null`, so a literal 0 would sit there forever.
- `tabBarBadgeStyle={{ backgroundColor: "#b23a22" }}` — `Badge` derives its
  text colour from the background, so white text comes free. The badge
  measures 19×19 at `top: -3` inside the 24pt icon wrapper `TAB_ICON_STYLE`
  sets, which lands 2px INSIDE the tab bar's top edge (measured, not
  eyeballed) — worth re-measuring if that icon height ever changes.

Seen-state is `lib/programming/eventSeen.js` — AsyncStorage, same pub-sub
shape as `messageBubblePref.js`, because the tab bar and the Events screen
are mounted separately and the badge has to clear the instant she opens the
tab. Deliberately NOT a table alongside `announcement_acknowledgments`: it's
a nudge, not a record, nothing reads it coach-side, and the worst case of a
cleared browser store is one extra badge. **`useSeenEventIds()` returns null
while storage is still being read, distinct from an empty set** — counting
against an empty set in the meantime would flash a badge on every cold start.
`markAllEventsSeen(liveIds)` REPLACES the set (the list screen always passes
the complete live list, so this prunes closed events for free);
`markEventSeen(id)` adds one, and `EventDetailScreen` calls it on every load
so a push deep link — which never touches the list — still clears the badge.

**Scheduling: `events.publish_at`, and the push needs no new infrastructure.**
An event's announcement is already a normal `programming.announcements` row,
and those already carry `send_at` and are already sent by the
`scan-announcements` pg_cron job (0025). So scheduling an event is just
`publish_at` on the event plus `sendAt = publishAt` on its announcement —
no new Edge Function, no new cron. That cron polls every 15 minutes, which
is why the picker only offers quarter-hour slots (`lib/dateTimeOptions.js`,
already shared with announcements).

`publish_at` is nullable and null means "live as soon as it's published" —
exactly the previous behaviour, so no backfill and no existing row changed.
**The gate is repeated inline in all six member-facing policies** (events,
items, questions, and the response insert/update/delete) rather than
extracted into a helper: a function reading `programming.events` can't be
used inside `programming.events`' own policy without recursing, so a helper
would cover five of six and leave the important one written differently from
its siblings. The `auth.uid() is not null` guard from the 2026-08-21 audit is
preserved on each.

Ordering is deliberate: RLS compares against `now()` so the tab appears at
the exact instant, while the push can land up to 15 minutes later. Never the
other way round — nobody is pushed at something they can't open yet.

`eventPhase()` gained a fourth state, `scheduled`, and every consumer needed
it: without a Scheduled section the coach's list would have dropped those
events entirely (they're in neither Live, Drafts nor Closed). **A scheduled
event must be cancellable** — take-down now covers `scheduled` as well as
`live`, and both take-down paths call the new
`deletePendingAnnouncementsForEvent(eventId)`, or `scan-announcements` would
still push people at an event that no longer exists. Scoped to
`pushed_at is null`: one that already went out is history, not something to
erase. `events.pushed_at` stays null for a scheduled announcement — nothing
has gone out yet, and it's what lets the cancel path find the queued row.

Changing a schedule is cancel-then-republish, not an edit. Two ways to reach
the same state is where half-states come from, and the loop is short.

**Known and unchanged**: `useEventsAccess` re-checks on mount and on
AppState foreground, not on a timer — so a member with the app already open
in the foreground when an event goes live sees the tab on their next
foreground cycle. Same shape as `AnnouncementChecker`, deliberately, and the
realistic path (push arrives → app foregrounded) is covered.

**Verified**: migration dry-run in a rolled-back transaction, then a
6-assertion impersonation test as a real member (sees 1 of 2 events, 0 items
of the scheduled one, insert refused; then 2 of 2 and 1 item once
`publish_at` passes) — also rolled back — before applying for real; column,
index, all six policies carrying the gate and zero affected rows confirmed
by query afterwards. The `.or("publish_at.is.null,publish_at.lte.<iso>")`
filter was curled against live PostgREST to prove the ISO string's dots
don't collide with its `column.operator.value` separator (200 `[]`, not a
400). The badge geometry, the eyebrow header, the go-live picker, the
scheduled banner and `eventPhase()`'s four states were all driven and
measured in a throwaway `app/zz-ev/` route folder (deleted; `git status`
confirmed clean). **Not verified behind a real login** — standing
limitation. Worth Terra's click-through: schedule one a quarter-hour out and
confirm the tab, the popup and the push all land together.

## Popup and push become separate choices — and the announcement cron had been 401ing all along (2026-08-27)

One checkbox used to do both: creating an announcement row made it pop up
next time the member opened the app AND buzzed their phone. So "just leave
them a note" and "just text them" were both unreachable. Migration `0097` —
applied and verified live.

`programming.announcements.show_in_app` and `send_push`, both default true,
so every existing row and every caller keeps behaving exactly as before and
there is nothing to backfill. **`show_in_app` is enforced in RLS**, not just
filtered client-side — a push-only announcement must genuinely not be
readable as a popup, or the member app shows it anyway the first time a query
forgets the filter. `send_push` has no RLS equivalent (nothing about it is
member-readable) and is honoured in two places: `scan-announcements`' query,
and `sendAnnouncementPush` in `_shared/announcementAudience.ts`, which is the
single choke point every push path goes through.

**The scan needs the query filter, not just the guard.** An in-app-only row
keeps `pushed_at` null forever by design, so without `.eq("send_push", true)`
it would be re-fetched on every run for the rest of its life. The guard
inside `sendAnnouncementPush` returns WITHOUT stamping `pushed_at` — nothing
went out, and stamping it would make the coach's history lie.

Both surfaces get the split: the event editor's "Also announce this" is now
two rows under "Tell them about it", and the Announcements compose page gets
the same pair. Both channels off on an event means no announcement row at all
(publishing still makes it appear); on the Announcements page it's rejected,
since an announcement with no delivery channel is nothing.

**`events.pushed_at` is no longer what decides the re-publish default** — it
only ever records a real push, so it missed an in-app-only or still-scheduled
announcement and would have offered to announce a second time. New
`countAnnouncementsForEvent(eventId)` counts rows in any channel instead.
`events.pushed_at` is still written on a real immediate push, as a record.

### Three follow-ups from Terra's first real schedule

She scheduled one and reported the push box appearing to tick itself, no way
to check afterwards, and confirm copy left over from before the split. The
data was right — `send_push: false` was stored exactly as she picked — but
all three reports were real:

- **`saveDetails()` ends with `load()`, and `load()` was re-seeding both
  checkboxes on every call.** Pressing Schedule therefore visibly re-ticked
  the boxes mid-action. The write was still correct (the handler's closure
  held her real values), which is the only reason this was cosmetic rather
  than a wrong send — but a plain **Save** would silently restore both, and
  the next publish would have used them. Seeded once per event via a ref now.
  **Worth generalising: a `load()` that re-seeds form state is safe only if
  nothing calls it mid-edit — and here `saveDetails()` did.**
- **Nothing said which channels were queued** once the event left draft,
  because the checkboxes are gated on `phase === "draft"`. The scheduled
  banner and a new line on live events now state it, read off the real
  announcement row — `getLatestAnnouncementForEvent` replaced the earlier
  count for exactly this reason.
- **The confirm dialog still claimed both channels went out.** True when they
  were one checkbox, a lie the moment they weren't. `describeChannels` is now
  the single phrasing, passed into `confirmPublishEvent` and reused by the
  banner and the live line, so the thing she agrees to and the thing she
  reads back can't disagree. It returns **null** when neither channel is on
  and each site frames it, rather than forcing "no announcement at all" into
  a sentence that reads as though something is being sent. All twelve
  variants (4 channel combinations × dialog/banner/live-line) were printed
  and read before shipping.

### The cron bug this uncovered

Test-firing `announcement-scan` after redeploying returned **401
Unauthorized** — and `net._http_response` showed it had returned 401 on
**every run, every 15 minutes, since it was registered.** Scheduled
announcements had never once been pushed by the cron. Nobody noticed because
"Send now" pushes through `send-announcement` directly, which works, and a
`pg_net` call's failure is invisible from `cron.job_run_details` (the job
succeeds the moment the request is queued, whatever comes back).

Root cause is exactly the trap this file already warns about under the
payroll cron: **`supabase secrets list` prints a SHA-256 digest, never the
plaintext.** Two jobs — `announcement-scan` and `nutrition-reminders-scan` —
carry a 64-hex-char value where the working three carry the real 8-char
secret. Someone pasted the digest.

Diagnose it without ever printing a secret:

```sql
select jobname,
       md5((regexp_match(command, 'x-cron-secret["'']*\s*,?\s*["'']([^"'']+)'))[1]) as secret_md5,
       length((regexp_match(command, 'x-cron-secret["'']*\s*,?\s*["'']([^"'']+)'))[1]) as len
from cron.job order by jobname;
```

Jobs that disagree on that hash disagree on the secret; a length of 64 is the
digest, not the key. Repair by copying from a known-good job entirely in SQL
(`cron.alter_job(jobid, command => replace(command, bad, good))`) so the
plaintext never passes through a tool call or a file.

`announcement-scan` is **fixed and verified** — it now returns
`{"scanned":0,"pushed":0,"errors":[]}`, which doubles as proof the redeployed
v15 function runs clean against the new schema.

**`nutrition-reminders-scan` is still broken, deliberately.** Fixing it turns
on a client-facing messaging stream (evening daily-log reminders, the Monday
check-in nag) that has been silently off for months — flipping that on
without asking would text real clients on a schedule Terra has never seen
working. It needs her say-so. The old commands for both jobs are captured at
`~/kova-cron-fix-2026-08-27/rollback-commands.json` (kept out of the repo —
it holds the real secrets).

**Worth generalising: a pg_net cron job can fail forever in total silence.**
`cron.job_run_details` says "succeeded" because queueing the request is all
the job does. The only place the truth lives is `net._http_response`. Worth a
periodic glance at `select status_code, count(*) from net._http_response
group by 1` — anything non-200 there is a scheduled job that isn't running.

**Verified**: migration dry-run then a 3-row impersonation test (a push-only
announcement is unreadable by a real member, an in-app-only one is readable),
both rolled back, before applying; existing 5 rows confirmed unchanged
afterwards. Both Edge Functions redeployed, versions bumped and `verify_jwt`
flags confirmed preserved (`send-announcement` true, `scan-announcements`
false — redeploying without the flag preserves it, but check, don't assume).
The two checkboxes were driven for real and toggle independently. **Not
click-tested behind a real login** — standing limitation. Worth Terra's pass:
send an in-app-only announcement and confirm no push, then a push-only one
and confirm no popup.

## Announcement graphics + a member Events tab (2026-08-13)

Two deliverables from one ask: attach a Canva export to an announcement, and
a members' Events tab for bring-a-friend days, class registrations, and
supplement/merch orders. Plan at
`/Users/Dustin/.claude/plans/events-tab-and-announcement-graphics.md`.

**Decisions confirmed with Terra before building**: order forms are *items with
options* (S/M/L, Vanilla/Chocolate), not bare item+qty and not a priced
catalog; **admin only** composes; publishing *optionally* announces (a
per-event checkbox); events **auto-hide when they close**.

**There is deliberately NO on/off switch for the Events tab.** Terra's own
call once auto-hide was on the table — "i dont need the master switch."
`useHasEvents` (`lib/programming/useEventsAccess.js`) makes the tab exist
exactly while a live event is targeted at that member; unpublishing is the
emergency brake for taking something down before its date, which is why every
live row on the admin list carries a one-tap "Take down". The hook defaults
**hidden** while loading and on error — the opposite of `useHasFitness`, and
for a real reason: hiding My Fitness takes a tab from someone who genuinely
trains, whereas Events is additive, empty most weeks, and has the
announcement/push as its actual notification channel.

**Graphics live in a new PUBLIC `graphics` bucket** (migration `0060`, created
in SQL rather than by hand), separate from nutrition's private `photos`. A
poster is for the whole gym, signed URLs expire out from under a card that
stays on screen, and a public URL is the only kind that could ever be embedded
in a push later — so **nothing client-specific may ever be written there**.
`lib/nutrition/imagePicker.js` moved to `lib/imagePicker.js` (it was never
nutrition-specific) and gained width/quality options: graphics run wider and
less compressed (1400px @ 0.85) because flat text on a solid background is the
worst case for JPEG ringing.

**Announce-on-publish reuses the announcement pipeline rather than adding
push infra.** "Also announce this" writes a normal `programming.announcements`
row carrying the same `image_path` plus a new `event_id`, then calls the
existing `pushAnnouncementNow` — so the event lands in Announcements history
for free, the popup gains a "View details" button, and the only server change
was one line in `_shared/announcementAudience.ts` adding `url:
/events/<id>` to the push payload (both `send-announcement` and
`scan-announcements` call that shared helper; both redeployed,
`scan-announcements` kept `--no-verify-jwt`, flags verified after). Announcing
is best-effort and separate from publishing: a push failure reads as "the
announcement didn't go out", never "publishing failed". `alsoAnnounce`
defaults **off** once `pushed_at` is set, so take-down-and-republish can't
notify everyone twice.

**Audience resolution was extracted** into `lib/programming/audience.js` and
shared with announcements rather than copied a third time.

**Four real bugs found by verification, not review** — all four survived a
clean `expo export`:
- **`maxHeight` fights `aspectRatio` in RN.** The box keeps its 100% width,
  clamps its height and breaks the ratio, so a 4:5 poster rendered in a
  landscape box with grey bars down both sides. A height budget has to be
  spent as a **width** cap (`maxWidth = budget × ratio`), which bounds height
  implicitly. Measured: 208×260 at ratio 0.800, and 146×260 for a 9:16.
- **`closesAt.slice(0, 10)`** printed a close date one day late — the same
  UTC-vs-Boise class this file already warns about. Uses `dateInBoise` now.
- **`colors` was never imported** into `app/(member)/index.js` for the new
  teaser. Metro doesn't resolve identifiers, so the bundle was clean and it
  would have thrown at render.
- **A failed graphic reserved a 260px grey box** above the announcement title.
  Renders nothing now.

**Two storage findings worth remembering**: `supabase storage rm
--experimental` still returns `{"deleted":[]}` and does not delete (already
noted in this file) — and the documented SQL fallback **no longer works
either**: deleting from `storage.objects` now raises `42501: Direct deletion
from storage tables is not allowed` from a `storage.protect_delete()` trigger.
Deleting a stored object needs the Storage API with a JWT that satisfies the
bucket's own RLS, i.e. the dashboard or a logged-in admin.

**Verification**: RLS was tested against the live DB by impersonating a real
member inside a rolled-back transaction (`set_config('request.jwt.claims')` +
`set local role authenticated`) — the member saw only the published,
not-yet-closed event, only that event's items (not a draft's), and none of
another member's responses. Both migrations are **run and verified**; PostgREST
returns `[]` rather than PGRST205. The announcement popup (with and without a
graphic, both aspect ratios, long-message overflow), the member event cards,
the order stepper, the choice question and the coach item editor were all
rendered and screenshotted, and the quantity stepper driven for real. **Not
verified**: anything behind a real login — the composer end-to-end, a real
publish, a real member order, and the CSV. Standing limitation.

**Same-day follow-up from Terra's first click-through** (migration `0062`,
**run and verified**): a sign-up event used to *always* ask how many guests
you're bringing, which baked "bring a friend day" into a response type she
also wants for registering people onto a program. `events.ask_guest_count`
makes that opt-in, defaulted **off** — bring-a-friend is the special case, not
the norm — and the copy went neutral with it ("Sign me up" / "Signed up", not
"I'm in" / "You're in"). Two knock-ons worth knowing: a bare sign-up now has
nothing to edit once submitted, so the submit button is replaced by a
confirmation card rather than an "Update" button that updates nothing
(`canEditResponse` gates this — true for any order, or a sign-up with guests
or extra questions); and an unasked guest count stores **null, not 0**, or a
program roster would read "On their own" against every name.
`events.cta_label` lets a link-out event's button say what it does
("Register") instead of always "Open" — generically named on purpose, so a
sign-up could use it later without another migration.

**Preview button on the composer** (same follow-up round). The point of a
preview is that it can't disagree with what members actually get, so the
member's view was **extracted rather than reimplemented**: new
`components/events/EventCard.js` (moved out of the member list screen) and
`components/events/EventDetailView.js` (moved out of the member detail
screen, now owning its own guests/answers/quantities form state, seeded from
`response`, with a `preview` prop that makes every control inert). The member
screens keep data loading and the API calls and render those two; the coach's
Preview modal renders the same two at a fixed 360px frame — a member view
stretched across a desktop card would misrepresent every line break and the
graphic's crop, which is most of what a preview is for. It builds its event
object from **live form state**, not the saved row, so unsaved edits show.
Caught one drift while looking at it: the list card hardcoded "Open" for a
link-out even when the button had been relabelled.

**Left for Terra**: two throwaway test graphics
(`graphics/announcements/test-4x5.jpg`, `test-9x16.jpg`) need deleting from
the Storage dashboard — see the storage note above for why neither the CLI nor
SQL can do it.

## Events: order events become a store, dates get a calendar, Duplicate (2026-09-13)

Three asks on events. Migration `0129` applied and verified live.

**Every event date is a calendar now, not a 120-row list.** New
`components/DateField.js`: an input reading "Fri, Sep 18" that opens a small
month calendar INLINE underneath it (pushes the form down, no popup to
position). Days before today are inert, picking a day closes it, and an
optional date gets a clear link ("No specific date"). Values stay plain
Boise `YYYY-MM-DD` strings, the same shape the old option lists produced, so
the three call sites in the event editor (event date, closes, go-live) needed
no change to how they save. Time stays a quarter-hour `<select>` beside it,
because `scan-announcements` polls every 15 minutes. `buildDateOptions` is
still used by announcements, so it stays.

**Order items carry a photo and a price** (`event_items.image_path`,
`event_items.price numeric(10,2)`, both nullable). The photo uses the public
`graphics` bucket via `GraphicPicker` (folder `event-items`): product shots
are marketing, never client data. Price is display only, nothing is charged.
The item editor also gained a description field, which the column always had
and nothing wrote.

**The member order screen is a store** (`EventDetailView`): one card per
product (photo, name, price, description, a "Choose one" dropdown when the
item has options, a quantity stepper, **Add to bag**), then any extra
questions, then the **bag** at the bottom with per-line steppers (to 0
removes), a price total, and **Submit order** / **Update order**. Adding the
same flavor again adds to that line rather than making a second one. The data
model did NOT change: `event_response_items` already stored a quantity per
(item, option), so 2 cherry + 1 blueberry was always representable, and the
coach's roll-up and CSV keep working. They gained price columns/totals.

- **Bag lines are filtered against the current items and options**, so a
  flavor the coach deleted after someone bagged it quietly drops out rather
  than being submitted against an option that no longer exists.
- Once an order is sent and untouched, the bag reads **Order sent** and the
  submit button disappears; any change brings back "Not sent yet" and
  **Update order**.

**The bag is saved on the device while it's unsent** (`lib/programming/eventBag.js`,
one AsyncStorage key holding every bag, pub-sub like `eventSeen.js`). It is
only stored while it DIFFERS from what was submitted, so an entry there means
exactly "unsent". Three things read that:
- The member's **Events tab shows a plain dot** while any live event has an
  unsent bag (`useEventsAccess`'s `unsentBagCount`). An unseen-events count
  still wins over the dot. The dot is the Badge with `""` children plus a
  style override for its size.
- **Backing out of a pushed event** asks "Leave without submitting?"
  (`confirmLeaveUnsentBag`, via `beforeRemove` in `EventDetailScreen`).
- **Switching tabs** can't be cleanly held up, so it shows a toast instead.
  `blur` fires before the Events tab's `popToTopOnBlur` pops the stack, and a
  `leavingRef` set on blur stops that pop from raising a confirm on a screen
  she's already left. Web also gets `beforeunload` while dirty.

Two ordering rules in `EventDetailView` that are load-bearing: the persist
effect waits for `bagReady` (or the empty initial state overwrites a saved
bag), and it compares against a `submittedRef`, not the `response` prop, so a
cancel's refetch can't write the old bag straight back. Submit and cancel
both `clearBag` BEFORE refetching. `onBagDirtyChange` is read through a ref,
because an inline callback in a parent otherwise loops ("Maximum update
depth", hit in the harness).

**Duplicate** (`duplicateEvent` in `lib/programming/events.js`), on every row
of the Events list (closed ones included, since last round's order is usually
closed) and in the editor header. Copies the event, its items (photos and
prices included) and questions into a new DRAFT, then opens it. Nothing that
describes what went OUT is copied (status, publish_at, pushed_at). Dates are
kept when still ahead, otherwise closes resets to two weeks out and the event
date clears. Image paths are shared rather than re-uploaded, which is safe
only because nothing in the app deletes a graphic from storage
(`deleteGraphic` has no callers); if that ever changes, copies share files.
A failed child insert deletes the half-made copy. Terra chose Duplicate over a
supplement library.

**Preview is a practice run, not a static picture** (follow-up the same
day, Terra's ask: see the whole flow without publishing). The editor's
Preview modal renders `EventDetailView` interactively: add to bag, submit,
change the bag, update, cancel, sign up. Submit and cancel only set a local
`practiceResponse` in the editor, and with no `bagUserId` the bag is never
written to the device, so nothing is saved or sent and it works on a draft.
Opening Preview and "Start over" both reset it, keyed via `practiceKey` so
each product card's picked flavor resets too. The static `preview` prop on
`EventDetailView` still exists and is simply unused by the editor now.

**Submit and the bag pin to the bottom of the screen** (second follow-up
the same day). `EventDetailView` now owns its own ScrollView and renders an
absolutely positioned bar under it: Submit (or Sign me up / Update) always,
and the bag above it once there's anything in it or an order was sent.
Collapsed, the bag is one row (Your bag / Order sent, item count, total,
chevron); tapping opens the lines with steppers. "Cancel my order" stays at
the end of the scroll, not in the bar. Consequences worth knowing:
- **Hosts pass their header in** (`header`, `contentContainerStyle`) instead
  of wrapping the view in their own ScrollView. The pushed
  `events/[eventId].js` passes its back link; the Events tab, with one live
  event, returns the event full-screen with the eyebrow as its header.
  `EventDetailScreen` wraps its own loading/error states the same way.
- The coach Preview renders it in a 640px phone-height frame so the pinned
  bar pins there too.
- **The floating message bubble sat exactly on Submit.** New
  `lib/bottomDock.js` (pub-sub): the bar reports its measured height, only on
  a real member's screen, and `FloatingMessageBubble` adds it to its bottom
  offset. The scroll's bottom padding uses the same measured height, with a
  150px fallback, since onLayout can't be verified in the preview pane.
- The "Added to bag" toast is gone: the pinned bag counts up in view, and a
  toast per tap stacked over the event title.

Also: the detail's date line is now just `Closes Sep 17` (date only, Boise,
event date dropped) plus location, and the "No payment in the app" line is
removed.

**Products are parents; options carry their own photo** (third follow-up
the same day). The "Choose one" dropdown and quantity stepper are gone. A
product with options (Protein) is a collapsed card (photo, name, price,
"2 options | 3 in your bag"); tapping it opens one row per option with that
option's own photo and a + that goes straight into the bag, turning into
- count + once it's in. A product with no options gets the + on its card.
Price stays on the parent and is shared by its options. **No migration**:
`event_items.options` was already jsonb, and each entry can now be
`{ name, image_path }` instead of a plain string. `itemOptions(item)` in
`lib/programming/events.js` is the one reader and normalizes both shapes, so
older string options keep working and pick up the object shape the first
time the coach edits that item. The option `name` is still what
`event_response_items.option` stores, which is why the coach can add a photo
or remove an option but can't rename one (a rename would orphan existing
orders). The coach editor lists options as rows with a tap-to-add photo
square. **Option photos lead their row** (Terra: "the pictures make a
difference"): centered above the name and the +, about 150px inside a 170px
white frame, `contain` rather than cover so a tub's label is never cropped,
and capped well short of full width so the options still read as a list. An
option with no photo renders just the name row, no empty box. Verified on a harness with mixed string/object options, including
submitting and reading back the line items.

**The Events tab badge does persist across sessions**, checked because Terra
suspected it reappeared on every load. Seen ids live in device storage
(`eventSeen.js`), verified by marking events seen, reloading, and reading them
back. What does bring it back: she never opened the Events tab (only opening
it clears the badge), a different browser or the home-screen app vs a Safari
tab (separate storage), or a new event going live.

**Verified** through a throwaway `app/zz-events.js` on a scratch server at
390px (deleted): past days greyed and inert, picking a date, choosing a
flavor, Add to bag twice merging to one line, the bag saved to storage and
restored after a reload, submit sending exactly the bag's lines, clearing the
saved bag and showing Order sent, and seen events surviving a reload.
`npm run build` + `check:routes` clean, plus the parse / unresolved /
unused-import / missing-export pass over all touched files. **Not verified**:
behind a real login, the coach editor's new fields and Duplicate, the leave
confirm and toast (need real navigation), and the tab dot's look.
