# History: payroll

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## Payroll module — replaces the standalone Glide payroll app (2026-08-07)

Terra runs payroll for ~13 coaches out of a separate Glide app (a Google Sheet export, `Payroll and Program Tracker.xlsx`, plus screenshots, dropped into `Payroll /` at the repo root — the whole point of Kova is consolidating every gym-ops app into one login, and this is that next module). Before writing any code, the Glide export was reverse-engineered directly: its `Amt_Total` column is a computed field that doesn't survive export, so the real pay formula was rebuilt from the rate tables and verified line-by-line against a real Payroll Report screenshot (Abbi's Jul 23–Aug 5, 2026 period: Group $125, Programs $195, Admin $95.40, SPC $584, Other $287.50, Total $1,286.90 — matched to the penny) — and confirmed again against `lib/payroll/calc.js` itself via a real Node test run against the actual historical rows before trusting the code.

**Real, currently-live bugs found in the Glide data, not hypothetical ones** — all fixed by design, not just noted: (1) `CustomPayrollRequests` and `PayEntries` were two tables kept in sync by hand — a coach requests, an admin approves, then someone re-types the approved number into `PayEntries` as a second manual step. Cross-matching all 44 requests against all 44 custom pay entries found a real $200 gap: Terra's Owner Pay for the Apr 30–May 13, 2026 period was approved at $2,200 but the entry that actually got paid was only $2,000. (2) Two `OtherType` values used in real entries (`"Cleaning + BS"`, `"BWA"`) don't exist in the rate table at all — remapped to `"Cleaning"`/`"BWA Programming"` on import, treated as typos per Terra's confirmation. (3) The "1:1 Nutrition" billing tracker was fully disconnected — every row had a blank pay period, so it never fed into anyone's pay at all.

**Confirmed pay formula**: `GroupSessions×$25`, `ProgramsWritten×$15`, `AdminHours×$18`, `WelcomeSessions×$40`, `StrategySessions×$10`, `OpsHours×$23` (Ops Hours: only Lauren today, gated by the new `can_log_ops_hours` flag below). `OtherType` line items are `OtherQty (default 1) × OtherRates.rate`. SPC pay is a **flat rate per session, tiered by that session's attendee count** (0→$10, 1→$25, 2→$37, 3→$54, 4→$71), not per-attendee — capped at 4 attendees (every real historical session capped there too, confirmed before building). `Custom_Amt` is a free dollar amount bypassing every rate table.

**New `payroll` schema** (migration `0036_payroll_schema.sql`, **run and confirmed live** 2026-08-07) — `pay_periods`, `core_rates`, `other_rates`, `spc_tiers`, `pay_entries`, `custom_requests`, `nutrition_assignments`, `finalizations`. Three deliberate departures from a naive Glide port, all driven directly by Terra's own feedback on the first plan draft:

**Real bug found on the first live run, before any data existed**: `pay_entries`' RLS policies reference `payroll.finalizations` in an `EXISTS` subquery, but the file originally defined `finalizations` much later — Postgres resolves every table a `CREATE POLICY` references at creation time, so the whole migration failed partway through with `relation "payroll.finalizations" does not exist` (Supabase's SQL Editor runs a script as one transaction, so the failure rolled back everything cleanly — nothing partial was left behind). Fixed by moving the entire `finalizations` table + its RLS + the `finalize_own_period()` RPC to before `pay_entries` in the file, then wrote a small Python script to statically walk the whole migration line-by-line and confirm no other `payroll.*` object is referenced before it's defined — worth re-running that same check (see git history around this date for the script) if this migration is ever restructured again.

- **Pay periods are computed, not manually maintained.** Glide required Terra to hand-seed every period row and run a separate daily job just to flip Open/Closed — she flagged this as something to build smarter, not port as-is. `payroll.pay_periods` is keyed by the natural key `start_date` (no surrogate id, no pre-seeding) and only holds real per-period *state* (`closed`/`closed_at`/`closed_by`); every one of the ~30 real historical Glide periods lands exactly 14 days apart, so `lib/payroll/periods.js` derives any date's period from one anchor (`core.settings.payroll_period_anchor_date`, `2025-10-02`) + a fixed 14-day cadence — same "compute a recurring cycle from an anchor" pattern already used by `lib/nutrition/weekCycle.js`. `payroll.ensure_pay_period()` (security-definer RPC) lazily upserts the stub row the first time anything actually references a period.
- **The entry form filters itself per coach**, based on existing permission flags — not every coach does SPC/programming work, matching direct feedback ("only some coaches do spc, only some do nutrition, only some do programming... just to make their screen look better, we could filter some of these out"). SPC toggle+attendees and Programs Written are gated on `can_view_spc` (in the real historical data, every `Programs Written` entry's note is an SPC client name); Ops Hours is gated on a new `core.users.can_log_ops_hours` boolean (`0036`, same admin-settable-toggle shape as `can_view_spc`/`can_view_nutrition`/`can_view_exercise_library` from `0015` — mirrors Glide's per-user `Manager` flag, which today only Lauren has). Group/Admin/Welcome/Strategy/Other/Custom stay universal.
- **Every coach — not just admin — sees their own pay history**, with a period picker to look back through past periods (`app/(coach)/payroll/report.js`/`.web.js`) — direct correction after the first draft scoped this admin-only; it directly mirrors the real Glide "Payroll Report" screen shown to a coach. Admin additionally gets an "All Employees" section (the wide grid from the Glide admin screenshot — `report.web.js` renders it as a real horizontally-scrolling table; `report.js`'s native/generic fallback is a plain card list).

**Custom requests unify request + pay** (fixes hole #1): `payroll.custom_requests.pay_entry_id` links a request to the `pay_entries` row created the moment it's approved (`lib/payroll/requests.js`'s `approveRequest()`) — one action, no re-typing, no drift possible. Not a DB transaction (this codebase's established convention is plain sequential writes, not stored procedures for multi-step actions) — if the second write fails, the `pay_entries` row is harmlessly orphaned rather than the request silently staying unpaid.

**1:1 Nutrition rebuilt against real clients** (fixes hole #3), and reworked twice more from Terra's own follow-up feedback mid-session. Final shape: its own tab (`app/(coach)/payroll/nutrition.js`, shown only when `can_view_nutrition`) where a coach picks a client from a real dropdown of their own active nutrition clients (new `listClientsForCoach(coachId)` in `lib/nutrition/clients.js` — no such per-coach filter existed before) instead of typing a name, and sets a billing-day-of-month once per client (`payroll.nutrition_assignments`, no formal cross-schema FK into `public.clients` per this repo's standing convention of not FK-ing into the shared standalone-app tables — just a plain `client_id` uuid, snapshotted `client_name`/`coach_name` for the same retention reasons as everything else in this schema). The **finalize flow** (`components/payroll/FinalizeModal.js`) is where the real automation lives: it auto-detects every assignment whose billing day falls inside the current period (`assignmentsDueInPeriod()`) and requires the coach to explicitly confirm each one before it counts — "so they can't say oh I must have missed it" — with a real warning (and default-unchecked) on any client whose live `public.clients.status !== "active"`, so a paused/cancelled client doesn't quietly still generate pay. Confirmed rows become `$100` `pay_entries` (`source: "nutrition_billing"`) created atomically alongside the finalize itself.

**Finalize/lock/close — a genuinely new three-layer hierarchy, not in Glide at all** (`PayEntries.Locked` existed in the Glide schema but was never once used in 2,161 real rows). Per Terra's explicit ask ("I want a button that locks in that pay period... for audit purposes... it's not changing"):
1. **Per-coach finalize** (`payroll.finalize_own_period()`, security-definer RPC — the *only* write path for a coach onto `payroll.finalizations`, since RLS can't restrict which column a plain UPDATE touches and a coach must never be able to set their own `reopened_at` to self-unlock). Locks that coach's own entries; admin can reopen (plain table write, same "admin reopens" shape as `programming.nutrition_checkin_reopens`).
2. **Admin hard-close** (`app/(coach)/payroll/periods.js`'s "Close pay period" button, `confirmClosePayPeriod()` warns by name who hasn't finalized yet as an informed override, not a silent one) — sets `pay_periods.closed = true`. RLS enforces this as a genuine hard stop: **nobody, including admin, can write to a closed period through the app afterward** — a real post-close correction is a manual DB action outside the app, same standing precedent as every other irreversible-action decision in this codebase.
3. **Deadline reminders** — new `supabase/functions/scan-payroll-deadline-reminders/index.ts` (structured identically to `scan-spc-alerts`: `CRON_SECRET` header auth, `--no-verify-jwt` deploy, service-role client, `sendPushToUser` from the shared `expoPush.ts`) pushes any coach with no finalization yet once the deadline passes. **Superseded 2026-08-12 — see "Payroll deadline reminder was firing a week early" below for the current schedule and settings keys**; as originally built it gated on `payroll_deadline_weekday`/`payroll_deadline_time` and polled every 15 minutes. **Deployed and running**: the function is live, migration `0038_payroll_deadline_cron.sql` is run (registers the cron job, letting the function itself gate on the real deadline window, same "poll cheap, gate inside the function" shape as `announcement-scan`), and the `x-cron-secret` placeholder was filled with the real project `CRON_SECRET` before running. Worth remembering for next time a project secret needs re-checking: `supabase secrets list` only ever shows a SHA-256 digest per secret, never the plaintext (confirmed directly this session — a pasted "value" from that command turned out to be a 64-hex-char hash, not a real key, when checked against what a real VAPID/CRON secret actually looks like) — there's no way to read a secret's real value back out once set, only rotate it.

**Historical import — built as a re-runnable script, not a one-time migration**, per direct ask: Terra is staying on Glide for a while and will hand over new exports periodically. `scripts/payroll_import.py` reads the xlsx directly (`openpyxl`, same approach used to analyze the export in the first place) and emits idempotent SQL: `pay_entries` rows reuse Glide's own `EntryID` as their primary key (`ON CONFLICT (id) DO UPDATE`), so re-running against a later export is a genuine upsert, not a duplicate-insert risk. `custom_requests` has no stable id in the source data at all, so it dedupes on a composite unique index (`staff_email, pay_period_start, description, amount_requested` — `0036`) instead — a real, documented limitation (an exact duplicate request could theoretically collide and get skipped), not a guaranteed key. **Two real bugs caught and fixed before this was trusted** — one from static review, one from an actual failed run against the live project:
1. The first version of the script only attached the `ON CONFLICT` clause to the *last* of 11 batched `pay_entries` INSERT statements (2,161 rows batched 200-at-a-time) — every earlier batch would have 23505'd on any re-run. Caught before Terra ever ran it, by static file inspection. Fixed so every batch is now a fully independent, self-contained idempotent statement.
2. **`0037` actually failed on Terra's first live run**: `ERROR: 21000: ON CONFLICT DO UPDATE command cannot affect row a second time`. Root cause: 3 `EntryID`s appear **twice** in the raw Glide export itself — genuine duplicate rows (confirmed by pulling both copies directly: identical date/coach/content, only Glide's internal hidden Row ID differs), not a script bug. Since `pay_entries.id` reuses `EntryID` as the primary key, two rows sharing an id inside the *same* INSERT statement collide with each other, which `ON CONFLICT DO UPDATE` can't resolve (it only handles conflicts against rows that already existed before the statement ran). Fixed by deduping on `EntryID` during generation (keep first occurrence, log a warning for each dropped duplicate) — 2,161 raw rows → 2,158 imported. Re-verified after the fix (no live DB in this environment, so verification is static): rebuilt the batch-duplicate-id check and the SQL-comment-aware quote/paren-balance check from scratch against the regenerated file, both clean.

Real import rules applied: the `Cleaning + BS`/`BWA` typo remap, Glide's `''`-vs-`null` inconsistency normalized across every numeric column, `SPC_Attendees`' `'N/A'` string → real `null`, one orphaned pay-period reference (`pp_2022_12_25` → `pp_2025_12_25`) corrected, and **everything imported as-is including test/junk rows** (`"sms test"`, `"Test"` $50, etc.) — Terra's explicit call, full historical accuracy over cleanliness. One request row — a Strategy Session **for client Melissa Benson**, submitted by **coach Kelsie Neidner** (`krneidner@gmail.com`) — has no resolvable `PayPeriodID` at all and was skipped; flagged for Terra to re-enter by hand if still relevant. **Read that pairing carefully: the name in a request's description is the CLIENT, the email is the COACH.** An earlier session read this line as one person and reported Kelsie's 41 unattributed pay entries as belonging to Melissa Benson, who is a separate, active member with her own account and zero payroll rows. `payroll.pay_entries.staff_name` carries the coach's real name on every row — read that column, never a description or a note, before naming anyone. The 4 real rows in the disconnected `"11 Nutrition"` tab (Sam/Liza/Sarah/Lori, coach Abby) were deliberately **not** auto-imported into `nutrition_assignments` — matching bare first names to real `public.clients` rows isn't safely resolvable offline with no live DB access; Terra needs to re-add these 4 by hand through the new Nutrition tab.

`0037_payroll_seed_data.sql` **has been run against the live project** (2,158 pay entries, 43 custom requests, 23 historical pay periods).

**Access/nav**: Payroll is a normal (non-permission-gated) `CoachShell` nav item — every coach logs their own hours, unlike the optional SPC/Nutrition/Exercise Library modules — with an in-page `PayrollTabBar` (`components/PayrollTabBar.js`) connecting its 5 sub-routes (`My Entries`/`Requests`/`1:1 Nutrition`/`Report`/`Pay Periods`, the last admin-only) since `CoachShell` only ever shows one "Payroll" entry. Native reaches it via `more.js` (no permission gate, same as Messages) plus a registered `href: null` route; `app/(coach)/payroll/_layout.js` wraps the folder in a `Stack` for the same reason `blocks/_layout.js` does — without it, every nested route flattens into its own top-level native tab.

**Two real stale-closure bugs caught and fixed before this was considered done**, both the same shape: a `useFocusEffect`'s inner `useCallback` had an incomplete dependency array (`[userId]` only, or `[]`), so on refocus it read `selectedPeriod` from whichever render *first* created the closure — permanently stale — silently resetting a coach's/admin's manually-picked pay period back to the current one every time they navigated away and back to the Report or Pay Periods screen. Fixed in both `lib/payroll/useOwnReport.js` and `app/(coach)/payroll/periods.js` with a ref that's updated everywhere `selectedPeriod` changes, read inside the focus-effect instead of the closure variable.

**Fully live as of 2026-08-07** — all four migrations run in order (`0036` → `0037` → `0038` → `0039`), `payroll` added to Project Settings > API > Exposed schemas, `NOTIFY pgrst, 'reload schema'` sent, `scan-payroll-deadline-reminders` deployed, and the `payroll-deadline-reminder-scan` cron job registered with a real `CRON_SECRET`. Getting here took **three** real bugs found and fixed against the actual live project, not just in theory — the `finalizations`-ordering bug and the duplicate-`EntryID` batching bug above, plus a third caught right at the end: `0036` granted table/sequence privileges on `payroll` but never `GRANT USAGE ON SCHEMA payroll` itself, so even with Exposed Schemas checked and every table grant/RLS policy correct, every query still failed with `permission denied for schema payroll` — the exact bug class `0003_schema_grants.sql` exists to prevent for the original three schemas, missed here despite that direct precedent sitting in the same repo. Fixed by `0039_payroll_schema_usage_grant.sql` (and backported into `0036` itself so a fresh setup elsewhere won't repeat it). **Verified**: the pay formula against real historical data (Node test, matched to the penny) and a full `npx expo export -p web` (clean, zero errors, every payroll route present) after every batch of changes — standard bar for this codebase. **Confirmed working by Terra directly** (logged in and used the real thing, not just bundle-checked — same login limitation as every other feature in this file means this environment still can't do that itself) — she flagged it needs further refinement before calling it fully done, specifics not yet gathered as of this writing. Worth a follow-up pass covering: what exactly needs work (ask directly rather than assuming), the full finalize → reopen → close hierarchy end to end, and confirming a deadline-reminder push actually reaches a coach's phone.

**That follow-up happened the same week — see "Payroll redesign: tile-based entry, admin/staff view split, audit-locked closed periods" below.** The entry screen, the Report tab, the admin nav structure (this section's `PayrollTabBar`/5-sub-routes description above is now specifically the *pre-redesign* shape), and the close-period flow were all rebuilt; the rate formula, `payroll` schema, and historical import documented in this section are untouched and still accurate.

## Payroll redesign: tile-based entry, admin/staff view split, audit-locked closed periods (2026-08-08)

Direct follow-up to the "Payroll module" build above — confirmed via Terra clicking through it that it "needs further refinement before calling it fully done" (see that section's last line). This session got the specifics: the entry screen read as "a spreadsheet" she wanted made graphical, and admin had no separated view from a coach's own entries. This is a near-total UI rebuild on top of the same schema/calc layer from the original build (`lib/payroll/calc.js`'s `computeEntryBreakdown`/`computeTotals`, `lib/payroll/entries.js`'s `createEntry`/`updateEntry`, the pay-period math) — none of that needed to change, only how a coach interacts with it.

**"My Entries" rebuilt as a date-scoped tile grid**, replacing the old single flat form entirely (`app/(coach)/payroll/entries.js` is the new screen; `app/(coach)/payroll/index.js` — the old My Entries route — is repurposed as the admin mode picker below, so this isn't a rename, the two files' jobs diverged). A centered date tile at the top (MM-DD-YYYY) flanked by day-step arrows, tap the tile to open a bounded month calendar (forked from `components/nutrition/DateCalendarPicker.js`'s grid math rather than overloading its assign/unassign semantics — this one's semantics are "select an in-range date and close," with dates outside the current pay period disabled and a dot marking dates that already have entries) — dates are freely reopenable, no locking, no page-level Submit. Below: Group/Programs Written are plain +/- counters; Welcome/Strategy use the same counter but tapping the checkmark opens a names popup with N boxes (N = the counter's value); Admin/Ops Hours open an hour:minute stepper (15-minute steps, converted to decimal on save); SPC and Other are independently **repeatable per date** — each Save creates a new row rather than overwriting one, with a small numbered badge (top-right of the tile) opening a list of everything logged so far to review/edit; Custom stays single-per-date.

**Every tile's checkmark is the save action itself** — hollow while a value is uncommitted, tapping it (or, for popup-driven tiles, the popup's own Save button) commits immediately and fills it solid. No bulk "Submit" anywhere; this is what makes free date-reopening possible without a half-saved-state concept. **Superseded 2026-08-11** — the checkmark is now a pure status indicator and a single sticky Submit button per day fills them all in; `upsertCustomForDate` and the Custom tile are gone too. See "Payroll entry: day-level submit, custom pay moved entirely to Requests" below. The `pay_entries`/`partitionDayEntries` data model described in the rest of this paragraph is unchanged. **Data model, and why zero migration was needed for the repeatable SPC/Other case**: `payroll.pay_entries` already allowed one row to hold just the SPC or Other fields with everything else null, and `computeTotals` already summed across however many rows share a date — so "log a second SPC session for the same day" is simply a second row, no schema change, just a different UI flow creating multiple rows instead of one. New `lib/payroll/dayEntries.js` (`upsertCoreEntryFields`/`createSpcSession`/`createOtherItem`/`upsertCustomForDate`, all thin wrappers over the existing `createEntry`/`updateEntry`) and `lib/payroll/calc.js`'s new `partitionDayEntries(rows)` (splits one date's full row set into `{core, spcSessions, otherItems, custom}` by elimination — `core` is whichever row has null `spc_session`/`other_type`/`custom_amt`) are the only new data-access surface this needed. One real schema addition: `strategy_notes text` on `pay_entries`, mirroring the already-existing-but-previously-unused `welcome_notes` column — both now actually get written (newline-joined names) by the Welcome/Strategy popups.

**Visual**: `lib/theme.js` gained `colors.canvas = "#faf8f6"` (a real token now, not just an inline hex repeated in bottom sheets) as the background on every payroll screen. Tiles are soft peach (`#fdf6f2`/`#f0ddd2` border) while unconfirmed, sage (`#eef1e7`/`#4d6142` border) once confirmed — reusing the app's own existing peach-card and `statusColors.onTrack` tones, not new colors, per explicit "soft, matching" feedback. The checkmark itself is the exact round olive icon already shipped on My Fitness's exercise-completion cards, repositioned to half-overlap the tile's bottom edge — this needed its own small white circular backdrop behind the icon (`components/payroll/PayrollTile.js`'s `TileCheckmark`), or the tile's own border line visibly cut straight through the middle of it, caught and fixed from direct feedback ("looks ugly... needs to be behind the checkmark"). Finalize was originally a small link in the header; moved to a full-width button at the bottom of the tile grid per direct ask ("its weird where it is").

**Admin gets a fully separate mode**, not a 5th tab mixed into the staff view — landing on `/(coach)/payroll` as an admin now shows a Staff View / Admin View picker (`app/(coach)/payroll/index.js`); Staff View is the identical 4-tab experience any coach gets (My Entries/Requests/1:1 Nutrition/Report — an admin logs their own hours the same way). Admin View is a new route tree (`app/(coach)/payroll/admin/`) with its own tab bar (`components/AdminPayrollTabBar.js`): Requests/Pay Periods/Report/Settings. This is why the old admin "All employees" section bolted onto the bottom of the staff Report tab is gone — it fully duplicated what Admin View's own Report tab now does, and having both was exactly the "my report and the staff report on the same page" the ask was to eliminate. **`app/(coach)/payroll/periods.js` is deleted** — its finalize-status-list/close-button content moved to `admin/periods.js`, its rate-editing content moved to a new `admin/settings.js`.

**Closing a period now does real audit work, not just a boolean flip.** Before closing, it checks `listPendingRequestsForPeriod` — any pending custom request blocks the close outright (a hard stop, distinct from the pre-existing "N coaches haven't finalized" warning, which stays override-able). On successful close: computes Owner Pay (sum of admin-role entries) and Staff Pay (everyone else) via the existing `computeTotalsByStaff`, stores both on the period row, auto-downloads a CSV of every entry (`lib/payroll/csvExport.js` — plain string-building, no new dependency; web-only for v1, native shows a toast pointing at the web admin view since this repo has no `expo-file-system`/`expo-sharing` dependency to build a native download path on), and reveals an inline Taxes Paid field the admin can fill in any time after — the closed-periods list shows Owner/Staff/Taxes plus a live-computed Grand Total, each row expandable into that period's full per-staff report.

**Real design decision: closed periods now permanently freeze their own rates.** `pay_entries` only ever stores raw quantities (`group_sessions=3`) — dollars are always computed live from whatever the *current* rate tables say, which is exactly right for an open period (a rate change should be retroactive within it, confirmed with Terra) but wrong for a closed one, which is supposed to be locked for audit forever. New `payroll.closed_period_rate_snapshots` (one row per period, a full jsonb copy of `core_rates`/`other_rates`/`spc_tiers` captured at close time) plus `lib/payroll/rates.js`'s `getRateMapsForPeriod(periodRow)` — every report screen now routes through this instead of always calling `listAllRates()` live, so a rate edit today can never silently reprice a period that closed last month. This was flagged as a real judgment call before building (a simpler alternative — trust only the stored Owner/Staff totals, let the drill-down recompute live — would've been less plumbing but could visibly disagree with the stored total after a later rate edit) and Terra picked the full-snapshot approach explicitly.

**Rates moved to a dedicated Settings tab** (`admin/settings.js`), off Pay Periods. `core_rates`/`spc_tiers` stay edit-only (both are fixed, CHECK-constrained sets tied 1:1 to specific tiles — adding/removing one doesn't make sense without also changing the entry UI). `other_rates` gets full CRUD: Add (the first real caller of `createOtherRate`, which existed in `lib/payroll/rates.js` since the original build but was dead code until now), Edit, Archive/Restore (the existing `active` column, already filtered correctly everywhere it's read). Every rate save now goes through a new `confirmRateChange()` (`lib/confirmDialog.js`) explaining the retroactive-within-open-period behavior before it commits.

**Report tab** (`components/payroll/PayrollReportPieces.js`'s `CategoryBreakdown`) gained a real drill-down: every category row is now tappable, opening a date-sorted list of every entry that contributed to that total (new `entriesForCategory()` in `calc.js`) — this is also what backs Admin View's per-coach popup on its own Report tab (tapping a coach row opens the same `CategoryBreakdown`, scoped to their entries, nested drill-down included for free since it's the same component). Report also gained its own Finalize button with the **exact required confirmation copy** ("I've reviewed my payroll information and confirm that it's accurate to the best of my knowledge. By clicking Submit Payroll...") — this replaced `confirmFinalizePayroll()`'s previous generic wording in `lib/confirmDialog.js`, so both the Report tab's button and the pre-existing My Entries header entry point (kept, funnels through the same modal) show identical copy.

**1:1 Nutrition's add-client flow rebuilt** — the old client-picker `<select>`/pill-row was "hard to make work" per direct feedback. Now every one of a coach's nutrition clients without a billing day assigned just shows up as a plain row (name / day input / checkbox) at the top of the page; checking the box with a valid day commits immediately and the client drops into the existing assigned-roster list below, unchanged. No picker at all.

**Real native-only bug found and fixed the same day, from actual dev-server use**: the "Other" type field's native fallback (RN has no `<select>`) was a wrapping pill row of all 19 `other_rates` types — reported back as "terrible" once actually seen on the mobile dev server. Swapped for a tap-to-open modal list (`components/NativePickerField.js`, **extracted** from a near-identical local component already living in `app/(coach)/announcements/index.js`'s date/time pickers — that file now imports the shared version instead of duplicating it) — same interaction the announcement scheduler already used, just reused instead of reinvented.

**Also wires up `can_log_ops_hours`** in Settings → Team as a real toggle — the column and its gating logic existed since the original build (`0036`), but had no admin-facing UI to change it at all, same gap the original section's own text flagged. Same shape as the other three module toggles (`updateCoachPermissions` gained a 4th param, `defaultValue: false` since this one — unlike the other three — defaults off).

**Ops Hours toggle correction, worth remembering**: the Settings → Team toggle array's items now each carry their own `defaultValue` (SPC/Nutrition/Exercise Library still default `true`, matching their DB column defaults; Ops Hours defaults `false`, matching *its* DB column default) — the old code hardcoded `?? true` for every toggle, which would've been silently wrong for this one specifically.

**Migration `0041_payroll_redesign.sql`** (`strategy_notes` on `pay_entries`; `owner_pay`/`staff_pay`/`taxes_paid` on `pay_periods`; new `closed_period_rate_snapshots` table) — **written and committed, not yet run against the live project as of this writing.** Needs the usual SQL Editor run + `NOTIFY pgrst, 'reload schema'` before any of this is live.

**Verification**: `npx expo export -p web` stayed clean after every phase and after every follow-up fix (checkmark backdrop, Finalize placement, tile colors, the NativePickerField swap). The tile grid's visual design (checkmark positioning, solid-state border/badge colors) was actually screenshotted via the same documented technique used elsewhere in this file — temporarily mounting the components on the unauthenticated `login.js` screen with fake data, screenshotting through the Browser pane, reverting immediately after — not just reasoned about from code. **Not verified**: a real end-to-end click-through of the whole flow (multi-session logging, reopening a past date, the admin close/CSV/tax flow, a rate-change edit) — same standing login limitation as everywhere else in this file — and the native picker swap specifically has no simulator/device confirmation this session, worth a real check next time the dev server's in hand.

## Payroll polish pass: static tile heights, SPC/Other delete, Other field config, Finalize moved off My Entries, messaging-flicker fix (2026-08-08, later same day)

Real click-through feedback on the payroll redesign from the section above, plus one unrelated messaging bug spotted in the same pass:

- **Tile misalignment, root cause was "static size" all along**: `PayrollTile.js` used `minHeight: 108` — fine for a single tile, but two tiles side by side (Group/SPC, Welcome/Strategy, Admin/Ops) with genuinely different content heights (SPC's label+button+caption is taller than Group's label+counter) rendered at different actual heights via RN's row-stretch layout, so each tile's own `TileCheckmark` (pinned to *that tile's own* bottom edge) landed at a different vertical position — the exact bug in the screenshot. Fixed by replacing `minHeight` with a real exported `TILE_HEIGHT = 136` constant and a `height` prop (default `TILE_HEIGHT`, overridable — `PayrollCustomRow` passes `height={80}` for its shorter single-row tile) — confirmed by temporarily mounting two tiles on the unauthenticated `login.js` screen (reverted after) and screenshotting: checkmarks now line up exactly.
- **SPC (and Other) sessions are independently repeatable per date with no +/- counter to "delete by decrementing"** — there was genuinely no way to remove one. `EntryListPopup` (the badge-count "logged so far" list, shared by SPC and Other) gained a trash icon per row wired to the pre-existing-but-unused `deleteEntry`/`deleteDayEntry` (`lib/payroll/entries.js`/`dayEntries.js` — the function existed, nothing called it), behind a new `confirmDeletePayrollEntry()` in `lib/confirmDialog.js`. Also added a lighter "Delete this session/item" text button directly inside `SpcSessionPopup`/`OtherItemPopup`'s own edit view (new `SheetDeleteButton` in `PayrollBottomSheet.js`) so deleting doesn't require backing out to the list first.
- **Programs Written now matches Welcome/Strategy's names-popup pattern** — its checkmark used to just save the raw count with no names captured at all. Now opens the same `NamesListPopup` (one name box per unit counted), written to `pay_entries.program_notes` — a column that already existed in the `0036` schema (mirroring `welcome_notes`/`strategy_notes`) but was dead/unused until now.
- **"Other" line items: removed the pay rate from the type dropdown** (`PayrollOtherRow.js` — both the web `<select>` and native `NativePickerField` options used to show `"Type ($X.XX/unit)"`) per direct ask: a staff member can already see rates on their own Report tab, repeating them on the entry form was noise. **New per-type Quantity/Notes toggles** — migration `0045_other_rate_field_config.sql` (**not yet run**) adds `payroll.other_rates.has_qty`/`has_notes` (both default `true`, so every existing type keeps behaving exactly as before until an admin explicitly turns one off). Editable from two new inline checkboxes per row on Payroll → Admin → Settings' Other section (`FieldToggle` in `admin/settings.js`). `OtherItemPopup` now reads the matching `other_rates` row (passed in as a new `config` prop from `entries.js`, matched by `other_type`) and conditionally renders the Quantity field / Notes field — a type with `has_qty: false` always saves `qty: 1` without ever showing the field.
- **Custom tile's empty-state copy**: "Tap to add a custom amount" → "Tap to add a custom payroll request", per direct ask. (**Superseded 2026-08-11** — the Custom tile is deleted entirely; custom pay lives only on Requests now.)
- **Real functional bug: the "Finalize" button on My Entries actually finalized (locked) the pay period** — Terra's own words, "I was thinking that button was more of a save button." Every tile already autosaves the instant its own checkmark is tapped, so there was never anything left to "save" at the page level — removed the button and its `FinalizeModal` entirely from `entries.js` (replaced with a plain line pointing at the Report tab), leaving Finalize exclusively on the Report page's own already-existing Finalize button (`report.js`/`report.web.js`, unchanged) — which is what Terra explicitly wants: a coach has to look at the full period breakdown before finalizing, not just tap a button from the daily entry screen. **Deliberately did not add** the page-level "turns the whole background muted olive" save-confirmation Terra floated mid-message — she hedged it herself ("that might look weird though") and every tile already gives its own per-item olive-border/checkmark confirmation the instant it saves, which already covers "some sort of visual cue that says we got it." Worth revisiting if she still wants a page-wide cue after seeing this.
- **Unrelated but caught in the same pass: the "Messages" nav item flashed in and then disappeared on every single page load whenever an admin had messaging turned off.** Root cause: `CoachShell.js`'s sidebar/drawer and `app/(coach)/more.js`'s native row both defaulted `messagingEnabled` to `true` (intentionally, to avoid a flash for the common enabled case) and flipped to the real value once `getMessagingSettings()` resolved — but since `CoachShell` remounts fresh on every web page navigation, that meant the nav item genuinely appeared then vanished on every page load for anyone with it off, exactly as reported ("driving me nuts"). Fixed by defaulting both to `false` instead — same "hidden until confirmed" convention `FloatingMessageBubble`/`CoachMessageBubble`/My Week's own header chat icon already use. The one-off `app/(coach)/messages/index.js` route (shown only if the nav item's own link is followed, or a stale bookmark) still defaults `true` for its "off" message — left as-is since it's not reachable via a hidden nav item and wasn't the reported symptom.

**Verification**: `npx expo export -p web` clean (zero errors) after every change. Tile alignment fix was visually confirmed via a real screenshot (the login-screen mounting technique documented elsewhere in this file), not just reasoned about. Everything else is bundle-checked only — same standing login limitation as everywhere else in this file; worth a real click-through of the SPC/Other delete flow, the Programs Written names popup, the Other field-config toggles, and confirming the messaging nav item no longer flickers once `0045` is run.

**Same-day follow-up, two more rounds of direct feedback on this pass:**

- **Report tab's per-category drill-down now shows notes, if any were logged.** Tapping a category (Group, Strategy, Programs, SPC, Other, etc.) already opened a popup listing every date/quantity that summed to that total — it just never surfaced whichever free-text note was attached (client names for Welcome/Strategy/Programs, who-attended for SPC, a free note for Other). `lib/payroll/calc.js`'s `entriesForCategory()` gained a `CATEGORY_NOTES_FIELD` lookup (`strategy_notes`/`program_notes`/`welcome_notes`/`spc_notes`/`notes` respectively — Group/Admin/Ops have no notes concept at all, and Custom already shows its one text field as the row's own label, so neither needed an entry) and now returns each drill item's `notes` alongside its existing `quantityLabel`; `PayrollReportPieces.js`'s `CategoryBreakdown` renders it as a small italic line under the quantity, when present. **This carries over to Admin View's Report tab for free** — its per-coach drill-down (`admin/report.js`/`.web.js`) renders the exact same `CategoryBreakdown` component scoped to that coach's entries, so no separate change was needed there, confirmed by checking both files import it.
- **"Other" reworked again, per direct follow-up that the has_qty/has_notes split from the section above still felt off for quantity specifically**: "if there is a quantity its confusing... maybe to keep it the same [as notes]. If there is a qty then it appears and you can put it in. for notes, lets wait for the check box." So Quantity and Notes now genuinely diverge in interaction, not just in which fields a shared popup shows: `PayrollOtherRow.js` itself now grows an inline Quantity field (a plain `TextInput`, no popup) the instant a type with `has_qty` is picked from the dropdown — no waiting on anything. Notes are untouched: tapping the checkmark still opens `OtherItemPopup`, same as before, but **only if that type has notes configured at all** — a type with `has_qty` true and `has_notes` false now saves immediately on the checkmark tap with zero popup, since there'd be nothing left for a popup to collect once quantity's already been typed inline. `entries.js`'s new `handleConfirmOtherRow(type, qty)` is what makes that call (direct `createOtherItem` for no-notes types, `setOtherPopup({..., qty})` to still collect notes otherwise); `OtherItemPopup` gained a `hideQtyField` prop (true only for this brand-new-item-from-the-row flow, since the qty was already collected before the popup ever opens — editing an existing item via the list still shows the Quantity field there as before, since that flow has no inline field of its own to have already collected it). Visually confirmed via the login-screen mounting technique: selecting a has_qty/no-notes type shows the inline field and a console-logged direct confirm with the typed quantity; selecting a no-qty type shows no inline field at all.

## Payroll entry: day-level submit, custom pay moved entirely to Requests (2026-08-11)

Five asks from real use of the tile-based entry screen built in the "Payroll redesign"
section above. The rate formula, `payroll` schema and historical import are untouched;
this is the entry/requests UI and one new table.

**The checkmark stopped being a save button.** It used to be per-tile: tap the checkmark,
that tile writes its row. Now data autosaves as it's entered (counter tiles debounce
~600ms after the last +/- tap; the popup-driven tiles still save on their own Save), and
**every checkmark stays hollow until one sticky Submit button at the bottom of the page
fills them all in at once**. The three states are now uniform across the whole screen:
`none` = nothing entered, `hollow` = entered and saved, `solid` = the day has been
submitted. Editing anything on a day that was already submitted clears the submission
again, so a solid checkmark always describes exactly what's saved *right now* rather than
"something here was submitted at some point."

**New `payroll.day_submissions`** (migration `0051`, **run and verified live** — table,
both FKs, `unique (user_id, entry_date)`, all 4 policies, grants, and a real REST call
returning `200 []` rather than PGRST205). One row per (coach, date); its presence is the
whole signal. Deliberately leaner than the sibling `payroll.finalizations` despite looking
similar: no `staff_name`/`staff_email` snapshot and `on delete cascade` rather than
`on delete set null` (0036's convention #3 exists because pay entries/requests/
finalizations are permanent audit data — a day submission is transient entry-screen state
that gets cleared again on the next edit, and `finalizations` remains the actual audit
record), and coaches write it directly rather than through a security-definer RPC
(`finalizations` needs one so a coach can't set their own `reopened_at`; this table has no
column a coach shouldn't be able to set). Guarded on closed periods only, not on
finalization — the grid is already hidden once a coach finalizes.

**The counter autosave is the fiddly part, and the traps are worth knowing before touching
it.** `lib/payroll/daySubmissions.js` + `entries.js`:
- The debounce effect **never cancels its timer in a cleanup** — a cleanup fires on every
  dep change, which would silently drop a change rather than save it. The scheduled write
  carries its own date/period/core-row, so it still lands on the right day even if the
  screen has moved on; a separate effect flushes the previous day's pending write when the
  date changes, and `useFocusEffect`'s cleanup flushes on leaving the screen.
- `counterDate` is **state, not a ref** — on the render right after a date change the four
  counters still hold the *previous* date's values while `partition.core` is already the
  new date's, so the diff is briefly bogus. A ref set by the resync effect flips too early
  (same commit) to guard against that; state flips in the same batch as the counters do.
- `coreRowRef` tracks the freshest core row outside render state, so a debounced write
  landing between renders can't read a stale "no core row yet" and insert a **second** core
  row for the same date. Two core rows would double-count that day's pay, since
  `computeTotals` sums every row.
- `persistDay` deliberately rethrows rather than toasting — every popup calling into it
  already reports its own failure and stays open with the user's input intact. The two
  non-popup callers add their own catch.

**Other changes, all from the same feedback round:**
- SPC caption is **"Add another session"**, not "N sessions logged" — the badge already
  carries the count, and repeating it buried the one thing that wasn't obvious: a day can
  hold more than one. Same treatment on the Other row ("Pick another type above to add
  another"), whose confirm control became an explicit **Add button**, since the checkmark
  can only mean one thing on this screen now.
- The names popups (Welcome/Strategy/Programs Written) moved off the checkmark onto a
  **"+ Add names"** line that also shows what's already entered — a better affordance than
  the checkmark ever was, since it says what it opens.
- **New `components/payroll/DaySubmittedCelebration.js`** — spring-in checkmark, 18
  brand-coloured confetti pieces, a rotating message ("Locked in.", "That's in the books.",
  …), the date and the day's total, auto-dismissing after 2.6s. Built on react-native's own
  `Animated` (this app's first use of it — the only other animation, `ZoomableImage`, uses
  reanimated); each confetti piece owns its own `Animated.Value` via a child component
  since hooks can't be created in a loop. Per the explicit ask: payroll's whole worry is
  not being sure your hours landed, and a toast wasn't enough of an answer.
- **Custom pay is off the entry screen entirely** — `PayrollCustomRow.js`,
  `CustomEntryPopup.js` and `upsertCustomForDate` are deleted. Requests is now its only
  home, so a custom amount and the money it turns into can't be entered in two places.
  Requests rebuilt as phone-friendly collapsible cards (new
  `components/payroll/ExpandableCard.js`): New request / Awaiting your approval (admin) /
  Your pending / Approved / Denied, each with a count pill, defaulting open only where
  there's something to see. `hasDayData` on the entry screen counts only what its own tiles
  collect, so an approved request landing on today's date doesn't light up "Submit this
  day" for a day the coach logged nothing on.
- **"Report" tab relabelled "Pay Stubs"** — label only, route stays `/payroll/report`.
  Admin View's own all-employee Report tab keeps its name.

**Two layout bugs caught by screenshotting at phone width, which the clean bundle did
not**: tiles with a caption sat lower than tiles without one, so labels and counters
didn't line up across a row (fixed with a shared `TileLayout` pinning label to the top,
control centred, caption to a fixed-height bottom slot — same fix as My Week's
`SessionBubble`; `PayrollTile` also now always reserves the checkmark's `paddingBottom`
whether or not it draws one); and "Add another session" measured **114px in a 113.5px
box**, truncating by half a pixel — fixed by tightening tile horizontal padding from 16 to
12 rather than shortening the copy. Both were found by measuring real
`getBoundingClientRect()`/`scrollWidth` in the browser, not by eyeballing the screenshot.

**Not verified**: the confetti actually moving. The preview pane runs hidden, so
`requestAnimationFrame` never fires and every animation sits frozen at frame 0 — confirmed
the 18 pieces render with the right colours and that the interpolations are wired up, but
not that they fall. (Worth remembering generally: **any animation is unverifiable through
the Browser pane for this reason** — the card's own spring also appeared "stuck
mid-animation" across several screenshots before settling.) Also unverified: the
autosave/submit round-trip against real data, and the Requests page with real requests.

## Payroll deadline reminder was firing a week early (2026-08-12)

Terra: *"we are a week off. Its firing today, and it should be next wednesday."*
Real bug, not a misconfigured setting. `scan-payroll-deadline-reminders` gated
on `payroll_deadline_weekday` (3 = Wednesday) **alone**, with no awareness of
where the pay period actually was — so it fired on the Wednesday in the middle
of every 14-day period too, a full week before anything was due. Pay periods
run Thursday → Wednesday (the anchor, `2025-10-02`, is a Thursday), so every
period *ends* on a Wednesday and the every-Wednesday version looked plausible
right up until you noticed it going off twice as often as payroll is run.

**Fix: both reminders are anchored to the period's own boundary, never to a
weekday.** `payroll_deadline_weekday` is deleted, not just ignored. Two windows,
which by construction can never land on the same calendar day (the follow-up day
*is* the next period's first day) — that's why one `payroll_deadline_reminder_last_sent`
string (`"<periodStart>:<stage>"`) is enough to keep both idempotent:

| Stage | When | Targets |
|---|---|---|
| `final` | period's last day, ≥ `payroll_deadline_time` (20:00) | that period |
| `followup` | next day, ≥ `payroll_deadline_followup_time` (12:00) | the period that just ended |

**The follow-up's target period is the trap here.** On the follow-up day
`computePeriodStart(today)` returns the *new* period, but `finalizations` rows
are keyed by `pay_period_start` — so it has to walk back 14 days, or it would
scan a period nobody could possibly have finalized yet and remind everyone.

**Cron is hourly (`0 * * * *`), and deliberately not two fixed-time entries.**
pg_cron schedules are UTC; Boise moves between UTC-6 and UTC-7, so a fixed-UTC
cron is an hour off half the year — and an hour *early* means the function's
Boise-time gate fails and no reminder goes out at all that day. Hourly poll +
in-function Boise gate lands on the right hour year-round. A tighter
`0 * * * 4` (Thursdays UTC only) would cover both windows today but silently
couples the cron expression to the two time settings, which have no UI and get
hand-edited — rejected for that.

**Verified live**, not bundle-checked: function redeployed (v3, `verify_jwt:
false` confirmed preserved), migration run, and the cron job's own command fired
once by hand — the deployed function returned `{"skipped":true,"reason":"outside
both reminder windows","today":"2026-08-12","thisPeriodStart":"2026-08-06",
"thisPeriodEnd":"2026-08-19"}`. The two windows were also simulated across a
full period in Node before deploying. Firing a job without exposing its secret:
`do $$ declare cmd text; begin select command into cmd from cron.job where
jobname='…'; execute cmd; end $$;` then read `net._http_response` — reusable for
any `pg_net` cron job.

**Collateral worth knowing**: the old function had *no* idempotency guard at
all, so on any Wednesday past 17:00 it re-pushed every unfinalized coach on
every 15-minute poll. On the day this was found that was ~5 duplicate pushes
between 17:00 and 18:12 Boise. The new guard makes each stage fire once.

**Admin UI, same session**: new `components/payroll/DeadlineReminderCard.js`
leads Payroll → Admin → Settings (above Rates — it's short, and the Other
section below ends in a long archived list that would bury it), backed by new
`lib/payroll/deadlineReminder.js`. On/off `Switch` + both times. Deliberately
**not** added to Settings → Program Defaults, which whitelists its own four keys
precisely because rendering that shared table wholesale once corrupted unrelated
rows (see "Settings → Program Defaults was writing to every core.settings row").

- **The toggle commits on flip; the two times batch behind Save.** A half-typed
  schedule shouldn't go live, but an off switch should take effect immediately.
  The toggle is optimistic with a rollback on failure.
- **Hour granularity only (24 options), not the quarter-hour `TIME_OPTIONS`
  `settings.js` uses.** The cron polls on the hour, so offering `:15` would be a
  false promise — a 20:15 setting would really fire at 21:00. Same honesty
  reasoning as that quarter-hour list, which matches its own 15-minute poll.
- `describeNextReminders()` shows the two real dates under the pickers. Its one
  subtlety: **the first day of a period is also the follow-up day for the period
  that just ended**, so on that day the two lines legitimately describe different
  periods — returned date-sorted so it doesn't read as the follow-up preceding
  the deadline it follows.
- **Screenshot-verified** at desktop and mobile widths via the login-screen
  harness (reverted, `git diff` confirmed clean), enabled and collapsed states
  both. The unauthenticated harness also exercised the failure path for real:
  the RLS rejection surfaced the true error in a toast and the optimistic switch
  rolled back. **Not verified**: a real admin actually saving — needs a login.

## Coach payroll v1 design pass — staff screens (2026-08-14)

A handoff (`design_handoff_coach_payroll_v1/` — README + `Kova Coach
Payroll.dc.html` + 12 screenshots) restyles every payroll screen. Terra's
brief: *"keep all the functionality here, especially with the finalizing, but
i just want it to look good like the rest of the app does."* Phone-first,
because coaches log at the end of each day on a phone. **All 12 screens are
built** — staff (01-07) and admin (08-12), in that order, same session.
Nothing about how pay is calculated, submitted, finalized, approved or closed
changed — no migration, no Edge Function, no schema.

**All three of the handoff's own open questions were already answered by live
data**, checked against the database rather than assumed: `payroll.spc_tiers`
holds exactly five rows (0-4), so there is no "6 or more" tier to trim and
`SpcAttendeePicker` was already 0-4; the 0-attendee rate is a real **$10.00**,
not the `$0.00` placeholder drawn in screenshot 12; and `spc_notes` already
exists and already holds free text, so per-attendee names are newline-joined
into it with no migration, matching what `program_notes`/`welcome_notes`/
`strategy_notes` already do.

**One thing in the mock was deliberately NOT built.** Screenshot 12's rates
screen shows a "Deadline reminder — push this many days before the period
closes · [2] days" field. That setting does not exist and re-adding it would
be a regression: the reminder was rebuilt on 2026-08-12 (see that section)
because the weekday version fired a week early, and it now anchors to the
period boundary via `payroll_deadline_time` / `payroll_deadline_followup_time`
with no days-before concept. `DeadlineReminderCard` keeps its two time
pickers.

**Tile anatomy, the headline fix.** `PayrollTile` is rebuilt: label (+ count
chip) top-left, value bottom-left, control bottom-right, and one **always-
reserved** 15px caption line, at a static `TILE_HEIGHT = 112`. `TileCheckmark`
and its `paddingBottom: 28` reserve zone are gone — that floating badge, which
sat half off the tile edge on its own white backdrop circle purely so the
tile's border didn't cut through it, is what made the screen read as
unfinished. State is now carried by fill and border alone, three explicit
tones via `tileTone(state)` / `tileState(hasData, submitted)`: **empty**
(white / `#ece7e1`), **entered** (peach `#fdf6f2` / `#f0ddd2`), **submitted**
(sage `#eef1e7` / `#4d6142`, plus an inline 11px tick top-right). Both
non-empty tones already existed in the app. Measured after the rebuild: every
tile is exactly 112px and every value in a row shares a baseline **including
rows where one tile has a caption and the other doesn't** (Group/SPC, Admin/
Ops) — that mismatch was the original complaint.

**Three date mechanisms became one.** `PayrollDateNav` is now a five-day
window over the 14-day period; `PayrollDatePicker` and its bounded calendar
modal are deleted. Window rule is `clamp(selected - 2, 0, length - 5)`: pinned
at the period's start, riding the centre from day 3, drifting right over the
last two days so the strip finishes the period out rather than stranding it.
Dots carry submitted (olive) / entered (clay) state for the neighbouring days
for free.

**Sheets share one shell.** `PayrollBottomSheet` gained a grabber, an optional
subtitle (the day being edited), and a single full-width primary whose label
says what it will do (`Save 1h 30m`, `Finalize $928.50`) — previously each
sheet drew its own header and its own button, so none of them agreed. It's an
inset card rather than the member app's edge-to-edge sheet, per the mock;
still bottom-anchored and scrim-dismissed. New shared `SheetLabel` /
`SheetNameRow` / `SheetTextInput` so the names sheet and the SPC sheet can't
drift. Hours gained quick presets. **Two real interaction changes**: the names
sheet's rows ARE the count now (add a row and the tile's counter goes up,
delete one and it goes down — `onSave(joined, rowCount)`, mirrored back into
local state so the counter autosave doesn't then schedule a redundant write of
what was just saved), and SPC's 0-4 chips build that many optional name rows
with deleting a row decrementing the head count. Both verified by driving real
clicks: picking 4 built four rows, deleting one left three rows and chip 3.

**Four staff tabs became three.** `Log · Extra pay · My Pay`, equal width, no
ScrollView. `app/(coach)/payroll/requests.js` and `nutrition.js` are deleted,
merged into new **`extra.js`** with two segments — `can_view_nutrition` gates
the *segment*, so a coach without it sees Requests as the whole screen and
never an empty tab. The nutrition roster is only fetched once that segment is
actually opened. **The staff side renders no approval queue at all** now
(admins approve in Admin View → Requests, which was always the real home);
`listPendingRequests` went dead with it and was deleted.

**My Pay gets the one dark surface in the flow** — new `PayPeriodBand`
(period stepper, open/closed pill, `PAY THIS PERIOD`, the money at 38px, and a
progress bar). **The bar is elapsed period time, not days logged** — deliberate
per direct call: most coaches don't work every day, so a bar that filled with
submissions would imply a daily submit is owed and read as "behind" to someone
who simply wasn't rostered. It only renders for the period actually containing
today. `CategoryBreakdown` restyled to one hairline-divided row per category;
the drill-down popup is untouched, so the admin per-coach view that reuses it
came along for free.

**FinalizeModal is a sheet that restates what you're signing**, not a generic
"are you sure": the period in the title, every count as a line, the amount on
the button. The separate native `confirmFinalizePayroll` popup was **removed**
and its attestation copy moved verbatim into the sheet — it used to layer on
top of the modal, which meant the wording you were agreeing to only appeared
*after* you'd decided. `confirmFinalizePayroll` is deleted from
`lib/confirmDialog.js`. Also added an accurate line the old copy lacked: an
admin has to send the period back before anything in it can change.

**New `formatDateRange(start, end)` in `lib/formatDate.js`** — "Aug 6 – 19",
or "Jul 30 – Aug 12" across a month boundary. Three copies of this had
appeared in one session; `formatDateMD`'s MM/DD stays for the calendar grids,
where columns are tight. Split off the ISO string, never through `new Date`.

**A real bug the clean bundle did not catch, worth remembering as a class**:
`openEditOther` still called `setOtherListOpen` after that state was deleted
(the Other panel lists its items inline now, so there's no list popup to
close). `expo export` passed clean five times over it — **Metro does not
resolve identifiers**, exactly as this file's v5 notes warn. Found by running
a throwaway Babel `path.scope.globals` pass over every touched file; the only
other hit was `window` in `confirmDialog.js`, which is legitimately guarded.
Worth doing that sweep on any pass that deletes state or helpers.

### Admin screens (08-12)

**One grid, shared by both admin tables.** `StaffReviewRow` exports
`STAFF_WIDTH` (200) / `COL_WIDTH` / `PAY_WIDTH` (88) / `ACTION_WIDTH` (194) /
`CELL_GAP`, and `admin/closed.js`'s expanded breakdown now reuses them rather
than inventing its own — two admin tables of the same data reading
differently is worse than either being a few pixels wider. Status moved out
of the Pay column and under the staff name (with the avatar tinted to match),
which leaves Pay as money and nothing else. The review rail is a fixed
two-slot 194 = 96 + 8 + 90; a row with one action (`Waiting on Avery`,
`View note`, `Closed`) spans the full 194 rather than sitting at one end.

**Two measured deviations from the mock, both deliberate:**
- **`COL_WIDTH` is 66, not the mock's 58.** Measured in the browser: at
  9.5px bold with 0.9 letter-spacing, "PROGRAMS" renders **66px**, and at 58
  it ellipsised to `PROGRA…` (as did `WELCO…` and `STRATE…`). The mock gets
  away with 58 because a bare HTML div overflows silently; RN's
  `numberOfLines={1}` truncates instead.
- **`CELL_GAP` is 8, not 16.** The mock lays out six numeric columns
  (merging Admin+Ops into "HOURS", dropping Welcome and Strategy); those are
  real pay categories with their own rates, so all eight are kept. At gap 16
  the table came out *wider* than the version it replaces, which would have
  made the restyle a regression on the one axis that matters. At 8 it fits a
  1440 window without scrolling, and the horizontal ScrollView remains for
  narrower ones.

**A real 2px alignment bug, found by measuring rather than looking.** The
`tableWidth` formula summed the cells, the gaps and the card's 20px padding —
but not the card's own **1px border on each side**. So the row's content
needed 1090px in a 1088px box, and flex quietly shrank the one shrinkable
cell (the header/footer's staff `Text`; the rows' staff cell is a
non-shrinking `Pressable`), leaving the rows 2px right of the header and
footer. Invisible in a screenshot, obvious in
`getBoundingClientRect()`. After the fix all six Pay cells report a single
right edge and all six staff cells measure the full 200. **Worth remembering:
when a fixed-width table lives inside a bordered card, the border is part of
the width budget.**

**Requests regrouped by decision, not by period.** `admin/requests.js` split
"this period" vs "history"; a pending request from a *previous* fortnight
therefore sat under History, which is the one request that most needs
deciding — and an undecided request is also the only thing that hard-blocks
closing the period it belongs to. Now: `Waiting on you` (dark cards, three
across, amount repeated on the approve button because approving writes the
linked pay entry immediately) over a plain `Decided` table. A pending
request from another period names that period on its card; the common case
stays quiet. The Decided table shows `approved_amount` where it differs from
what was asked, since those can legitimately disagree.

**Closed periods read as receipts** — owner / staff / taxes / grand total
lead the row, with the taxes field **dashed while empty** so an unfilled
figure reads as outstanding rather than a real zero, and Save appearing only
once the value actually differs from what's stored. Expanding re-reads that
period at its frozen rates (unchanged behaviour) into the shared grid.

**Admin report: share bars replace the nine-column money grid.** That grid
needed a horizontal scroll to read and made comparing two people an exercise
in counting columns; a bar answers "who's carrying the load" with no
arithmetic, and the detail moved into a panel one click away whose category
rows still drill into individual entries. Sorted by pay, not name — bars only
read as a ranking if they're ordered. On web the breakdown is an **inline
side panel** (a sheet covers the list it's meant to be read against); native
keeps the bottom sheet, and gets the same bars. The panel also loads
`listFinalizationsForPeriod` to say whether the figure being read is approved
or still moving.

**Rates in three columns** (`RateCard`, `flexGrow/flexBasis 300/minWidth
280`), collapsing to two and then one as the window narrows — verified at
1440 and 900. The add-a-type form stacks instead of three inputs abreast
(unreadable at 300px) and hides behind the mock's `+ Add`, since adding a
type is rare next to editing one. **The mock's "push N days before the period
closes" field was NOT built** — see the deadline-reminder note above.

### Admin follow-ups from Terra's click-through

- **Admin View lands on This period, not Requests** (`payroll/index.js`) —
  reviewing and closing the open period is the job; requests are usually
  empty.
- **The table now grows with the window instead of sitting at a fixed
  width.** The ScrollView's content container is `flexGrow: 1` with
  `minWidth: minTableWidth`, so it fills a wide window and scrolls a narrow
  one; every numeric column stays fixed (the figures have to line up) and
  the staff column is the flexible one, so rows get **wider, not taller**.
  `STAFF_CELL` (`flexGrow 1 / flexBasis 200 / minWidth 200`) is spread into
  the header, every row and the footer — a fixed width on one and a flex on
  another is exactly how the grid drifts. Measured at 1600: card 1552, all
  three staff cells 620, Pay cells still on a single right edge. At 900: the
  card holds its 1132 minimum, staff back to 200, one horizontal scroller,
  page body does not overflow.
- **Closed periods' totals were showing $0.00 — real data, not a view
  bug.** `owner_pay`/`staff_pay` are written by the app's own close flow,
  and **all 22 closed periods are the historical Glide import**, closed by
  SQL rather than through the app (confirmed live: 22 closed periods, **0**
  rows in `closed_period_rate_snapshots`). So both columns are null on every
  one of them, and `Number(null) || 0` rendered that as a confident $0.00 on
  a period that plainly had entries. The Report tab looked fine because it
  computes live from entries. Now `closed.js` recomputes owner/staff from
  the entries whenever the stored value is missing — new
  `listEntriesForPeriods(starts)` fetches every period's entries in one `in`
  query, plus one `listStaff()` for the admin/coach split and one
  `listAllRates()` (no period has a snapshot, so `getRateMapsForPeriod`
  would fall back to live rates for all of them anyway). Two queries for the
  page rather than a pair per row. A recomputed row is labelled
  "recalculated from entries"; a figure that genuinely can't be derived
  shows "—", never a fabricated zero.
- **Report's dark band carries owner pay / staff pay / taxes / grand
  total.** Taxes are entered on Closed periods after a close, so an open
  period shows "—  set at close" rather than a $0.00 that would read as "no
  tax on this payroll".
- **Share bars got a category toggle, and then a second axis.** The list
  has two: `BY_COACH` (or a category key) puts one row per coach on screen;
  **`BY_TYPE` puts one row per pay type** — SPC, Group, Admin and the rest
  on the same bars as the coaches, which is what was actually wanted. Both
  read off the same `PAY_TYPES` table, once per coach for the per-coach
  views and once against the whole team's totals for by-type, so there's no
  extra query for any of it. The two axis pills sit ahead of a divider rule
  so they don't read as two more of the ten category options.
  - Picking anything re-sorts (bars only read as a ranking if ordered by
    what they draw), shows the count under the amount (a count is checkable
    in a way a dollar figure isn't), and the footer states that list's
    total. **Verified arithmetically**: the by-type rows summed to exactly
    the grand total, so they account for every dollar.
  - A pay type with nothing in it is dropped rather than carried as a
    permanent zero row; a genuine zero within a list draws no bar at all,
    as against the 2% floor used for small-but-real amounts.
  - **Tapping a type row drills into who did it** — which is exactly what
    that type's own pill shows, so the two views connect rather than sitting
    apart. In by-type mode the side panel widens to the whole team, which is
    the only place a category's entries can be read across everyone at once.

- **Two decimals, everywhere a payroll number renders.** New
  `formatQuantity` in `calc.js` sits next to `formatMoney` and handles every
  non-money figure: integers stay integers ("31", not "31.00"), a trailing
  zero is trimmed ("6.5", not "6.50"), and anything longer rounds to 2dp.
  **Not cosmetic** — 174 real imported entries carry non-quarter hours
  (0.15, 0.67, 1.08…), and summing those in floating point gives
  `10.680000000000001`, which is what a column of summed hours was actually
  rendering. Verified against the real values, not assumed. Routed through
  it: `StaffReviewRow`'s `Num`, the This-period footer, the closed-period
  breakdown, `CategoryBreakdown`'s counts, the report's bar counts, the
  Other row's `×qty`, and `calc.js`'s own `CATEGORY_LABELERS`. Money was
  already fine (`formatMoney` → `toLocaleString`), as were rate rows
  (`toFixed(2)`) and the CSV (raw stored `numeric(10,2)` values, which is
  what an export should carry).

**Not carried to native** (`admin/report.js`): the band's owner/staff/taxes
split and the share-mode toggle are web-only. Native's admin report is a
secondary surface — the handoff's own framing is that admin work happens at
a desk — and both would need a `listStaff()` fetch there for a screen that
isn't used that way. It keeps the dark total band and the share bars.

### Verification

`npx expo export -p web` clean after every batch, plus real click-through of
the staff side at 375px (tile grid in both states, day strip, all four
sheets, My Pay, finalize) and the admin side at 1440 and 900 (review table
with all four row states, approval cards, three-column rates). Done via a
**throwaway `app/zz-harness.js` route rather than mounting on `login.js`** —
safer for exactly the reason this file's teardown note gives: a top-level
route outside the auth/member/coach groups is reachable unauthenticated, and
deleting it can't leave sign-in broken. Deleted after; `git status` confirms
only intended files.

**Not verified**: anything behind a real login — standing limitation. Worth
Terra's click-through of a real day's autosave → submit → edit-clears-
submission round trip, the Extra pay merge against real requests, a real
finalize, and on the admin side a real approve / send-back / reopen round
trip and a period close.
