# Handoff: Benchmark Day (member mobile)

## Overview

Benchmark Day is Kova Strength's quarterly self-test. Four times a year, members
test three movements — **pull ups, push ups, squats** — and place one kettlebell
per movement on a tier board to mark where they landed. Physically this happens
on a neon board in the gym; members place a plastic kettlebell with a small
number sticker on it. This feature brings that ritual into the member app.

The entry point is a single **neon button on My Week**. Everything behind that
button is neon-on-black — deliberately unlike the rest of the app, which is warm
clay and cream. Tapping it opens a board hub with the three movements; each
movement opens a card where the member places her kettlebell in the **This time**
column, keys her number onto the bell, and writes a note. Each completed movement
fires a celebration, and completing all three produces a screenshot-ready card.

There is also a **coach-side settings screen** that controls when the button
appears, when logging opens, and when it comes off My Week.

## About the design files

The files in this bundle are **design references authored in HTML** — a working
prototype of the intended look and behaviour, not production code to copy.

The task is to **recreate these screens in the Kova codebase's existing
environment**: the Expo / React Native app (Expo Router, NativeWind + Tailwind)
in the `Programming` repo, using its established components and patterns —
`components/*` primitives, the `app/(member)/*` screen conventions, tokens from
`tailwind.config.js` / `lib/theme.js`. Do not port the HTML.

Two notes specific to React Native:

- The prototype's neon look uses CSS `text-shadow` and `filter: drop-shadow`.
  RN has no `text-shadow` on Android and no CSS filters. Use `textShadowColor` /
  `textShadowRadius` (iOS), and for Android either a layered duplicate `Text`
  with opacity or an `expo-linear-gradient` / `react-native-svg` glow. Budget
  real time for this — the glow is the whole visual identity of the feature.
- The kettlebell is drawn as a tiny inline SVG in the prototype (an arc handle +
  a filled circle). In the app it should be a real asset or `react-native-svg`
  component. If the gym has a vector of the physical kettlebell, use that
  instead — it is the one place a literal illustration is correct here.

## Fidelity

**High fidelity.** Colours, type, spacing, copy and interaction states are final
and should be matched. Exact values are listed under **Design tokens** below and
every screen section quotes its literal copy.

The one thing that is *not* final: all data shown is mock. Last-benchmark values,
member name, dates and the "next benchmark" line are hardcoded placeholders.

## Screens / views

### 1. My Week — Benchmark Day button (3 states)

Lives on the existing My Week member home, in a new section above `YOUR WEEK`
with the eyebrow `THIS QUARTER`. The button is a full-width black card,
`border-radius: 22px`, `margin-bottom: 22px`. Which of the three states shows is
driven by the coach's dates (see screen 6).

**State A — Countdown** (`show from` date reached, before benchmark day)
- Border `1.5px #2a2a2a`, padding `18px 18px 17px`
- Top row: eyebrow `LABOR DAY BENCHMARK` — 9.5px/700, `letter-spacing .16em`,
  `#6fffd9`, glow `0 0 10px rgba(111,255,217,.7)`. Right: `IN 5 DAYS`
  (or `TOMORROW` at 1 day) — 9.5px/700, `.1em`, `rgba(247,243,238,.5)`
- Title `Benchmark Day` — Protest Strike 33px, `line-height 1`, `#fff`,
  glow `0 0 16px rgba(255,102,196,.55), 0 0 42px rgba(255,102,196,.3)`
- Sub `You've been training. Now let's see it.` — 11.5px, `rgba(247,243,238,.62)`
- Footer: three 4px-tall pill bars, flex `gap 7px`, in pink / orange / lime with
  a `0 0 12px` glow each — the three movements, in board order

**State B — Live** (benchmark day)
- Border `1.5px #ff66c4`, ring `0 0 0 4px rgba(255,102,196,.12)` plus
  `0 10px 26px rgba(0,0,0,.22)`, padding `18px`
- Same eyebrow. Right: `TODAY` pill — 9px/700 `.12em`, black on `#6fffd9`,
  `padding 4px 8px`, `border-radius 999px`
- Title `You vs You` — Protest Strike 36px, `#fff`, glow
  `0 0 16px rgba(255,102,196,.6), 0 0 44px rgba(255,102,196,.32)`
- Sub `Pull Ups | Push Ups | Squats` — 11.5px, `rgba(247,243,238,.66)`
- CTA row: 48px-tall `#ff66c4` bar, `border-radius 14px`,
  `box-shadow 0 0 22px rgba(255,102,196,.45)`, label `Let's Do This`
  13.5px/700 in `#12000a`, and a 34px `rgba(0,0,0,.16)` square holding `›`

**State C — Results** (after benchmark day, until the hide date)
- Border `1.5px #2a2a2a`. Right badge `3/3 LOGGED` — 9px/700, `#6fffd9`,
  `1px solid rgba(111,255,217,.45)`, pill
- Title `Benchmark Data` — Protest Strike 30px, `#fff`, no glow
- Three result tiles, `flex gap 8px`, each `height 104px`,
  `border-radius 12px`, `padding 9px 10px`, `1px solid rgba(<lift rgb>,.4)`,
  laid out `flex-direction: column; justify-content: space-between` so the three
  neon numbers land on one line regardless of label length:
  - top: lift name — 8.5px/700 `.1em`, `rgba(247,243,238,.5)`
  - middle: value — Protest Strike 26px in the lift colour, `0 0 14px` glow
  - bottom: unit — 8px/700 `.06em`, `rgba(247,243,238,.42)`
    (`SEC ECCENTRIC` / `REPS` / `REPS | 45 LB`)
- Tapping the card in this state opens the shareable card (screen 5)

Screenshot: `screenshots/01-my-week-live.png`

### 2. Board hub

Full-bleed black, `padding 46px 18px 30px`.

- Back row `‹ Benchmark Day` — 12px/600, `rgba(247,243,238,.6)`, 44px tall
- Eyebrow `LABOR DAY BENCHMARK | SEP 6` — 9.5px/700 `.16em`, `#6fffd9`, glow
- Title `Benchmark` / `Day` on two lines — Protest Strike 44px,
  `line-height .96`, `#fff`, glow `0 0 18px rgba(255,255,255,.28)`
- Sub `You vs You. Three movements.` — 12.5px, `rgba(247,243,238,.62)`,
  `max-width 300px`
- Progress: 5px track `rgba(255,255,255,.12)` with a `#6fffd9` fill
  (`completed / 3`) glowing `0 0 14px`, and `0/3 LOGGED` — 10px/700, `#6fffd9`
- Three movement cards, `#0a0a0a`, `border-radius 20px`,
  `padding 16px 16px 15px`, `margin-bottom 12px`. Border is
  `1.5px rgba(255,255,255,.13)` when unlogged and `1.5px rgba(<lift rgb>,.7)`
  once logged:
  - Name — Protest Strike 30px in the lift colour with its glow
  - Sub — 11px `rgba(247,243,238,.52)`: `4 tiers | one bell` (pull ups) or
    `2 variations | 4 tiers` (push ups, squats)
  - Right: 34px kettlebell — `rgba(255,255,255,.16)` unlogged, lift colour with
    drop-shadow glow once logged
  - Divider `1px rgba(255,255,255,.09)`, `padding-top 12px`, then status
    (11.5px/600) and action (10px/700 `.1em`, `rgba(247,243,238,.42)`):
    - unlogged: `Not logged yet` / `OPEN ›`
    - logged: `28 sec eccentric | Tier 3 | Up 1 tier` / `REVIEW ›`
- When all three are logged, a `#6fffd9` button appears: 52px,
  `border-radius 15px`, `box-shadow 0 0 26px rgba(111,255,217,.45)`,
  label `See your benchmark card` 14px/700 in `#001a13`

Screenshots: `screenshots/02-board-hub.png`, `screenshots/06-board-hub-one-done.png`

### 3. Movement card (the core screen)

Black, `padding 46px 18px 34px`. Scrolls.

**Header** — back row `‹ Benchmark Day` left, `TEST 1 OF 3` right (9.5px/700
`.12em`, `rgba(247,243,238,.42)`). Title in Protest Strike 40px in the lift
colour with its glow. Hint line 11.5px `rgba(247,243,238,.55)`.

**Variation toggle** (push ups and squats only) — eyebrow `VARIATION`, then a
segmented control: track `rgba(255,255,255,.07)`, `border-radius 14px`,
`padding 5px`, `gap 5px`. Each option `flex: 1`, `min-height 44px`,
`border-radius 10px`, 11px/700, centred, `line-height 1.25`. Selected = filled
with the lift colour and `#0a0a0a` text; unselected = transparent with
`rgba(247,243,238,.62)` text.

**Tier grid** — `display: grid; grid-template-columns: 1fr 92px 92px; gap: 9px`.
Header row: `TIER` (9.5px/700 `.14em`, `rgba(247,243,238,.42)`),
`LAST TIME` (9px/700 `.1em`, `rgba(247,243,238,.36)`, centred),
`THIS TIME` (same but `#6fffd9`). Four rows follow, each
`border-top: 1px solid rgba(255,255,255,.09)`, `padding: 11px 0`:

- **Left cell** — tier number in Protest Strike 30px, plus label (11.5px/600
  `#f7f3ee`) and sub (9.5px `rgba(247,243,238,.45)`). The number is the lift
  colour with glow when this row holds this-time's bell, otherwise
  `rgba(247,243,238,.28)`.
- **Last time cell** — if the historical bell is on this row *and* on the
  currently-selected variation: a 54px kettlebell in the lift's **dim** colour
  (no glow) with an editable number centred on the body (Protest Strike 18px,
  `#f7f3ee`), the unit caption below (8px/700, `rgba(247,243,238,.5)`), and for
  squats a load pill (`88px`, `min-height 30px`, `border-radius 999px`,
  `1.5px solid rgba(255,255,255,.2)`, number + `LB`). Otherwise: an empty
  tappable box — 56px, `border-radius 12px`,
  `1.5px dashed rgba(255,255,255,.12)`, centred `–` in
  `rgba(247,243,238,.2)`.
- **This time cell** — if the bell is on this row and variation: a 58px
  kettlebell in the lift colour with `drop-shadow(0 0 7px)` glow, the keyed
  number centred on the body (Protest Strike 20px, `#0a0a0a` — dark ink on the
  neon fill), the unit caption below in the lift colour, and for squats a load
  pill that is `1.5px dashed rgba(255,255,255,.26)` while empty and
  `1.5px solid <lift colour>` once filled. Otherwise: an empty tappable box —
  56px, `border-radius 12px`, `2px dashed rgba(255,255,255,.22)`, centred `–`
  in `rgba(247,243,238,.3)`.

**Notes** — eyebrow `NOTES`, then two blocks, both `border-radius 14px`,
`padding 12px 13px`, `background rgba(255,255,255,.03)`:
- `LAST TIME` (9px/700, `rgba(247,243,238,.36)`) — `1px solid
  rgba(255,255,255,.12)`, editable, 12px text at `rgba(247,243,238,.72)`,
  placeholder `Add a note from last time.`
- `THIS TIME` (9px/700, `#6fffd9`) — border `1.5px rgba(255,255,255,.12)`,
  becoming `1.5px rgba(111,255,217,.45)` once she types. Text `#f7f3ee`,
  placeholder `How did it feel? What's next?`, 3 rows, no resize

**Complete button** — 52px, `border-radius 15px`, 14px/700, four states:

| Condition | Label | Fill | Border | Text |
|---|---|---|---|---|
| No bell placed | `Place your kettlebell first` | transparent | `rgba(255,255,255,.14)` | `rgba(247,243,238,.38)` |
| Bell, no number | `Type your number on the bell` | transparent | `rgba(255,255,255,.14)` | `rgba(247,243,238,.38)` |
| Squats, number but no load | `Add the load you used` | transparent | `rgba(255,255,255,.14)` | `rgba(247,243,238,.38)` |
| Ready | `Mark pull ups complete` | lift colour | lift colour | `#0a0a0a`, glow `0 0 26px rgba(<rgb>,.4)` |
| Already logged | `Logged | tap a bell to change` | transparent | `rgba(111,255,217,.4)` | `rgba(247,243,238,.55)` |

Screenshots: `screenshots/03-lift-pull-ups-empty.png`,
`screenshots/04-lift-pull-ups-logged.png`,
`screenshots/08-lift-squats-load.png`

### 4. Celebration overlay

Fires when a movement is marked complete. Covers the phone, black, centred.

- A radial flash behind everything:
  `radial-gradient(circle at 50% 42%, rgba(<lift rgb>,.5), transparent 62%)`,
  animated `kbflash 1.1s ease-out` (0 → .85 opacity at 12% → 0)
- Confetti: 38 pieces, 5–12px wide, 9–21px tall, `border-radius 2px`, random
  rotation, falling 760px with 540° of spin over 1.5–2.8s with 0–0.7s stagger.
  Colours cycle the lift colour, `#6fffd9` and `#fff`. `z-index 40` — in front
  of the content — and `pointer-events: none`. Deterministic seed so the layout
  does not reshuffle on re-render
- Content block, `kbpop .55s cubic-bezier(.2,.9,.3,1)`:
  - eyebrow `LABOR DAY BENCHMARK` — 10px/700 `.18em`, `rgba(247,243,238,.55)`
  - lift name — Protest Strike 34px `#fff`
  - **the number she did** — Protest Strike 124px, `line-height .86`, lift
    colour, glow `0 0 26px rgba(<rgb>,.75), 0 0 70px rgba(<rgb>,.4)`
  - unit — 11px/700 `.16em`, `rgba(247,243,238,.5)`
    (`SEC ECCENTRIC`, `REPS`, `REPS AT 45 LB`)
- Result pill, `kbrise .5s .18s`: `max-width 300px`, `border-radius 20px`,
  `padding 10px 18px`, `1.5px solid <lift colour>`, 12px/700 in the lift colour,
  wraps to multiple lines. Text comes from the comparison rules below
- Supporting copy — 12.5px `rgba(247,243,238,.62)`, `max-width 260px`.
  `That is the training showing up.` when up a tier,
  `Same tier, and you held it. That counts.` when held,
  `On the board. Now you have something to chase.` with no prior data, and
  **nothing** on a variation move (the pill says it all)
- CTA pill: 52px, `min-width 216px`, `border-radius 999px`, `#0a0a0a` label
  14px/700 with a `›` at `opacity .55`. `Next test ›` on white between
  movements; `See my results ›` on `#6fffd9` with
  `0 0 28px rgba(111,255,217,.5)` once all three are done

The screen behind the overlay unmounts while it is up.

Screenshots: `screenshots/05-celebration-tier-up.png`,
`screenshots/07-celebration-variation-move.png`

### 5. Shareable card

Black screen with the same confetti in front. Back row `‹ Benchmark Day`, then
the card: `border-radius 24px`, `1.5px solid rgba(111,255,217,.35)`,
background `#050505`, `padding 22px 20px 20px`, `kbpop .5s` on mount.

- Header: eyebrow `LABOR DAY BENCHMARK` (9px/700 `.16em`, `#6fffd9`, glow) and
  `SEP 6, 2026 | IDAHO FALLS` (9px/700 `.12em`, `rgba(247,243,238,.42)`);
  right, the Kova logo as a 78px circle
- Member name — Protest Strike 42px, `line-height .95`, `#fff`,
  glow `0 0 20px rgba(255,255,255,.3)`
- Sub `Three tests. You vs you.` — 11.5px `rgba(247,243,238,.55)`
- Three tiles, `flex gap 9px`, each `flex: 1`, `border-radius 16px`,
  `1.5px solid rgba(<rgb>,.45)`, `background rgba(255,255,255,.02)`,
  `padding 13px 10px 12px`, centred:
  - eyebrow `PULL UPS` / `PUSH UPS` / `SQUATS` — 8.5px/700 `.1em`,
    `rgba(247,243,238,.5)`
  - value — Protest Strike 44px in the lift colour with glow
  - unit — 9px/700 `.08em`, `rgba(247,243,238,.42)`
  - An unlogged movement renders `–` in `rgba(247,243,238,.28)` with
    `NOT LOGGED` and a `rgba(255,255,255,.14)` border
- Footer, `1px rgba(255,255,255,.1)` top rule: `KOVA STRENGTH` in
  `rgba(247,243,238,.4)` and `ALWAYS IN PROGRESS` in `#6fffd9`, both
  10px/700 `.12em`
- Below the card: `Save to photos` (flex, 50px, `#6fffd9`, `#001a13` text,
  `0 0 22px` glow) and `Done` (108px, `1.5px rgba(255,255,255,.2)`)
- Then `Next Benchmark Day is New Year's Day, in 17 weeks.` — 11px,
  `rgba(247,243,238,.4)`, centred

`Save to photos` is not wired in the prototype. Implement it as a native share /
save of the card view (`react-native-view-shot` + `expo-sharing` or
`expo-media-library`).

Screenshot: `screenshots/09-shareable-card.png`

### 6. Coach settings

This one is in the app's **normal warm style**, not neon — it is an ordinary
settings screen. Canvas `#faf8f6`, title `Settings` in Protest Strike 26px,
section eyebrow `BENCHMARK DAY` (9.5px/700 `.14em`, `#a8a29e`).

White card, `border-radius 18px`, `1px solid #ece7e1`,
`box-shadow 0 4px 14px rgba(68,64,60,.045)`, rows split by `1px #f4efe9`:

| Row | Sub | Control |
|---|---|---|
| `Benchmark name` | — | `Labor Day ›` |
| `Show on My Week from` | `The button appears, counting down.` | date `Aug 25` |
| `Benchmark Day` | `Logging opens. Kettlebells go live.` | date `Sep 6`, emphasised: `1.5px solid #a46a57`, `#fdf6f2` fill, `#8a5140` bold text |
| `Hide from My Week after` | `Her card moves to history.` | date `Sep 13` |

Date controls are `min-height 40px`, `border-radius 9px`,
`1px solid #d9d4cd`, 13px/600.

Below, eyebrow `WHAT SHE SEES` and a second white card with a
`grid-template-columns: 66px 1fr` timeline, `gap 10px 12px`:

- `Aug 25` — **Counting down** — `Button shows, board is locked.`
- `Sep 6` — **Logging open** — `She places her kettlebells and keys her numbers.`
  (this row's date and title are `#8a5140`)
- `Sep 7` — **Card ready** — `Results stay on My Week, kettlebells lock.`
- `Sep 13` — **Off My Week** — `Everything logged stays in her history.`

Screenshot: `screenshots/10-coach-settings.png`

## Interactions & behaviour

**Navigation** — `My Week → hub → movement card → celebration → hub`, and
`hub → shareable card` once all three are logged. Back links return one level.

**Placing the kettlebell** — one bell per movement, ever.
- Tapping an empty **This time** box places the bell there and records the
  currently-selected variation with it.
- Tapping the box that already holds the bell removes it.
- Tapping a different box moves it and **carries the keyed number and load
  along** — she is correcting her tier, not starting over.
- The bell renders **only** on the variation it was placed under. Switching the
  toggle hides it; tapping a box on the new tab moves it there.
- Once the movement is marked complete, the bell is locked (taps and inputs are
  disabled) until she reopens and changes it.

**Keying the number** — the number sits *on the bell body*, mirroring the sticker
on the physical kettlebell. Numeric only, stripped of non-digits, max 4
characters. Squats additionally take a load in lb in a pill under the bell.

**Last time** — prefilled from her previous benchmark and **fully editable**: the
bell can be moved within the Last time column, the number and load edited in
place, and the note rewritten. This matters for the first benchmark, when there
is no history to prefill.

**Completion gate** — `Mark <movement> complete` only enables when a bell is
placed and a number is keyed (and, for squats, a load). The button label names
whichever piece is missing.

**Comparison logic** — this is the part with real product rules in it.

1. **Variation outranks tier.** Moving from the assisted variation to the
   unassisted one is a win *even if the tier went down*, because she is doing a
   harder movement. Pill copy is the whole sentence, no tier:
   - push ups: `Congrats! You moved from assisted to unassisted push ups!`
   - squats: `Congrats! You moved from an adjusted load to 50% of your body weight`
   Moving the other way reads neutral: `Back on the bands` /
   `Back to adjusted load`.
2. **Otherwise compare tiers**, and the string is always the same shape:
   `Tier 3 | Up 1 tier` · `Tier 3 | Up 2 tiers` · `Tier 3 | Held` ·
   `Tier 3 | Down 1 tier`. Pluralise `tier`/`tiers`. **No reps in this string.**
3. **No prior data** → just `Tier 3`.
4. **Not logged** → `Not logged`.

Mint (`#6fffd9`) is the "this improved" colour: a tier gain, a variation move, or
a first entry. Everything else stays `rgba(247,243,238,.5)`.

**Emphasis rule** — the number she actually did is always the hero; the tier is
supporting. This holds on the celebration, the shareable card and the My Week
results tiles. It was a deliberate call: celebrate the work, not the bucket.

**Animation** — four keyframes, all on the celebration and card:

| Name | Use | Definition |
|---|---|---|
| `kbfall` | confetti | `translateY(0) rotate(0)` → `translateY(760px) rotate(540deg)`, opacity 1 → 0 |
| `kbpop` | number, card | `scale(.6)` opacity 0 → `scale(1.08)` at 55% → `scale(1)`; `.5–.55s cubic-bezier(.2,.9,.3,1)` |
| `kbflash` | radial burst | opacity 0 → .85 at 12% → 0; `1.1s ease-out` |
| `kbrise` | result pill | `translateY(14px)` opacity 0 → settled; `.5s .18s ease-out` |

This is a deliberate exception to Kova's "motion is almost absent" rule. The rest
of the app stays calm; Benchmark Day is the one place that celebrates.

**Touch targets** — every tappable element clears 44px. The tier boxes are 56px,
the variation options `min-height 44px`, back rows 44px, load pills 30px inside a
padded column.

## State management

Per member, per benchmark event:

```
benchmarkEvent   { id, name, showFrom, benchmarkDay, hideAfter }
entry            {
  pull:  { tier: 1-4 | null, value: string, variant: 0, note: string },
  push:  { tier: 1-4 | null, value: string, variant: 0 | 1, note: string },
  squat: { tier: 1-4 | null, value: string, load: string, variant: 0 | 1, note: string },
  completed: ['pull', 'push', 'squat']   // subset, order of completion
}
lastEntry        same shape, from the previous event, editable by the member
```

Local UI state: current screen, current movement, selected variation per
movement, which celebration is showing.

Transitions: `place` sets `{tier, variant}` and keeps `value`/`load`;
`markComplete` pushes the movement key onto `completed` and opens the
celebration; dismissing goes to the hub, or to the card when `completed.length
=== 3`.

Data needs: read the active `benchmarkEvent`, read `lastEntry`, write `entry` on
every field change (autosave — there is no save button), and write `lastEntry`
when she edits the history column. Coaches read all members' entries.

Derived, never stored: the comparison string, tier counts, progress fraction.

## Design tokens

**Benchmark neon** — new to the system, sampled from the gym board:

| Token | Value | Use |
|---|---|---|
| Ground | `#000000` | every Benchmark Day surface |
| Card | `#0a0a0a` / `#050505` | movement cards / the shareable card |
| Pull ups | `#ff66c4` | pink |
| Pull ups dim | `#8c3a6b` | last-time bell |
| Push ups | `#ff9f45` | orange |
| Push ups dim | `#8c5a2a` | last-time bell |
| Squats | `#eaff70` | lime |
| Squats dim | `#7f8a3a` | last-time bell |
| Progress / win | `#6fffd9` | mint: eyebrows, gains, primary CTAs |
| Ink on neon | `#0a0a0a`, `#12000a`, `#001a13` | text on pink / mint fills |
| On dark | `#f7f3ee` | body |
| On dark muted | `rgba(247,243,238,.62)` / `.5` / `.42` / `.36` | subs, captions, eyebrows |
| Hairline | `rgba(255,255,255,.09)` | row rules |
| Dashed empty | `rgba(255,255,255,.22)` (this time), `rgba(255,255,255,.12)` (last time) | unplaced boxes |

RGB triples for glows: pull `255,102,196` · push `255,159,69` · squat
`234,255,112` · mint `111,255,217`.

**Warm tokens** (unchanged, from the existing system) — canvas `#faf8f6`,
surface `#ffffff`, tint `#fdf6f2`, ink `#44403c` / `#57534e` / `#78716c` /
`#a8a29e`, line `#ece7e1` / `#f4efe9` / `#d9d4cd`, clay `#a46a57`, clay-on-white
`#8a5140`, olive `#4d6142`.

**Type** — two faces, same as the rest of the app.
- **Protest Strike**: numbers and titles only — 124px (celebration hero), 44px
  (hub title, card tiles), 42px (member name), 40px (movement title), 36/33/30px
  (My Week button titles), 30px (tier numbers, hub card names), 26px (results
  tiles), 20/18px (numbers on the bells)
- **Montserrat**: 14px/700 (buttons), 13.5px/700 (settings rows), 12.5px/12px
  (body), 11.5px/600 (tier labels, statuses), 11px/700 (pills), 10px–8px/700
  with `.06–.18em` tracking (eyebrows and captions)

**Radii** — 38px phone frame · 24px shareable card · 22px My Week button ·
20px hub cards and result pill · 18px warm cards · 16px card tiles · 15/14px
buttons · 14px note blocks and variation track · 12px tier boxes and result
tiles · 10/9px controls · 999px pills

**Spacing** — screen padding `46px 18px 30px` (neon) / `46px 20px 24px` (warm);
grid `gap 9px`; card gutter `12px`; tier row `padding 11px 0`.

**Glows** — text: `0 0 10px` (small eyebrows), `0 0 14px` (numbers at 26–44px),
`0 0 16–20px + 0 0 40–44px` (titles), `0 0 26px + 0 0 70px` (the 124px hero).
Fills: `0 0 22–28px rgba(<colour>,.4–.5)`.

## Assets

- `assets/kova-logo.jpg` — the existing repo logo, used as a 78px circle on the
  shareable card and a 34px circle in the My Week header. No vector exists.
- **Kettlebell mark** — drawn inline in the prototype as an SVG arc handle
  (`M8.2 8.4a3.9 3.9 0 0 1 7.6 0`, `stroke-width 2.4`, round cap) over a filled
  circle (`cx 12 cy 15.2 r 6.6`) on a `0 0 24 24` box. Replace with a real
  asset if one exists.
- No icons are used in this feature; `›` and `‹` do the navigation work, as
  elsewhere in the app.
- Fonts: Montserrat and Protest Strike, already loaded in the app via
  `@expo-google-fonts/*`.

## Files

- `Kova Benchmark Day.dc.html` — the prototype. Two frames side by side: the
  member flow (interactive — click through it) and the coach settings screen.
  The movement data, tier definitions, mock history and all comparison logic
  live in the `<script>` block at the bottom (`LIFTS`, `LAST`, `deltaFor`).
- `support.js` — runtime needed to open the prototype in a browser.
- `assets/kova-logo.jpg` — logo referenced by the prototype.
- `screenshots/` — the ten screens listed above.
- `board-reference.png` — the gym's physical Benchmark Highlight Board, the
  source of the tier structure and the neon palette.

Open `Kova Benchmark Day.dc.html` directly in a browser. It is interactive:
place bells, key numbers, complete movements, see the celebrations and the card.
