# Kova Strength — Coach Web Redesign

**25 screens. Desktop, 1440×900.** Built from the source in `app/(coach)/`, `components/` and `lib/`, not from screenshots.

- `Kova Coach Web - Dashboard.dc.html` — the full design file. Open in a browser, pan/zoom. Every screen carries a note explaining *why*, not just what.
- `screenshots/` — 25 PNGs at 2×, named and numbered in build order.

---

## The one idea

The old dashboard opened with six counts. The brief was that it "feels like tiles were dropped in to fill things out." Counts are a dead end when your rhythm is *session by session, whenever I get a gap* — so the dashboard became a **launchpad**: what you were last inside, then the four jobs, then a short list of what needs you.

Everything else follows from that: every screen answers *where was I* before it answers anything else.

---

## Screens

### Launchpad
| # | Screen | What changed |
|---|---|---|
| 01 | Dashboard (admin) | Resume card first, four launch cards each carrying one live number, Needs You as a short actionable list, roster demoted to a strip |
| 02 | Dashboard (coach + SPC) | Same shape, permission-shaped content |
| 03 | Dashboard (nutrition coach) | Two cards, not four padded to fill a row |

### Programming
| # | Screen | What changed |
|---|---|---|
| 04 | Group Programs grid | Cells state title / lift count / status; multi-select with a bulk action bar; block band carries readiness |
| 05 | Finalize preflight | Blockers separated from warnings, each jumping to its fix; button names the consequence |
| 06 | Session builder | One line per lift, the edited one expands; sets default to 3 with a `+`; rest as chips backed by seconds; tempo as 4 digits; warm-up a 2×3 grid of six |
| 07 | New exercise | Live duplicate check under the name; two columns; footer conditional on entry point |
| 08 | Exercise library | Usage counts, video coverage, duplicate banner as a doorway |
| 09 | Merge exercises | Own page: merge **any** two, work the suggestions, dismiss with Keep both, reversible |

### Business
| # | Screen | What changed |
|---|---|---|
| 10 | Payroll close | Review → approve/send back → close. Real categories. Close locked until every row resolves, and says what's blocking |
| 11 | Settings — staff & permissions | Permission matrix; the seven real settings tabs |

### People
| # | Screen | What changed |
|---|---|---|
| 12 | Clients roster | Every column actionable; staleness colored |
| 13 | Client detail | Your four: current/behind, nutrition + check-in, notes, limitations |
| 14 | SPC roster | Sorted by time remaining; five real statuses; coach filter |
| 15 | SPC client block | Whole block, session by session, three cell states |
| 16 | SPC session | Programmed against logged, per set |

### Nutrition client record
| # | Screen | Tab |
|---|---|---|
| 17 | Nutrition queue | (module home) |
| 18 | Onboarding | Onboarding — replaces the tabs until targets are set |
| 19 | Dashboard | Rings, weight chart, four small trends, coaching rail |
| 20 | Weeks | One row per week, opens to seven days |
| 21 | Plan | Phases + milestones |
| 22 | Check-In | Photos + targets cards, metrics, answers, game plan |
| 23 | Photos | Compare-first |
| 24 | Targets | Numbers + why they moved |
| 25 | Settings | Off the gear, onto a tab |

---

## Decisions, confirmed

**Roles.** The launchpad's cards are generated from permissions, not fixed. `Pay` is *Approve payroll* for admin, *Log my hours* for everyone else. `Run the gym` is admin-only; its slot goes to whichever module that person runs. A nutrition-only coach gets two cards.

**Seeing vs being nudged.** Any coach can see the whole roster — the coach filter defaults to All for everyone, so covering for someone doesn't need an admin. But **alerts stay scoped to their own clients**. That split is what keeps the alert list small.

**No `can_view_programs`.** Group Programs stays visible to every coach. Seeing the grid isn't the same as having a job in it.

**Undo, not confirm.** Programming is reversible. The payroll close is the one hard confirm, because it snapshots rates.

**Weight is never programmed.** You program sets and reps only. The session read-out compares reps against reps; loads are shown because they're interesting, not because they were prescribed. There is no "went heavier" — heavier than what?

**No timing.** Session duration removed everywhere.

**No interpretation.** Nothing summarizes a check-in or suggests a target change. Numeric answers diff arithmetically; text answers show verbatim. Reading them is the coach's job.

**No notification on target change.** She sees new numbers next time she opens the app. The "why" note is coach history only.

**Photos aren't policed.** A two-angle set is a two-angle set. No badges, no chasing.

---

## Data / backend notes

1. **Rest seconds** — coach-side rest must store an integer of seconds (the chips write 60/90/120/180). The member app's rest timer already expects this.
2. **PR rule** — minimum 3 logged sessions on an exercise before PR-eligible; after that any increase is a PR. Same as member app.
3. **Payroll `Other`** — a list of named types defined in Payroll → Settings, each with a rate. Some counted (qty × rate), some flat (no qty). The column sums money; entries name the type and show qty only where it exists. **The Payroll → Settings screen for managing these types is not yet designed.**
4. **Duplicate dismissals** — needs a table of "pairs kept separate" so the detector never re-suggests them; reversible.
5. **Focus snapshot** — check-ins already snapshot focus items; the Check-In tab renders them frozen. Targets are no longer snapshotted there.
6. **Onboarding phases** — order-agnostic, computed (`computeOnboardingPhases`). The Onboarding tab replaces the other tabs until first targets are set, then disappears.
7. **Photos loading** — the Photos tab must never bulk-load thumbnails. The rail is text; only the two compared images are fetched. A weekly client hits 150+ images inside a year.
8. **Trends range** — one control governs the weight chart and all four small charts. Macro rings stay pinned to 7 days regardless.

---

## Grounded in

- `lib/theme.js` — colors, fonts, the 4-tone status system
- `lib/programming/spcStatus.js` — the five SPC statuses and tones
- `lib/nutrition/rosterStatus.js` — nutrition statuses, and the active/new/other grouping
- `lib/payroll/calc.js` — payroll categories
- `lib/programming/exercises.js` — muscle groups, sub-groups, movement patterns
- `components/CoachShell.js` — sidebar, nav order, permission gates
- `components/ClientSettingsModal.js` — client settings fields
- `app/(coach)/settings.js` — the seven settings tabs

---

## Not designed

Messages · Announcements · block History · SPC templates (should reuse the session builder, saved as a template) · SPC print · Payroll → Settings (Other types) · empty/first-run states beyond onboarding.

## Known dependency

The Kova logo is a JPG (`assets/kova-logo.jpg`) and will look soft at retina sizes. A vector version is worth chasing. Icons throughout are typography and color rather than Ionicons — decide the icon set before build.
