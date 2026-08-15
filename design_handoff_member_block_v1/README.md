# Kova Strength — Member: block overview & the session sheet

**9 screens. Mobile, 390×844.** Built against `app/(member)/plan-block.js`,
`app/(member)/index.js` and `components/SessionPreviewModal.js`.

Two connected pieces:

1. **The block overview** — what opens behind *View full block ›* on a program
   card. Today it's a title, a date range and six rows of identical white tiles
   labelled "Session 1". It never said where she was in the block, what she owed,
   or what she'd already done.
2. **The session sheet** — what opens when she taps a session, from either the
   block page or a My Week stripe. Today that's `SessionPreviewModal`: a centred
   dialog, a flat name/detail list, and two states.

My Week itself is **not** redesigned. The hero, the program cards, the stripes
and the progress ring are working and stay as they are. One small addition is
proposed (see *Changes to existing components*).

---

## The rules this design runs on

**1. Weeks count against membership, not against what was published.**
A 3× member who trained twice reads `1 missed`. A 2× member who trained twice
reads `Complete` — even with an untouched third session on screen. The shortfall
is the number shown, never the ratio. This matches `ProgressRing`, which already
takes `target` from the membership while all three stripes render.

**2. Nothing unpublished is drawn.**
No placeholder tiles, no "your coach is still writing these". The page ends where
the program currently ends. (`published: false` today renders a dashed stripe
with a toast — on the block page it renders nothing at all.)

**3. Tiles are session numbers, never titles.**
`Session 1 / 2 / 3`, because a coach may never have titled a session and a grid
that switches between named and unnamed tiles reads as broken. The title, where
one exists, appears on the session itself.

**4. No day-of-week language on the block page.**
A session spans two days (S1 Mon/Tue, S2 Wed/Thu, S3 Fri/Sat), so a single
weekday is never true. Days live on the My Week stripe captions, where the pair
is shown. "Today" is the only day word the sheet uses.

**5. State is carried by fill and border, once.**
Olive border = logged. Dashed = still open. Clay fill = today. Plain grey =
coming. Pale red = missed. The same five readings work at week level, tile level,
exercise level and set level.

---

## Screens

### Block overview

| # | Screen | What it is |
|---|--------|-----------|
| 01 | `13a` Full block | Every week of the block, one container per week |
| 02 | `13c` Session preview | Today's session, contents only |
| 03 | `13b` Back-log | A past session that was never logged |
| 04 | `13d` Completed | Her numbers, open to correct |
| 05 | `13e` Future | Later in the block, nothing to do yet |

**13a** is the whole block, first week to last — not a rolling window. The hero
is one line (block, week, a thin bar, `9 of 18 sessions done`). Each week is a
container tinted by its status: pale olive complete, pale red short, clay for the
current week, warm grey for what's ahead. The status word sits beside the week
label — `Complete`, `1 missed`, `This week`, `Coming up`.

### The session sheet — four states

| # | Screen | Trigger | Button |
|---|--------|---------|--------|
| 06 | `14a` Today | today's session | Log this session |
| 07 | `14b` Back-log | past, no completion row | Save this session |
| 08 | `14c` Logged | past, has completion | Update this session |
| 09 | `14d` Future | week hasn't started | *(none — a line)* |

The sheet rises over My Week; the card she tapped stays visible behind it. She's
inspecting a card, not leaving the screen.

**Exercise row anatomy** (shared by the block page and the sheet): position chip,
lift name, prescription. Nothing else — no history, no last-time weights. Those
belong in the logger where she's actually comparing. Supersets are one bracketed
card with a header describing how it runs, not two rows and a label.

**Set entry** (14b): a set is a **column** — reps on top, weight beneath — with
units labelled once down the left edge rather than repeated in twelve boxes.
Tapping a box opens the number pad and moves down the column, so a set is two
taps. Empty boxes stay dashed; an unfinished set is visible without an error
state.

**Logged rows** (14c): the lift and its prescription take their own line with the
set values in a full-width row beneath, indented to the name column. This is
structural — a four- or five-set lift crushes the lift name if the sets share the
line. Sets are `flex: 1` so three or five fit the same width.

---

## Two real bugs this fixes

**Back-logging records the wrong day.** `SessionPreviewModal` offers
`Log session` for any incomplete session with no date question, so a session she
did last Thursday is recorded as today. **14b** asks the date before anything
else, defaulting to today and offering the two days behind it — never a day
ahead, since she can't have trained one yet.

**A future session can be logged.** The same two-state button appears on a
session in a week that hasn't started. **14d** removes it entirely and puts a
line where it was. Not a disabled button — a disabled button gets tapped.

---

## Changes to existing components

**`components/SessionPreviewModal.js`** — replace. Four states switched on the
session's date and its completion row, not two switched on `completed`. Same
call sites; the callers already pre-format exercises into `{name, detail}`, which
is all the row anatomy needs.

**`components/BlockGridCells.js` / the block page** — session tiles become
`Session N`, weeks become status containers, unpublished sessions render nothing.

**`app/(member)/index.js` → `SessionStripe`** — one addition: the session number
above the stripe, in the reserved label row that already exists for `TODAY`
(`S1`, `S2 | TODAY`, `S3`). Without it the stripe says `WED / THU` and the sheet
it opens says `Session 2`, with nothing shared between them. The row already has
an explicit height for exactly this kind of content, so no layout risk.

**Unchanged:** `ProgramCard`, `ProgressRing`, `SessionHero`, `QuietHero`,
`OneOffsSection`, the nutrition cards, the events teaser.

---

## Open questions

1. **A 2× member's third session** — currently shown, tappable, doesn't count
   against her. Confirm she should be able to log it as a bonus rather than
   having it hidden.
2. **A week she came up short** — pale red is used for the week container. Is
   that too strong for a member who was ill or travelling, or is the honesty the
   point?
3. **Editing a logged session's date** — 13d/14c show the date as fact with no
   edit affordance (a "change" link was removed deliberately). If a back-logged
   date can be wrong, the correction needs a home.
4. **Rest times** stay on the row (`4 × 8 | rest 2:00`) in the preview. Confirm
   they're on every prescription, not just some.

---

## Files

- `Kova Member Mobile - Directions.dc.html` — turns 13 and 14 at the top of the
  file; earlier turns unchanged
- `support.js` — runtime, required alongside the HTML
- `screenshots/` — 9 PNGs at 2×, numbered in the order above
