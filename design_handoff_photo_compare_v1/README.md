# Photo Compare — rework handoff v1

Replaces the current peach three-up compare card. Artboards live in
`Photo Compare.dc.html` (turn 4 = align flow, turn 3 = the chosen card, turns 1–2 = rejected
explorations, kept for reference).

**Chosen direction: `3b Chop`.** Espresso ground, photos flush, mark stamped bottom-right,
the number as the hero. `share-card.png` is the render at export size.

---

## Why the old one read flat

Four things, in order of impact.

1. **The peach ground fought the photos.** Warm hallway light on a warm pale panel goes muddy —
   nothing separates subject from surround. Espresso does the opposite: the photos become the
   only light in the frame.
2. **Uneven frames.** The three photos had different widths and crops, so the row read ragged.
   Fixed identical cells + `object-fit: cover` fixes it with no photo editing.
3. **The number was a footnote.** `-4 lb / TOTAL CHANGE` at ~20px in a white slab. It is the
   entire reason someone posts this. It is now 132px.
4. **The white bar at the bottom was dead weight** — a UI element on something meant to be a
   poster.

---

## The card

**1080 × 1080** for three photos. Fixed height, `overflow: hidden`.

```
ground     #241a15
           + radial-gradient(118% 76% at 50% 0%, #3d2a21 0%, #241a15 64%)
```

Vertical stack, `display: flex; flex-direction: column`. **The cell aspect ratio is the source of
truth** — the band height derives from it, and the footer takes what is left via `flex: 1`.
Heights below are measured off the built card, not authored:

| Band | Measured height | Padding |
| --- | --- | --- |
| Header | 105 | `46px 44px 32px` (one 22px/700 line) |
| Rule | 1 | — |
| Photos | 679 | 0 (full bleed) |
| Rule | 1 | — |
| Footer | 294 (`flex: 1`) | `26px 44px 34px` |

Band is 679 rather than 676 because at 1080 wide with two 4px gaps the real cell width is 357px,
and `aspect-ratio: 356/676` resolves to 678.5. Do not hard-code 676 as a height — set the aspect
and let it resolve.

Rules are `rgba(247,243,238,0.13)`.

### Photo band

`display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px`. Each cell:

- `aspect-ratio: 356/676`, `background: #1b120f`, `overflow: hidden`
- `<img>` at `width/height: 100%; object-fit: cover`
- label scrim, absolutely positioned bottom, `padding: 104px 24px 24px`,
  `linear-gradient(to top, rgba(20,13,10,0.9), rgba(20,13,10,0.34) 55%, transparent)`
- date: Montserrat 700 / 29px / `#f7f3ee`
- weight: Montserrat 400 / 21px / `rgba(247,243,238,0.68)`
- no weigh-in: same slot, `rgba(247,243,238,0.55)`, soft copy (`week 1`) — never leave it blank,
  a hole in the row is what made the original caption line look broken

### Footer

`flex: 1`, `align-items: flex-end`, `justify-content: space-between`.

Left:

- delta — **Protest Strike 132px**, `#c9dbb4`, `line-height: 0.86`, `letter-spacing: -2px`
- unit `LB` — Protest Strike 38px, `rgba(201,219,180,0.6)`, baseline-aligned
- the math — Montserrat 700 / 16px / `letter-spacing: 2.6px` / `rgba(247,243,238,0.45)`,
  reading `183.2 → 179.2 LB`

Right: `5` in Protest Strike 40px cream over `WEEKS` in Montserrat 700 / 14px /
`letter-spacing: 2.2px` / `rgba(247,243,238,0.38)`.

### The mark

`kova-mark-cream.png` (from your `kova-logo.jpg`, luminance inverted to alpha, tinted `#f7f3ee`).
124px, centred in a 150px disc at `rgba(20,13,10,0.34)` with
`box-shadow: 0 3px 16px rgba(20,13,10,0.34)`, inset 24px from the bottom-right of the photo band.

The disc is not decoration — the mark is cream line art and the bottom-right of a photo can be
anything. Without it the logo vanishes over a light floor. `kova-mark-espresso.png` is the
same mark for light surfaces.

---

## Photo counts

Cells stay portrait; the grid reflows and the card height follows.

| Photos | Columns | Card | Cell | Status |
| --- | --- | --- | --- | --- |
| 2 | 2 | 1080 × 1350 | `538/766` | built (see `2c`) |
| 3 | 3 | 1080 × 1080 | `356/676` | **built — this is the spec** |
| 4 | 2 × 2 | 1080 × 1350 | `538/560` | derived, not built |
| 5–6 | 3 × 2 | 1080 × 1526 | `356/509` | built at 6 (see `2c`) |

Only the 3-photo card has been through a full pass. The 4-photo row is arithmetic, not a
verified layout — build it and check the footer before shipping. Note also that the counts shown
in turn 2 carry the older header treatment (logo in the header, 150px tall) rather than 3b's
text-only 105px header; re-derive the footer height when you port them.

Front / side / back are separate cards, one view per card. Do not mix views in one grid — the
guides are meaningless across views and the row reads as a mistake.

---

## Data rules

**The delta is computed from the selected photos, not from the account.**

```
weighed   = selected photos that have a weigh-in, in date order
delta     = weighed.last.weight - weighed.first.weight
caption   = `${weighed.first.weight} → ${weighed.last.weight} LB`
```

- Fewer than two weighed photos → hide the whole delta block and let the photos carry the card.
  Do not fall back to account-wide weights; that is what made the old card claim `-4 lb / 5 weeks`
  when the -4 covered 13 days.
- Photos without a weigh-in still appear. They contribute an image, not a number.
- `WEEKS` currently spans the **photos** (Jul 27 → Aug 31 = 5), while the delta spans the
  **weigh-ins** (13 days). See open questions.

---

## Alignment guides

Three hairlines across the photo band, as a percentage of band height:

| Guide | Position | Colour |
| --- | --- | --- |
| Crown | `7.895%` | `rgba(247,243,238,0.5)` |
| Waist | `51%` | `rgba(201,219,180,0.85)` |
| Floor | `100%` | `rgba(247,243,238,0.5)` |

Each line is 1px with `box-shadow: 0 1px 0 rgba(20,13,10,0.4)` so it reads over both a pale wall
and dark shorts. Labels are espresso pills, `rgba(20,13,10,0.55)`, Montserrat 700 / 14px /
`letter-spacing: 1.6px`.

Ship this behind a toggle, default **off** for sharing and **on** in the app. Guides are only
honest on aligned photos — on raw ones the lines cross her at three different heights and the
card looks broken.

### Auto-align

`7.895%` is not eyeballed. It is `60 / 760` — the crown offset used to normalise these three
photos. The whole algorithm:

```
1. Run pose detection per photo. You need three landmarks:
   nose, left ankle, right ankle.
   MoveNet Lightning (TFJS) or MediaPipe Pose Landmarker. On-device, free,
   sub-second per photo — run it silently at import.

2. ankleY = max(leftAnkle.y, rightAnkle.y)
   scale  = TARGET_SUBJECT_HEIGHT / (ankleY - nose.y)
   dx     = cellWidth/2  - hipCenter.x * scale
   dy     = CROWN_OFFSET  - nose.y     * scale

3. Store { scale, dx, dy } per photo. Never modify the original file.
```

For the reference set: `TARGET_SUBJECT_HEIGHT = 700`, `CROWN_OFFSET = 60`, frame `540 × 760`.
`n1.png` / `n2.png` / `n3.png` are the output — scale factors were 1.026, 0.894, 0.962. That
15% spread between photo 1 and photo 2 is why the original set read as "the camera moved"
rather than "the body changed".

### When it fails

Predictably, and you have a live example.

- **Ankles below the frame.** The Aug 18 photo — her toes are at the bottom edge, so there is
  nothing to detect. This will be common; people cut their own feet off.
- **Ankle confidence under ~0.4** (dark floor, bare feet on wood).
- **Side views**, where one ankle occludes the other.

Fallback: keep the crown line from the nose, estimate the floor, flag the photo amber, and hand
the user a draggable floor line (`align-needs-look.png`). Block **Done** until every flagged
photo is resolved or skipped. Never silently ship a bad alignment — a wrong guide is worse than
no guide.

---

## Align screens

`align-auto.png` — the happy path. Banner reads "All 3 photos aligned automatically", the
previous photo ghosts underneath at 22% grayscale so you can see what you are matching to,
thumbnails carry a green check. Drag to move, pinch to resize.

`align-needs-look.png` — the failure path. Amber banner naming the actual problem
("Her feet are cut off in this one"), crown and waist shown as found, floor rendered as a
draggable amber bar with a `⇅` handle, thumbnail flagged, **Done** greyed.

Anchor colours are the shipped `theme.statusColors`: olive `#4d6142` / `#e3ead9` for resolved,
amber `#c58a3a` / `#f4ede3` / `#8a5a2e` for needs-attention.

---

## Open questions

1. **`WEEKS` is arguably redundant.** The header already reads `JUL 27 → AUG 31 · 2026`, and it
   currently disagrees with the delta's span. Three options: keep the photo span (most
   flattering, slightly loose), switch to the weigh-in span (precise, reads weaker), or drop it
   and let the footer be just the number. My pick is dropping it.
2. **Aligning on nose-to-ankle normalises apparent height**, which is exactly what cancels out
   camera distance — but it means the card shows *shape* change, not *height* change. Fine, just
   do not let the copy claim otherwise.
3. **Export size.** 1080 square is built for a feed post. If stories matter, 1080 × 1920 needs
   its own layout, not a scaled square.
4. **Client name.** `MADDIE K.` is first name plus initial. Confirm that is the privacy line you
   want on something posted publicly.

---

## Type & colour reference

Montserrat 400 / 700 and Protest Strike for display — both already loaded.

```
espresso ground   #241a15      glow stop      #3d2a21
cell backing      #1b120f      scrim base     rgba(20,13,10,·)
cream             #f7f3ee      rules          rgba(247,243,238,0.13)
olive (delta)     #c9dbb4      olive dim      rgba(201,219,180,0.6)
amber (flag)      #c58a3a      amber ink      #8a5a2e    amber bg  #f4ede3
olive (ok)        #4d6142      olive bg       #e3ead9
clay (buttons)    #a46a57      clay on white  #8a5140
app canvas        #faf8f6      border         #ded8d0    ink       #2a211c
```

All from `lib/theme.js`. No new values.

---

## Files

```
share-card.png          3b at export size, 1080 × 1080
align-auto.png          4a, 2×
align-needs-look.png    4b, 2×
n1.png n2.png n3.png    the normalised reference photos, 540 × 760
kova-mark-cream.png     540², cream on transparent
kova-mark-espresso.png  540², espresso on transparent
```

Photos were cut out of the screenshot and normalised by hand — they are reference material for
the layout, not production assets.
