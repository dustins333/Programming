# CCrew (Committed Crew) — spec

**Status as of 2026-08-19: fully specified, nothing built.** Every rule below was
decided by Terra in conversation and validated against 22 months of real data. A
build session should not need to re-ask any of it. Open items are listed at the end.

## What it is

Each month Terra exports attendance from Kilo, works out who attended at least 80%
of the sessions their package commits them to, and puts those names on Canva slides
for the in-gym signage. She also tracks how many months each person has made it.
Today that lives in Google Sheets and the expected-sessions-per-week number is typed
in by hand.

This moves the whole thing into the coach web app. **Kilo remains the source of truth
for attendance** — see "Why not compute from Kova" below.

Called **CCrew** in the UI ("Committed Crew" is too long for a nav item).

## Source data: the Kilo export

A CSV Terra downloads from Kilo for a date range. Columns:

```
Full Name, Current Status, Email, Phone,
Class Attendance, Class Reservations,
Appointment Attendance, Appointment Reservations,
Imported Event Attendance, Imported Event Reservations,
Total Attendance, Total Reservations, Current Packages
```

- **Use `Total Attendance`.** Reservations are unreliable (people get checked in
  without reserving — Callie White: 12 attended, 4 reserved).
- File is UTF-8 **with BOM** — read as `utf-8-sig` or the first header key is mangled.
- `Current Packages` is `;`-separated in the current export. Historical files vary:
  2025 uses `,`, 2024 uses `,` and ` and `. A backfill parser must handle all three.
  Trailing separators and empty tokens occur.
- Terra pulls **calendar months, 1st to last day**, and runs it on the 1st or 2nd of
  the following month. The range never includes the new month's dates.

### Gotcha: packages are current, not historical

Kilo returns **packages as of export time** regardless of the date range requested.
Rita Cabrera was `Hybrid - 1 SPC 2 Class` during July but exports today as `LLYL`.
Because Terra runs the export within a day or two of month end the drift is small,
but **the app must freeze the package string and the computed target onto the period
record at upload time** and never recompute a closed month from current packages.
Her spreadsheet already does this by pasting the package column into each month tab.

## The rules

### 1. Package → expected sessions per week

| Package | Expected |
|---|---|
| `Group Strength 1x per week` | 1 |
| `Group Strength 2x per week` | 2 |
| `Group Strength 3x per week` | 3 |
| `Semi Private Coaching 1x per week` | 1 |
| `Semi Private Coaching 2x per week` | 2 |
| `Semi Private Coaching 3x per week` | 3 |
| `Hybrid - 1 SPC 1 Class` | 2 |
| `Hybrid - 1 SPC 1 BWA` | 2 |
| `Hybrid - 1 SPC 2 Class` | 3 |
| `Better With Age` | 2 |
| `LLYL` | 3 |
| `Conditioning` | 1 |

**Never a commitment — ignored when computing the target:** `Kova Event`,
`BWA Event`, `Team Lift`, `Nutrition coaching`, `Foundations`, `Online Training`,
`Program Test`, `Nutrition - Advanced` (2024 only).

An unrecognised package token must be **flagged in the upload preview**, never
silently ignored — new packages appear (LLYL did) and a silent zero would quietly
make someone ineligible.

### 2. Take the MAX, never the sum

A person's target is the **highest** expected value across their commitment
packages. Evidence: Kaisa McNamara had `Group Strength 2x` + `Semi Private 1x` and
Terra used 2. Janet Shepherd had `Hybrid - 1 SPC 1 BWA` + `Group Strength 1x` → 2.
Banesa had `Group Strength 3x` + `Group Strength 2x` (a stale duplicate) → 3.

Summing is wrong and produces garbage. This also applies to Kova memberships in
Phase 2 — a client can hold several and there is no primary.

### 3. Eligibility

**Target must be ≥ 2.** Anyone whose best package resolves to 1 is not eligible,
no matter how often they attend. Consequences Terra has confirmed as intended:

- 1x/week members can never make CCrew.
- `Conditioning`-only members can never make CCrew (Cristin Ellis).
- `Foundations`-only and `Online Training`-only members are ineligible.
- Someone with no commitment package at all is ineligible.

### 4. Threshold

```
qualified  =  attendance / (expected_per_week * 4)  >=  0.8
```

**The 4 is a flat constant, not the real number of weeks in the month.** This is
deliberate and must not be "fixed": switching July 2026 to its true 4.43 weeks drops
17 of 89 people off the wall. In a 31-day month the effective bar is ~72%. Terra
knows and wants it.

Bar is `>= 0.8` exactly. In practice: a 2x member needs 7 sessions (7/8 = 0.875;
6/8 = 0.75 fails); a 3x member needs 10 (10/12 = 0.833; 9/12 = 0.75 fails).

### 5. Staff get a 2x floor

Staff are measured against **2x/week regardless of their package**. So a staff member
on a 3x package qualifies with 7 sessions where a regular member would need 10.

**Staff are identified by `core.users.role in ('coach','admin')` in Kova** — not by
Kilo's `Current Status` or the `Team Lift` package, both of which are wrong at the
edges (Terra is a paying `Member`; Banesa holds `Team Lift` and *is* a coach). Kova's
role list correctly covers all 9 people who ever needed the leniency across 22 months.

**Upload preview must flag the disagreement**: someone marked `Non-Paying Member` or
holding `Team Lift` in Kilo who is *not* staff in Kova. That catches a newly hired
coach who hasn't been given a Kova account yet, instead of silently judging them at 3x.

### 6. Output grouping

Two groups — **3x** and **2x** — each sorted alphabetically. A person is placed in
the group of the **highest tier they actually cleared**, not their package. So a
staff member on a 3x package who only cleared 2x is listed under 2x.

Delivery for now is a **copy-paste block** (not CSV, not Canva automation).

### 7. Eligibility edge cases

- **Mid-month joiners**: no proration. They simply won't make their first month.
- **Cancellations**: Kilo's export only contains active members, so someone who
  leaves drops out of the next export by itself. **Keep their history, mark them
  inactive** — do not delete. If they return, their months are still there.

## Identity

**Email (lowercased) is the key**, not name. Names change and the historical sheets
are name-keyed, which would silently start a fresh streak.

A **manual match table** is required, taught once and remembered forever. At least
one match is needed on day one:

| Kilo | Kova |
|---|---|
| `tmarjonen1@gmail.com` (Terra Smout) | `terra@kovastrength.com` |

Only **27 of 139** people in the export have a Kova account at all, so most CCrew
records are name+email only with no linked user. That is fine for the wall; app
features (push, member-facing display) light up per person as they register.

## Streaks

Three numbers per person:

- **Lifetime months** — total ever, never resets in January (the sheets were built
  per-year; Terra wants lifetime).
- **Current streak** — consecutive months ending at the most recently processed
  month. A single qualifying month is a streak of **1**, not 0. Missing the most
  recent month makes it **0**.
- **Best streak** — longest run ever, kept so one missed month doesn't erase history.

**Lead with lifetime months, streak second.** 18 people currently sit on a streak of
exactly 1, including Lisa Allen (21 lifetime months, missed one month in 22), Callie
White (19) and Danielle Hinkson (18). A card showing only the streak would make the
gym's most consistent members look like beginners.

## Backfill

22 months, **October 2024 – July 2026**. Google Sheets are link-accessible with no
auth; export with `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx`.

| Year | Doc ID | Tabs | How to read |
|---|---|---|---|
| 2024 | `1Kir7Mmtyrn4TYMYayBau_GSmA76hQFGlfBPF_xEYdkE` | `Oct Committed Crew`, `Nov Committed Crew`, `" Dec Committed Crew"` (leading space) | **Full roster — apply the rule** |
| 2025 | `1b2FXO_W65a8HpHJUvoOvfT4Zt2JJ7BDbArc3q2p2Zy4` | 12 month tabs | Already filtered — membership = qualified |
| 2026 | `1fzdS4pnatgs4Cqp914NBahH9U3bV6EZ7H1Yf-qlFqwo` | Jan–Jul (Aug–Dec empty) | Already filtered — membership = qualified |

**The three years are NOT read the same way.** 2025/2026 tabs are the finished crew
lists. The 2024 tabs are the raw roster — ~120 rows each with roughly half below 80%
— so the threshold and staff rule must be applied. Taking 2024 at face value inflates
streaks badly (it wrongly credited 4 extra people with history and gave Kelsie
Neidner two months she scored 0.5 and 0.75 on).

2024 column layouts differ **per tab** (1-indexed offsets from column B):

- `Oct Committed Crew`: name, attendance, expected, ratio, packages
- `Nov Committed Crew` and `" Dec Committed Crew"`: name, attendance, packages, ratio, expected

Ignore every other tab in the 2024 doc (`Template`, `Master`, `Nov #1`, `Nov #2`,
`Dec #1`, `Dec #2`) — an unrelated biweekly experiment.

2025/2026 month tabs: columns A–E = name, attendance, packages, expected, ratio.
The ratio column holds hardcoded values, not formulas, and contains typos (see below).

### Backfill rules

- **Only import history for people on the current live roster.** 89 historical names
  belong to former members and are dropped entirely.
- **Merge** (spelling drift): `Ashley Mullet` → `Ashley Mullett`,
  `Janet Shepard` → `Janet Shepherd`.
- **Do NOT merge — confirmed different people:** `Kelsey Neidner` ≠ `Kelsie Neidner`
  ≠ `Missy Neidner` (all three appear on the October 2024 list simultaneously with
  different attendance), `Donna OKelly` ≠ `Donna Powell`, `Julie Martin` ≠
  `Lorie Martin`, `Elaine Miller` ≠ `Diane Miller`, `Karen Bauer` ≠ `Kathren Butler`,
  `Amanda Thompson` ≠ `Angie Thompson`.
- **Two typo'd rows import as qualified**: Terra Smout Aug 2025 (ratio cell reads
  0.00) and Jan 2026 (reads 0.08). Both are 12 attendance against a 3x target = 1.00.
- **One genuine exception imports as qualified**: Abby Thompson July 2025, 6 sessions,
  which fails even at the staff 2x bar (0.75). Terra put her on the wall. Import it
  as-is; do not loosen the rule for anyone else.

### Expected result

- **123 of 139** live members have history. Median 10 months.
- **Five perfect 22/22 records** (Top Dogs): Amanda Smout, Bernadette Sessions,
  Kristan Alford, Michelle Dodge, Sarah Cunningham.
- Current-streak distribution: 39 at 0, 18 at 1, 26 at 2, 5 at 22.

If a build run produces materially different numbers, something is wrong.

## Validation already done

Replaying July 2026 from raw attendance + that month's package strings through the
full ruleset reproduces Terra's actual list **89 out of 89, with zero false positives
and zero false negatives.** The lowest attendance on her list is exactly 7, which is
the precise minimum to clear a 2x target — her manual ≥7 cut and the rule agree.

Any change to the rules should be re-checked against this replay.

## Phase 1 — what to build

1. **Upload screen.** Take the Kilo CSV plus an explicit period (month). Parse
   packages, compute targets, apply the rules.
2. **Preview before commit.** A table of everyone with attendance, target, percentage
   and in/out — with flags for: unrecognised package tokens, two conflicting
   commitment packages on one person, Kilo-says-staff-but-Kova-doesn't, and emails
   that don't match a Kova account. Terra resolves flags, then commits.
3. **Store the period**: per-person attendance, frozen package string, frozen target,
   qualified yes/no, and the tier cleared. Never recompute a closed month.
4. **Backfill** the 22 historical months per the rules above.
5. **Output**: copy-paste block, 3x group then 2x group, alphabetical within each.
   Plus the Top Dogs (perfect-record) list broken out separately — Terra wants it
   even though she hasn't decided what it's for yet.
6. **Access**: every coach can view. Upload/commit is presumably admin — confirm.
7. Re-uploading a month should overwrite with confirmation.

## Phase 2 — reconcile against Kova

Once more of the roster is in Kova, the upload also compares Kilo's packages against
Kova's own memberships and reports disagreements. It would already have caught Roxy
Franco (Kova says 3x, Kilo says 2x) and stale `Trial Group` enrollments on Abbi and
Banesa.

This needs a **primary membership** concept in Kova, which does not exist today —
since multi-membership (migration 0010) a client can hold several, each with its own
`sessions_per_week`, and there is no way to say which one is their real commitment.

## Phase 3 — member-facing and notifications

**Not urgent: exactly 1 person in the whole roster has a push token today.** This is
a reason to finish the GHL import before building it.

Agreed design:

- **Made it** → shared announcement popup + a **personalized push** carrying their
  own streak. A shared announcement body cannot contain a per-person number; the
  nutrition check-in reminder already does exactly this split (one shared announcement
  row, personalized push text per user) — follow that pattern.
- **Near miss (within 2 sessions)** → **push only, no popup.** A modal that interrupts
  someone to say they didn't make it is a worse experience than a dismissible notification.
- Announcements are currently targeted by program (`all` / `group_program` / `spc` /
  `nutrition`). A "specific list of users" targeting mode does not exist and will
  need adding.

**Member display — still open, see below.** The one firm rule: **never show a live
progress bar.** The data is up to 30 days stale, so "9 of 12 this month" is a lie on
every day except the 1st. A backward-looking count is always true.

## Why not compute this from Kova's own logged sessions

Tempting — real-time, no upload. Don't, at least not for the award.
`programming.session_completions` records who tapped Finalize, not who walked in the
door. Computing CCrew from it would put people on a wall in the gym based on app
usage; someone who trained 14 times and logged 6 would be publicly left off.

Where Kova's numbers *are* useful is coach-side, shown next to Kilo's:
**attended 14 / logged 6** tells Terra exactly who needs help with the app.

## Still open

1. **Member-facing display.** Terra wants it, shape not finalised. Proposed and not
   yet confirmed: a third card on the History tab next to logged sessions and streak,
   reading lifetime months first and streak second, tapping through to a month-by-month
   breakdown; plus a trophy keyed off the current streak with a floor of 3+ so it
   stays meaningful. Terra's words: *"a little graphic somewhere? Almost like an
   achievement? A trophy if you will."*
2. **Who may upload/commit** — all coaches can view; admin-only for the upload itself
   is assumed but unconfirmed.
3. **Canva automation** — deferred. A Canva connector exists and brand-template
   autofill from the committed list is feasible, but copy-paste is the ask for now.
