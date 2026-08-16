# The finalize plate — member mobile

Turn 16 in `Kova Member Mobile - Directions.dc.html` (<a href="#16a">16a</a>, <a href="#16b">16b</a>).
Screenshots in `screenshots/`.

## What this is

One screen: the full-screen moment that comes up when a member finalizes a
session. It replaces a toast. Nothing else in the app changes.

The plate carries the count — `completed / sessionsPerWeek` — and the styling
is what randomizes. That's the whole idea: the number tells the story, the
colour keeps it from going stale.

## Where it goes

`app/(member)/plan.js` has three finalize handlers — `handleFinalizeGroup`,
`handleFinalizeSpc`, `handleFinalizeOneOff`. Each currently ends with:

```js
toastSuccess("Workout finalized — nice work!");
```

That toast is the entire celebration today. Replace it with a push to the
plate screen. Nothing on My Week (`app/(member)/index.js`) is touched — no new
card, no new query, no change to the hero precedence chain.

**Un-finalize:** finalize is a toggle in `plan.js` (tap again un-finalizes).
The plate must not fire on the un-finalize branch, and re-finalizing the same
session should not re-draw a new face — store the draw with the completion.

## The plate

- 262 × 262, `border-radius: 99px`. **Not** a circle — a squircle, and the
  same shape as 12c. See "Shape" below; this bit bites.
- Radial sheen, `radial-gradient(circle at 34% 24%, <highlight>, transparent 62%)`.
- Contents, top to bottom, identical on every face: session name (8.5px/700,
  `.24em`, nowrap) → count (Protest Strike, 70px, `line-height:.9`) → 34px
  hairline rule → subline (11px, nowrap) → `KOVA STRENGTH` (7.5px/700, `.22em`).
- Below the plate, outside it: `Week 4, Day 1 · 18,400 lb` (12.5px, `#57534e`).
  A squircle can't hold a sentence, so the facts sit under it.
- One action: **Done** (54px, clay, `#a46a57`). No Save image, no share sheet,
  no prompt to post — a screenshot is what people actually do, which is why the
  plate is built to survive a sloppy crop.
- App background stays cream `#faf8f6` on every draw. Only the plate changes
  colour; randomizing the whole screen makes the app feel unstable.

## Shape — the thing that will get broken

`border-radius: 99px` is a **fixed** radius, not a ratio. On the 262px plate it
renders as a squircle. On a 150px tile the same declaration is past half the
width and renders as a full circle. Two different shapes from one line of CSS.

Keep the radius proportional at **0.38 × the box** if the plate is ever resized:

| Box | Radius |
| --- | --- |
| 262px (screen) | 99px |
| 150px (spec tile) | 57px |

## The four faces

| Face | Plate | Eyebrow | Count | Sub | Sheen | When |
| --- | --- | --- | --- | --- | --- | --- |
| Cream | `#eee9e0`, 1px `#e2ddd6` | `#a8a29e` | `#4d6142` | `#57534e` | `rgba(255,255,255,.7)` | random |
| Clay | `#a46a57` | `rgba(255,255,255,.75)` | `#fff` | `rgba(255,255,255,.82)` | `rgba(255,255,255,.18)` | random |
| Olive | `#4d6142` | `#e0b070` | `#f7f3ee` | `rgba(247,243,238,.8)` | `rgba(224,176,112,.22)` | **forced** — week closes |
| Ink | `#33251f` | `#e0b070` | `#f7f3ee` | `rgba(247,243,238,.72)` | `rgba(224,176,112,.22)` | **forced** — a best |

Rules on the hairline and wordmark follow the face: light faces use
`rgba(42,33,28,.16)` / `#a8a29e`, dark faces `rgba(247,243,238,.24)` /
`rgba(247,243,238,.5)`.

## Rules of the draw

1. Mid-week draws **cream or clay**. Never the face drawn last time — store one
   string.
2. Subline draws from the six below, never the one drawn last time.
3. **Olive is forced** when this finalize closes the week (`completed ===
   sessionsPerWeek`). Eyebrow becomes `WEEK 4 COMPLETE`, subline `Back Monday.`
4. **Ink is forced** when the session held a best, and the subline becomes the
   lift and figure (`225 × 5 Back Squat`).
5. Nothing else moves. Count, session name, week and day, volume are facts.

Two of four faces are reserved, which is the point: the plates worth keeping
are the two she can't get by accident.

**Subline pool:** Session done. · In the book. · Banked. · Work's in. ·
Another one down. · Signed off.

## The count reads against membership

`completed / sessionsPerWeek`, never against what was published — the same
house rule as the block design and `ProgressRing`. A 2× member finalizing her
second session sees `2/2` and gets the olive closer; a 4× member sees `2/4` and
keeps going. The target sums the way `index.js`'s hero already does it:
`readyGroups.reduce((sum, g) => sum + g.sessionsPerWeek, 0)` plus SPC's
`sessionsPerWeek` when ready.

## Dropped along the way

- **12f** — the plate struck mid-week on My Week, counting up. Needed a per-day
  finalized flag and a week-to-date count the finalize call doesn't return, and
  it competed with the hero's real job (what's next). Its one good idea — that
  the plate counts — survives here.
- **Progress ring around the plate.** The count already says it.
- **Save image.** Screenshot instead.
- **Session duration**, everywhere in turn 12 and 16. Not shown.

## Decided (answered in review)

**Fires on every finalize.** No throttling, no quieter mid-week variant — a 4×
member gets four plates a week and the cream/clay rotation carries it.

**Current week only.** Back-logged sessions are silent. `plan-block.js` and
`plan-spc-block.js` finalize missed sessions from the block screens — those
branches show no plate; the moment has passed. Guard on the session's own week
being the current week, not on `completed` alone.

**Extras / one-offs: no plate.** No weekly target, no denominator, nothing to
count against. `handleFinalizeOneOff` keeps the toast.

**Nutrition gets exactly one plate: 7/7.** Finalizing days 1–6 keeps today's
toast. The 7th finalized day of the week draws the plate with `7/7` — the
complete-week object only, same family, no mid-week nutrition plates.

**A best doesn't consume the week closer.** Ink can fire Wednesday and olive
still fires Friday. Different figures, different meanings; every close in the
current week draws.

### Trigger table

| Event | Plate |
| --- | --- |
| Group / SPC session finalized, current week | yes — cream or clay |
| ...and it closes the week | yes — olive, forced |
| ...and it held a best | yes — ink, forced |
| Back-logged / missed session finalized | no |
| One-off / Extras finalized | no |
| Un-finalize, or re-finalize the same session | no new draw |
| Nutrition day 1–6 finalized | no |
| Nutrition 7th day finalized | yes — `7/7` |
