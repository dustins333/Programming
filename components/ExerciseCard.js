import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, Keyboard, PanResponder, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { repUnit, repUnitHeader } from "../lib/programming/repUnit";
import { fonts, colors, type } from "../lib/theme";
import { formatDateMD } from "../lib/formatDate";
import { dateInBoise } from "../lib/boiseDate";
import { ExerciseHistoryModal } from "./ExerciseHistoryModal";
import { WeightCalculator } from "./WeightCalculator";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { useScrollToKeyboard } from "../lib/scrollToKeyboard";
import { PressFade } from "./PressFade";
import { autofillSuppressedRef } from "../lib/webAutofillSuppression";
import { useRestTimer, parseRestSeconds, formatSeconds } from "../lib/restTimer";

const AUTOSAVE_DELAY_MS = 900;

// design_handoff_member_lift_v1. What changed from v5, and why, since a lot
// of it was deliberate before:
//  - The per-set "Log set" button is gone. It read as a required extra step
//    when autosave had already persisted everything. A set is logged once
//    reps AND weight both hold a value — that's the olive fill, derived from
//    the values themselves rather than a separate loggedCount progression.
//  - The ± steppers are gone. People believed they had to use them instead
//    of typing. The box is now the whole control: tap it, type.
//  - Sets are full-width rows (SET n | reps | lb) with REPS/LB said once per
//    lift, rather than v5's four-across columns, which got cramped fast on a
//    four-set lift.
//  - The History and Video links are gone as pills. The lift title itself is
//    the way into history + chart (chevron after the name); video is a small
//    ▶ beside it.
//
// design_handoff_member_lasttime_v1 then took the last-time reference OFF the
// card entirely, because two attempts at putting it *in* the boxes both read
// as ambiguous to members ("is that number mine or last week's?"): first as a
// plain grey ghost, then as a ghost with a This time/Last time toggle picking
// its source (GhostSourceToggle, deleted with this pass). The problem was
// never which reference it drew from — it was that anything sitting inside an
// empty input reads as already-entered.
//
// That pass put the prescription inside the empty box instead, tagged
// "TARGET 8-10" — unambiguous while the box was empty, but it was painted
// over by the first number she typed, so a finished lift carried no record of
// what had been asked and "did I hit it?" was unanswerable on the card. So the
// prescription now has its own narrow column between the set label and the
// boxes, one dashed peach pill per set, at half the type size of the number
// she logs. It never moves and it never disappears.
//  - The pill is peach because peach means reference everywhere in the member
//    app (the last-time note above it, My Week's session banner) and olive
//    means done. A set she added past the programmed count has no target, so
//    it gets an en dash; a lift with no prescription at all renders no column,
//    rather than a column of en dashes eating width from the boxes.
//  - Reps and weight boxes are both flex:1, so whatever the target column
//    costs comes off them equally and they stay the same size as each other.
//  - Unkeyed box: dashed, tinted, an en dash. Keyed box: solid olive-tinted,
//    her number at full size and weight. The dashed/solid split is v5 house
//    rule "dashed = not logged, solid = logged".
//  - The rest timer no longer lives here at all. Tapping the stopwatch hands
//    off to the app-level rest timer (lib/restTimer.js) so it survives
//    leaving this card, this session, and this tab — the old local-state
//    version died on unmount, which is exactly what this replaces.
const CARD_BORDER = "#ece7e1";
const INPUT_BORDER = "#d9d4cd";
const GHOST = "#c9c4bd";
const OLIVE = "#4d6142";
const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";
const MUTED = colors.muted;
const SOFT = "#fdfbf8";
// The unkeyed box: dashed border, barely-there ground, near-white clay value.
// The prescription block behind SET n + the target: a warm stone ground,
// deliberately neither the peach the last-time note uses (reference from the
// coach) nor the olive a logged box uses (her own work). It only has to say
// "this side of the row is the ask, not a field", so it stays neutral.
const PRESCRIPTION_BG = "#f4f1ec";
const PRESCRIPTION_BORDER = "#e2dbd1";
// The target reads the way the Notes placeholder does — lighter than the SET
// label beside it and unbolded, so the two halves of the block can't be
// mistaken for each other. The label is the small bold uppercase one.
const PRESCRIPTION_TEXT = colors.hint;
const TARGET_BORDER = "#ddd6cd";
const TARGET_BG = "#fdfbf8";
const TARGET_TEXT = colors.hint;

// "3 × 10 @ 135" when the sets are uniform, otherwise spelled out. Takes
// either strings (this card's own live rows) or numbers (a logged history
// row), so one helper covers both the "Logged …" collapsed line and the
// "Last time …" header line.
export function summarizeSets(entries, exercise) {
  const val = (v) => (v === "" || v == null ? null : String(v));
  const unit = (v) => (v == null ? "–" : `${v}${repUnit(exercise).suffix}`);
  const real = entries.filter((s) => val(s.reps) !== null || val(s.weight) !== null);
  if (real.length === 0) return null;
  const reps = real.map((s) => val(s.reps));
  const weights = real.map((s) => val(s.weight));
  if (new Set(reps).size <= 1 && new Set(weights).size <= 1) {
    return `${real.length} × ${unit(reps[0])}${weights[0] != null ? ` @ ${weights[0]} lb` : ""}`;
  }
  return real.map((s, i) => `${unit(reps[i])}${weights[i] != null ? `@${weights[i]} lb` : ""}`).join(", ");
}

// Only worth showing as a per-set breakdown when the sets actually differ —
// a uniform scheme reads better as the existing flat "X sets × Y reps".
export function repSchemeSummary(repScheme, exercise) {
  if (!repScheme?.length) return null;
  const unique = [...new Set(repScheme)];
  if (unique.length <= 1) return null;
  const suffix = repUnit(exercise).suffix;
  return repScheme.map((n) => (n == null || n === "" ? "–" : `${n}${suffix}`)).join(", ");
}

export function getTargetSets(item) {
  return item.targetSets && item.targetSets > 0 ? item.targetSets : 3;
}

export function coachNoteFor(item) {
  return item.notes || null;
}

// Carrying a logged set down into the empty ones below it, as a pure
// function so the button's enabled state and the tap itself can't disagree.
//
// The source is the nearest logged set ABOVE each gap, never set 1: on an
// ascending-weight lift set 2 is what set 3 should follow, and copying set 1
// into it was flatly wrong. A row completed by the carry becomes the source
// for the row beneath it, so one tap fills a whole tail from the last real
// set — and a set she already logged differently is left exactly as it is.
function planFillDown(rows, tracksWeight) {
  const logged = (r) => r.reps !== "" && (!tracksWeight || r.weight !== "");
  let source = null;
  let fills = 0;
  const next = rows.map((r) => {
    if (logged(r)) {
      source = r;
      return r;
    }
    if (!source) return r;
    const filled = {
      reps: r.reps === "" ? source.reps : r.reps,
      weight: !tracksWeight ? "" : r.weight === "" ? source.weight : r.weight,
    };
    if (filled.reps === r.reps && filled.weight === r.weight) return r;
    fills += 1;
    if (logged(filled)) source = filled;
    return filled;
  });
  return { next, fills };
}

// The stopwatch bottom-right of each lift, with the coach's programmed rest
// under it. Never auto-starts — a rest only ever begins on a real tap. With
// no programmed rest there's no number to start from, so it offers the same
// three presets the old inline timer did rather than inventing a default.
// The presets are reachable either way now: with no programmed rest a tap
// opens the fan, and with one a press-and-hold does (see RestTimerButton).
// The three presets fan out as circles riding the button's own circumference
// — up and to the left, which is the only free space (the button sits
// bottom-right of the card). They used to be a rectangular strip floating
// above it, which read as a menu bolted onto a round control. Angles are
// measured from the +x axis with y flipped, so 90° is straight up and 180°
// is straight left. The arc deliberately starts well past vertical: straight
// up is where the last set row's "+" button sits — so while the fan is open
// the "+" is hidden (see the card below), which is what lets the arc sit this
// close to the button and still start near-vertical. Three same-size bubbles
// only fit in the ~100° of free space here at a wide angular spread: 45°
// apart is what keeps ~9px of air between adjacent edges at this radius.
//
// The arc is rendered by RestFanGutter, NOT by this button, and that split is
// load-bearing rather than cosmetic. Every bubble lands entirely outside the
// button's own 38x53 box (measured offsets -21/-58, -56/-26, -58/+21), and
// neither iOS nor Android delivers a touch to a view outside its parent's
// bounds. The arc had only ever been hit-tested in a browser, where CSS has
// no such rule — so the presets worked on the PWA and were dead on a real
// build: the tap fell through to whatever was behind, leaving the fan open.
// The gutter is an ancestor whose bounds DO contain the arc.
const PRESET_ANGLES = [110, 155, 200];
const REST_PRESETS = [60, 90, 120];
// The stopwatch's caption is pinned to its natural rendered height (measured:
// 11px) rather than left to the font, because the arc is positioned from the
// row's bottom edge and this height is part of that offset. Pinning it keeps
// the geometry identical on both platforms instead of depending on font
// metrics. 15 = the 12px caption + 3 (raised from 11/9.5 in the 2026-08-18
// legibility pass; the arc geometry below tracks this constant).
const REST_LABEL_H = 15;
// How far the gutter reaches above the row, so the topmost bubble is inside
// it. Worst case is the SHORTEST row (a taller notes field only pushes the
// arc down): 58.3px at full size, 54.5px compact — 64 leaves ~6px spare.
const REST_FAN_ABOVE = 64;
// ...and below it. The 200° bubble sits BELOW the button's centre and hangs
// ~6px past the row's bottom edge (4.8px compact), so the gutter has to
// reach under the row too or that one preset alone stays out of bounds —
// which is exactly what the containment check caught.
const REST_FAN_BELOW = 10;

function restFanGeometry(compact) {
  const size = compact ? 34 : 38;
  // Presets are the same size as the timer button they fan off — they read as
  // siblings of it rather than as a smaller menu hanging off it. Both radii
  // (= one full `size`, since the bubbles match the button) plus a 24px gap —
  // close enough to read as attached to the button rather than floating away.
  return { size, bubble: size, radius: size + 24 };
}

// Wraps the card's bottom row and reaches past it — REST_FAN_ABOVE px up and
// REST_FAN_BELOW px down — so the arc has an ancestor that contains it. The marginTop/paddingTop pair is
// deliberately net-zero: the box grows upward by exactly what the margin
// pulls it back, so the row's content — and everything below it — stays
// exactly where it was (verified: card height unchanged to the pixel).
// box-none so the transparent gutter can't swallow taps meant for the set
// rows it now overlaps; only its children (the row, and the bubbles) are
// touchable.
function RestFanGutter({ children }) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        marginTop: 4 - REST_FAN_ABOVE,
        paddingTop: REST_FAN_ABOVE,
        marginBottom: -REST_FAN_BELOW,
        paddingBottom: REST_FAN_BELOW,
      }}
    >
      {children}
    </View>
  );
}

// Positioned from the gutter's bottom-right — which is the row's bottom-right,
// i.e. the timer button's own corner — so no measurement is needed and the
// arc can't drift when the notes field changes height. Reduces to
// right = -r·cosθ, bottom = labelH + gap + r·sinθ. Verified pixel-identical
// (dx=0, dy=0 on all three) to the previous in-button positioning at normal
// text, an inflated notes field, and compact — and every bubble measured
// fully inside the gutter, which is what makes them tappable on native.
//
// The bubbles are ALWAYS mounted and faded in/out rather than added and
// removed, same treatment (and same reason) as the "+" add-set button next
// to them. Picking a preset starts the app-level rest timer, which mounts
// RestTimerBar in normal flow above <Tabs> and shifts the whole page down —
// so unmounting three shadowed, rounded, absolutely-positioned views in the
// exact frame the page moves left ghost tiles behind on iOS: reported as the
// white circles staying put after the tap, minus their text. Toggling
// opacity keeps the layer stable and gives the compositor nothing to strand.
//
// `hoverIndex` is the bubble the member's finger is currently over during a
// hold-and-drag (see RestTimerButton). It grows via `transform: scale` rather
// than a bigger width/height on purpose: these are anchored by their right and
// bottom edges, so growing the box would walk the bubble up and to the left
// and move the very target being aimed at. Scale is about the centre, so the
// centre — which is what the hit test uses — stays put.
//
// It grows a LOT (1.35×) and inverts to a solid fill because the thing it's
// competing with is the member's own fingertip: a 38px bubble is smaller than
// the contact patch covering it, so a colour change alone would be invisible
// under the finger. The point of the scale is to put a visible rim outside it.
function RestPresetFan({ open, compact, onPick, hoverIndex }) {
  const { bubble, radius } = restFanGeometry(compact);
  return REST_PRESETS.map((s, i) => {
    const theta = (PRESET_ANGLES[i] * Math.PI) / 180;
    const hovered = open && hoverIndex === i;
    return (
      <PressFade
        key={s}
        onPress={() => onPick(s)}
        accessibilityLabel={`Rest ${formatSeconds(s)}`}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={{
          position: "absolute",
          opacity: open ? 1 : 0,
          transform: [{ scale: hovered ? 1.35 : 1 }],
          // RNW compiles this to `pointer-events: none !important`, so it
          // beats the box-none polyfill's `> * { pointer-events: auto }` on
          // the gutter and a hidden bubble can't be tapped.
          pointerEvents: open ? "auto" : "none",
          right: -radius * Math.cos(theta),
          // REST_FAN_BELOW because the gutter's own bottom padding moves the
          // edge these are measured from down by exactly that much.
          bottom: REST_FAN_BELOW + REST_LABEL_H + 4 + radius * Math.sin(theta),
          width: bubble,
          height: bubble,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: hovered ? colors.primary : "#fff",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: hovered ? 0.24 : 0.12,
          shadowRadius: hovered ? 12 : 8,
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: hovered ? "#fff" : "#8a5140" }}>
          {formatSeconds(s)}
        </Text>
      </PressFade>
    );
  });
}

// How long a press has to be held before the fan opens, and how far the
// finger may drift in that time before it's read as a scroll instead.
const REST_HOLD_MS = 450;
const REST_HOLD_SLOP = 12;

// The stopwatch. Tap behaviour is unchanged — start the programmed rest, or
// (with no rest programmed) toggle the fan. What's new is press-and-hold:
// hold for REST_HOLD_MS and the fan opens under your finger, drag to a bubble,
// release to start it. That makes the presets reachable even when the coach
// HAS programmed a rest, which a plain tap can't offer without stealing the
// one-tap start.
//
// This is a PanResponder rather than a Pressable because the gesture has to
// keep tracking after the finger leaves the button — and that's also what
// makes drag-to-pick safe on native where tap-to-pick was not: the responder
// keeps receiving moves wherever the finger goes, so the bubbles' own bounds
// (and the parent-containment rule that once made them dead) don't come into
// it at all. Release is hit-tested against the arc's own polar definition, so
// nothing is measured and the target can't drift out of sync with what's
// drawn.
//
// Two details that are load-bearing:
//  - onPanResponderTerminationRequest yields the touch back to the ScrollView
//    until the hold fires, so a thumb that happens to land here can still
//    scroll the page; once the fan is open it refuses, so the drag can't turn
//    into a scroll halfway through.
//  - touchAction "none" (web only) is the same guarantee on the PWA, where
//    scrolling is the browser's and not the responder system's to give up.
//    It costs a 38px patch you can't start a scroll from, which is the right
//    trade for a control.
function RestTimerButton({ seconds, onStart, compact, open, onOpenChange, hoverIndex, onHoverChange }) {
  const { size, bubble, radius } = restFanGeometry(compact);
  const [pressed, setPressed] = useState(false);

  // Everything the handlers need, refreshed every render — the PanResponder
  // itself is created once, so it must not close over props.
  const latest = useRef(null);
  latest.current = { seconds, onStart, onOpenChange, onHoverChange, open, size, bubble, radius };

  const held = useRef(false); // has the hold fired during this touch?
  const moved = useRef(false); // has the finger travelled past the slop?
  const holdTimer = useRef(null);
  const origin = useRef({ x: 0, y: 0 }); // where in the button the touch began
  const hover = useRef(null);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !held.current,
      onPanResponderGrant: (evt) => {
        const l = latest.current;
        setPressed(true);
        const { locationX, locationY } = evt.nativeEvent;
        origin.current = {
          x: Number.isFinite(locationX) ? locationX : l.size / 2,
          y: Number.isFinite(locationY) ? locationY : l.size / 2,
        };
        held.current = false;
        moved.current = false;
        clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => {
          if (moved.current) return;
          held.current = true;
          latest.current.onOpenChange(true);
        }, REST_HOLD_MS);
      },
      onPanResponderMove: (evt, g) => {
        const l = latest.current;
        if (Math.hypot(g.dx, g.dy) > REST_HOLD_SLOP) moved.current = true;
        if (!held.current) return;
        // Finger position relative to the button's centre — the same origin
        // the arc is drawn from, so a bubble's centre is just (r·cosθ, −r·sinθ).
        const fx = origin.current.x - l.size / 2 + g.dx;
        const fy = origin.current.y - l.size / 2 + g.dy;
        let best = null;
        let bestDist = Infinity;
        REST_PRESETS.forEach((_, i) => {
          const theta = (PRESET_ANGLES[i] * Math.PI) / 180;
          const d = Math.hypot(fx - l.radius * Math.cos(theta), fy + l.radius * Math.sin(theta));
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        const next = bestDist <= l.bubble / 2 + 10 ? best : null;
        if (next !== hover.current) {
          hover.current = next;
          l.onHoverChange(next);
        }
      },
      onPanResponderRelease: () => {
        const l = latest.current;
        setPressed(false);
        clearTimeout(holdTimer.current);
        if (held.current) {
          const idx = hover.current;
          held.current = false;
          hover.current = null;
          l.onHoverChange(null);
          if (idx !== null) {
            l.onOpenChange(false);
            l.onStart(REST_PRESETS[idx]);
          }
          // Released over nothing: the fan stays open, so a fumbled drag
          // degrades into the tap-a-bubble flow rather than being punished.
          return;
        }
        if (moved.current) return; // a scroll that never became one
        if (l.seconds) l.onStart(l.seconds);
        else l.onOpenChange(!l.open);
      },
      onPanResponderTerminate: () => {
        setPressed(false);
        clearTimeout(holdTimer.current);
        held.current = false;
        if (hover.current !== null) {
          hover.current = null;
          latest.current.onHoverChange(null);
        }
      },
    })
  ).current;

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const hoveredSeconds = hoverIndex === null || hoverIndex === undefined ? null : REST_PRESETS[hoverIndex];

  return (
    // Explicit width so the arc's horizontal anchor is the button's own
    // centre regardless of how wide the caption under it happens to render.
    <View style={{ width: size, alignItems: "center", gap: 4, flexShrink: 0 }}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={seconds ? "Start rest timer. Hold to choose a different length" : open ? "Hide rest presets" : "Choose a rest length"}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: open ? colors.primary : CARD_BORDER,
          backgroundColor: SOFT,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
          ...(Platform.OS === "web" ? { touchAction: "none" } : null),
        }}
      >
        <Ionicons name="stopwatch-outline" size={compact ? 17 : 19} color="#8a5140" />
      </View>
      {/* Second readout of what you're dragging to, since your own finger is
          sitting on the bubble itself. */}
      <Text
        maxFontSizeMultiplier={1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: type.caption,
          height: REST_LABEL_H,
          lineHeight: REST_LABEL_H,
          textAlign: "center",
          color: hoveredSeconds ? colors.primaryOnWhite : MUTED,
        }}
      >
        {hoveredSeconds ? formatSeconds(hoveredSeconds) : seconds ? formatSeconds(seconds) : "Rest"}
      </Text>
    </View>
  );
}

// The little keypad mark that rides the right edge of every weight box —
// the plate calculator's only entry point now. It used to also hang off the
// floating keyboard accessory bar, which is iOS-native only: on the
// installed web PWA the OS renders Safari's own keyboard toolbar instead, so
// that path simply didn't exist there. It sits on every set rather than only
// the current one — one row wearing a control its neighbours don't read as
// an oddity rather than as a hint.
function CalculatorMark() {
  return (
    <View
      style={{
        width: 20,
        height: 23,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ddd6cd",
        backgroundColor: SOFT,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="calculator-outline" size={13} color="#8a5140" />
    </View>
  );
}

export function ExerciseCard({
  userId,
  datePerformed,
  source,
  // Which session these sets belong to — {groupWorkoutId} | {spcWorkoutId,
  // weekNumber} | {oneOffWorkoutId}. Part of a log row's identity, not a
  // label: see logResult (0063). Optional so the read-only viewers that
  // never write keep working unchanged.
  session,
  item,
  numberLabel,
  expanded,
  onToggleExpanded,
  completed,
  onToggleComplete,
  hideVideo,
  scrollViewRef,
  scrollOffsetRef,
  onDataChanged,
  restReturnTo,
  compact,
  // The one note on this lift (0087) — the same row the wall display and the
  // coach's live session page read and write. `note` is this session's, if
  // one has been written; `previousNote` is the last thing said about this
  // lift in any earlier session, carried forward.
  note = null,
  previousNote = null,
  onSaveNote,
}) {
  const targetSets = getTargetSets(item);
  // A lift with nothing to load — inverted row, push-up, plank — logs reps
  // alone. The weight column disappears entirely rather than being disabled:
  // a greyed-out box still reads as something she failed to fill in, and it
  // would keep the card from ever counting as done.
  const tracksWeight = item.exercise?.tracks_weight !== false;
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
  // The note field grows to fit what's in it rather than scrolling inside a
  // fixed 44pt box — vertical growth is always preferable to a scroller
  // inside a card that can already scroll. Web reports scrollHeight, which
  // already includes the field's own padding, so only the borders are left to
  // add; native reports the content alone, so its padding has to be added.
  const [noteHeight, setNoteHeight] = useState(0);
  // Two lines before anything is typed — one line read as an afterthought
  // next to the set boxes, and most notes run past one line anyway.
  const NOTE_MIN_HEIGHT = 64;
  const noteChrome = Platform.OS === "web" ? 2 : 22;
  // True while the member is mid-edit, so an incoming refetch can't pull the
  // saved text back over what she's currently typing.
  const noteDirtyRef = useRef(false);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const [saveRetry, setSaveRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Which row's calculator is open. The mark itself is always rendered (not
  // gated on the TextInput being focused) — an opacity/pointerEvents toggle
  // keyed off focus races with the tap: tapping the mark blurs the input,
  // and that blur can land before the press finishes, hiding the target out
  // from under the finger.
  const [calcRowIndex, setCalcRowIndex] = useState(null);
  // Lifted out of RestTimerButton so the last set row's "+" can get out of the
  // fan's way while it's open — the presets sit close enough to the timer now
  // that the top one would otherwise land on it.
  const [restPickerOpen, setRestPickerOpen] = useState(false);
  // Which preset the finger is over during a hold-and-drag, or null.
  const [restHoverIndex, setRestHoverIndex] = useState(null);
  const loaded = useRef(false);
  const debounceRef = useRef(null);
  // The load effect below sets rows/notes from whatever's already saved
  // today, which would otherwise immediately re-trigger autosave — this
  // skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);
  // Same skip-once idiom, for the auto-complete effect: loading
  // already-saved (possibly already-full) sets shouldn't count as "just
  // became complete" and re-fire a mark, especially if the member had since
  // manually unchecked a fully-logged exercise.
  const skipCompletionEffectRef = useRef(true);
  const wasFullyFilledRef = useRef(false);
  const cardRef = useRef(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const { startRest } = useRestTimer();

  // Every card mounts already expanded on the session page, so this runs on
  // mount there; in the collapsed-by-default accordion (the coach/history
  // session viewer) it runs on first open instead. A collapsed-because-
  // already-ticked lift loads too, or its one-line summary would fall back
  // to the coach's prescription instead of what was actually logged.
  useEffect(() => {
    if (!(expanded || completed) || loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const todaysSets = await getLoggedSetsForDate(userId, item.exercise.id, datePerformed, session);
        if (todaysSets.length === 0) return;
        skipAutosaveRef.current = true;
        skipCompletionEffectRef.current = true;
        // A member can add sets beyond what the coach programmed (the "+"
        // at the end of the last row), so the card has to grow back to
        // whatever was actually logged, not just the target count.
        const highest = todaysSets.reduce((max, s) => Math.max(max, s.set_number ?? 1), targetSets);
        setRows(() =>
          Array.from({ length: highest }, (_, i) => {
            const existing = todaysSets.find((s) => s.set_number === i + 1);
            return existing
              ? { reps: existing.reps === null ? "" : String(existing.reps), weight: existing.weight === null ? "" : String(existing.weight) }
              : { reps: "", weight: "" };
          })
        );
        // Legacy fallback only. Notes written before 0087 live on the log
        // rows themselves; seeding from one keeps an old note visible, and
        // the moment it's edited it lands in the shared store instead. Never
        // overrides a real shared note or something being typed right now.
        const notedRow = todaysSets.find((s) => s.notes);
        if (notedRow && !noteRef.current && !noteDirtyRef.current) setNotes(notedRow.notes);
      } catch (err) {
        console.error("Failed to load today's logged sets:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, completed]);

  // Seed the box whenever the shared note arrives or changes underneath —
  // a coach typing at the TV mid-session lands here. Deliberately does
  // nothing when there is no shared note, so it can't wipe the legacy
  // fallback seeded above.
  useEffect(() => {
    if (noteDirtyRef.current) return;
    if (note?.body != null) setNotes(note.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return undefined;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("pending");
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await Promise.all(
          rows.map((row, i) =>
            logResult({
              userId,
              exerciseId: item.exercise.id,
              datePerformed,
              setNumber: i + 1,
              reps: row.reps === "" ? null : Number(row.reps) || null,
              weight: !tracksWeight || row.weight === "" ? null : Number(row.weight),
              source,
              session,
            })
          )
        );
        setSaveState("saved");
        // Only meaningful once a session's already been finalized — the page
        // uses this to revert the Finalize button, since finalized_at has no
        // idea a set was edited after the fact.
        onDataChanged?.();
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // saveRetry is in here so the "Try again" button below re-runs this
    // effect: it only ever fired on a rows/notes change, so a member whose
    // last save failed had to edit something again to get another attempt.
    // (The note is no longer in here — it saves on blur, not on this timer.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, saveRetry]);

  // Fills the checkbox in the moment every set holds both numbers. Fires
  // only on a genuine false→true transition, never on every keystroke, and
  // never auto-*un*checks when a field is later cleared.
  //
  // It deliberately does NOT collapse the card — only a manual tap does
  // that (see SessionLogger's handleToggleComplete). "Fully filled" becomes
  // true as soon as both boxes are non-empty, i.e. after the *first* digit
  // of a three-digit weight, so collapsing here would yank the card away
  // mid-number.
  useEffect(() => {
    if (!onToggleComplete) return;
    const fullyFilled = rows.length > 0 && rows.every((r) => r.reps !== "" && (!tracksWeight || r.weight !== ""));
    if (skipCompletionEffectRef.current) {
      skipCompletionEffectRef.current = false;
      wasFullyFilledRef.current = fullyFilled;
      return;
    }
    if (fullyFilled && !wasFullyFilledRef.current) onToggleComplete(true, "auto");
    wasFullyFilledRef.current = fullyFilled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const isLogged = (r) => r.reps !== "" && (!tracksWeight || r.weight !== "");

  // Carry what she last logged down the rest of the lift. A straight
  // 3x10 @ 65 is three identical rows, and typing it out three times is the
  // single most repetitive thing in the whole logging flow.
  //
  // This is deliberately an EXPLICIT gesture, not the automatic carry-over
  // prefill that used to live here: pre-filling boxes she hadn't done yet
  // made an untouched set read as already logged, which is exactly why it
  // was taken out. Nothing is written until she asks for it.
  //
  // The source is the nearest logged set ABOVE each gap, not set 1 — an
  // ascending-weight lift means set 2 is what set 3 should follow, and
  // copying set 1 into it was flatly wrong (reported for real). Carrying
  // sequentially also means a filled row becomes the source for the row
  // under it, so one tap fills a whole tail from the last real set.
  //
  // Only offered when it would actually do something — a logged set with at
  // least one empty set somewhere below it — so it isn't a permanent
  // ornament.
  const fillPlan = planFillDown(rows, tracksWeight);
  const canFillDown = fillPlan.fills > 0;

  const handleFillDown = () => {
    // Only fills the gaps: a set she already logged differently is left
    // exactly as she logged it. Recomputed off the latest rows rather than
    // the render-time plan, so a keystroke landing between render and tap
    // can't be overwritten by a stale copy.
    setRows((prev) => planFillDown(prev, tracksWeight).next);
  };

  const currentIndex = rows.findIndex((r) => !isLogged(r));
  const loggedSummary = summarizeSets(rows, item.exercise);

  const titleSize = compact ? 19 : 21;

  const handleStartRest = (seconds) => {
    const doneSets = rows.filter(isLogged).length;
    startRest({
      seconds,
      liftName: item.exercise.name,
      setNumber: Math.max(1, doneSets),
      returnTo: restReturnTo ?? null,
    });
  };

  // Nothing under the lift name but what she actually did, and only once the
  // card is closed over it. The last-time line and the prescription line both
  // went with this pass: the prescription now lives per-set in the boxes
  // themselves (where it can differ set to set, which one summary line could
  // never say), and last time is a tap away behind the name. What's left is a
  // record, not a reference — there's nothing to disambiguate.
  const subtitle =
    !expanded && loggedSummary ? (
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: MUTED, marginTop: 2 }}>
        Logged {loggedSummary}
      </Text>
    ) : null;

  const boxHeight = compact ? 40 : 44;
  const boxRadius = compact ? 11 : 12;
  const setLabelWidth = compact ? 36 : 40;
  const trailingWidth = compact ? 30 : 33;
  const rowGap = compact ? 8 : 9;

  // The coach's prescription for each set, resolved once so the header can
  // ask whether this lift has any targets at all. repScheme carries a per-set
  // scheme (10/8/8 asks different things of set 1 and set 3), targetReps is
  // the flat fallback, and a set the member added herself past the programmed
  // count has no target. A lift with none of the above renders no TARGET
  // column at all rather than a column of en dashes eating box width.
  const rowTargets = rows.map((_, i) => {
    const t = item.repScheme?.[i] ?? item.targetReps ?? null;
    return t === null || t === "" ? null : String(t);
  });
  const hasTargets = rowTargets.some(Boolean);
  const targetWidth = compact ? 45 : 48;
  // The SET label keeps the left-aligned position it had before the block
  // existed, so it needs the block's own left inset.
  const BLOCK_INSET = 8;

  return (
    <View
      ref={cardRef}
      style={{
        backgroundColor: "#fff",
        borderRadius: compact ? 14 : 18,
        marginBottom: 10,
        paddingHorizontal: 15,
        ...(expanded
          ? {
              borderWidth: 1.5,
              borderColor: colors.primary,
              paddingTop: 15,
              paddingBottom: 13,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.1,
              shadowRadius: 22,
            }
          : { borderWidth: 1, borderColor: CARD_BORDER, paddingVertical: 14 }),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: expanded ? "flex-start" : "center", gap: 11 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* The title is the way into history — there's no separate link
                on the card anymore. The NAME is clay because the name is the
                tap target; the set number stays dark because it's a label,
                not a control. That split is the whole affordance, so don't
                collapse it back into one colour. */}
            <PressFade
              onPress={() => setHistoryOpen(true)}
              accessibilityLabel={`${item.exercise.name} history`}
              style={{ flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1, minWidth: 0 }}
            >
              <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: titleSize, lineHeight: titleSize * 1.15, flexShrink: 1 }}>
                {numberLabel ? <Text style={{ color: "#44403c" }}>{numberLabel}. </Text> : null}
                <Text style={{ color: colors.primary }}>{item.exercise.name}</Text>
              </Text>
              {/* Only on the open lift: the affordance shows up where she can
                  act on it, instead of putting a mark beside every name in a
                  collapsed list. */}
              {expanded ? (
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#f0ddd2",
                    backgroundColor: "#fdf6f2",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ionicons name="chevron-forward" size={11} color={colors.primary} />
                </View>
              ) : null}
            </PressFade>
            {expanded && !hideVideo && item.exercise.video_url ? (
              <PressFade
                onPress={() => Linking.openURL(item.exercise.video_url)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Watch video for ${item.exercise.name}`}
                style={{
                  width: compact ? 22 : 24,
                  height: compact ? 22 : 24,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: CARD_BORDER,
                  backgroundColor: SOFT,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons name="play" size={9} color="#8a5140" />
              </PressFade>
            ) : null}
          </View>
          {subtitle}
        </View>

        {onToggleComplete ? (
          <Pressable
            onPress={() => onToggleComplete(!completed, "manual")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={completed ? "Mark lift not complete" : "Mark lift complete"}
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              ...(completed ? { backgroundColor: OLIVE } : { borderWidth: 1.5, borderColor: "#d8d2ca" }),
            }}
          >
            {completed ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onToggleExpanded?.(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          accessibilityLabel={expanded ? "Collapse lift" : "Expand lift"}
          style={{ flexShrink: 0 }}
        >
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={GHOST} />
        </Pressable>
      </View>

      {expanded ? (
        <View style={{ marginTop: 12 }}>
          {coachNoteFor(item) ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", marginBottom: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Coach note: </Text>
              {coachNoteFor(item)}
            </Text>
          ) : null}
          {item.exercise.cues ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", marginBottom: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Cues: </Text>
              {item.exercise.cues}
            </Text>
          ) : null}
          {/* Sets and reps moved into the boxes and rest is under the
              stopwatch, but tempo has no box of its own — without a line here
              it would simply stop reaching the member, which is the same way
              coach cues went unseen for months. Only rendered when the coach
              actually set one, so a lift without tempo carries no extra line. */}
          {item.tempo ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", marginBottom: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Tempo: </Text>
              {item.tempo}
            </Text>
          ) : null}

          {/* The count column and LB, said once for the whole lift. A
              reps-only lift drops the LB column altogether, so the count
              takes the full width.

              Naming the unit here is the whole of the time/distance design:
              the header is already printed once per lift rather than beside
              every set, so a Farmer Carry reads "TIME | LB" over "60 | 62"
              and nothing repeats. The boxes themselves are untouched. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: rowGap, marginBottom: 5 }}>
            {hasTargets ? (
              /* Mirrors the tinted block's own two halves — one child of the
                 header row, laid out internally with no gap, so TARGET lands
                 over the prescription and not over the set number. Reading
                 the row gap into this alignment is what put it 9px out. */
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: setLabelWidth + BLOCK_INSET + 1 }} />
                {/* Tighter than its siblings because the word is twice as
                    long and the column it labels holds "10-12" at most. */}
                <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ width: targetWidth + 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.3, color: MUTED }}>
                  TARGET
                </Text>
              </View>
            ) : (
              <View style={{ width: setLabelWidth }} />
            )}
            <Text maxFontSizeMultiplier={1} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1, color: MUTED }}>
              {repUnitHeader(item.exercise)}
            </Text>
            {tracksWeight ? (
              <Text maxFontSizeMultiplier={1} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1, color: MUTED }}>
                LB
              </Text>
            ) : null}
            <View style={{ width: trailingWidth }} />
          </View>

          {rows.map((row, i) => {
            const isCurrent = i === currentIndex;
            const isLast = i === rows.length - 1;
            const targetLabel = rowTargets[i];

            // Keyed or not is per BOX, not per row: typing reps without a
            // weight yet should settle the reps box and leave the weight box
            // still asking. The clay border marks whichever box she's on.
            const boxStyle = (hasValue) => ({
              flex: 1,
              minWidth: 0,
              height: boxHeight,
              borderRadius: boxRadius,
              textAlign: "center",
              fontFamily: fonts.display,
              fontSize: compact ? 18 : 20,
              color: "#44403c",
              paddingHorizontal: 8,
              ...(hasValue
                ? { backgroundColor: LOGGED_BG, borderWidth: 1, borderColor: LOGGED_BORDER }
                : isCurrent
                  ? { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.primary }
                  : { backgroundColor: TARGET_BG, borderWidth: 1.5, borderStyle: "dashed", borderColor: TARGET_BORDER }),
            });

            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: rowGap, marginBottom: 7 }}>
                {hasTargets ? (
                  /* The set number and its prescription are one tinted block,
                     the full height of the boxes beside it: peach means "what
                     was asked", white/olive means "what she did". Without the
                     ground behind it the two halves of the row read as one
                     flat table and the target looks like another field. */
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      height: boxHeight,
                      borderRadius: boxRadius,
                      backgroundColor: PRESCRIPTION_BG,
                      borderWidth: 1,
                      borderColor: PRESCRIPTION_BORDER,
                    }}
                  >
                    {/* Every SET label is the same clay as the lift name
                        above it — this used to be the "current set" highlight
                        applied to one row only, which made set 1 read as a
                        different kind of label than sets 2 and 3. The current
                        set is still marked by the clay border on its boxes,
                        which is the more visible of the two signals. */}
                    <Text
                      maxFontSizeMultiplier={1}
                      style={{ width: setLabelWidth, marginLeft: BLOCK_INSET, fontFamily: fonts.sansBold, fontSize: type.eyebrow, color: colors.primary }}
                    >
                      SET {i + 1}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1}
                      numberOfLines={1}
                      style={{ width: targetWidth, textAlign: "center", fontFamily: fonts.sans, fontSize: compact ? 13.5 : 14, color: PRESCRIPTION_TEXT }}
                    >
                      {targetLabel ?? "–"}
                    </Text>
                  </View>
                ) : (
                  <Text
                    maxFontSizeMultiplier={1}
                    style={{ width: setLabelWidth, fontFamily: fonts.sansBold, fontSize: type.eyebrow, color: colors.primary }}
                  >
                    SET {i + 1}
                  </Text>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    ref={autofillSuppressedRef}
                    value={row.reps}
                    onChangeText={(v) => updateRow(i, "reps", v)}
                    onFocus={() => scrollFieldIntoView(cardRef.current)}
                    // Coming back to a box that already has a number: the value is
                    // selected on focus, so the first keystroke replaces it outright
                    // instead of appending to what she typed the first time.
                    selectTextOnFocus
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    // Nothing but her own number ever goes in this box now —
                    // the prescription sits in its own column to the left.
                    placeholder="–"
                    placeholderTextColor={TARGET_TEXT}
                    maxFontSizeMultiplier={1}
                    accessibilityLabel={targetLabel ? `Set ${i + 1} reps, target ${targetLabel}` : `Set ${i + 1} reps`}
                    style={{ ...boxStyle(row.reps !== ""), flex: undefined, width: "100%" }}
                  />
                </View>
                {tracksWeight ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    ref={autofillSuppressedRef}
                    value={row.weight}
                    onChangeText={(v) => updateRow(i, "weight", v)}
                    onFocus={() => scrollFieldIntoView(cardRef.current)}
                    selectTextOnFocus
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    // Weight is never prescribed in this gym, so there is no
                    // target to state and nothing honest to put here.
                    placeholder="–"
                    placeholderTextColor={TARGET_TEXT}
                    maxFontSizeMultiplier={1}
                    accessibilityLabel={`Set ${i + 1} weight`}
                    style={{ ...boxStyle(row.weight !== ""), flex: undefined, width: "100%", paddingRight: 30 }}
                  />
                  <PressFade
                    onPress={() => {
                      Keyboard.dismiss();
                      setCalcRowIndex(i);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 8 }}
                    accessibilityLabel={`Plate calculator for set ${i + 1}`}
                    style={{ position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center" }}
                  >
                    <CalculatorMark />
                  </PressFade>
                </View>
                ) : null}
                <View style={{ width: trailingWidth, alignItems: "flex-end" }}>
                  {/* Kept in the layout (opacity, not unmounted) while the
                      rest fan is open so nothing shifts under the member's
                      finger — it just stops being visible or tappable. */}
                  {isLast ? (
                    <PressFade
                      onPress={() => setRows((prev) => [...prev, { reps: "", weight: "" }])}
                      accessibilityLabel="Add a set"
                      style={{
                        width: trailingWidth,
                        height: trailingWidth,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: CARD_BORDER,
                        backgroundColor: SOFT,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: restPickerOpen ? 0 : 1,
                        pointerEvents: restPickerOpen ? "none" : "auto",
                      }}
                    >
                      <Ionicons name="add" size={17} color="#8a5140" />
                    </PressFade>
                  ) : null}
                </View>
              </View>
            );
          })}

          {canFillDown ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1, marginBottom: 8 }}>
              <PressFade
                onPress={handleFillDown}
                accessibilityLabel={`Fill the remaining sets of ${item.exercise.name} from the last set you logged`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingLeft: 7,
                  paddingRight: 11,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: CARD_BORDER,
                  backgroundColor: SOFT,
                }}
              >
                <Ionicons name="arrow-down" size={14} color="#8a5140" />
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: "#8a5140" }}>
                  Same for the rest
                </Text>
              </PressFade>
            </View>
          ) : null}

          {/* The last thing said about this lift, carried forward from an
              earlier session (0087). Shown ABOVE the box rather than
              pre-filled into it: an untouched note must never be silently
              re-saved as though it had been said again today, and seeing
              last week's beside this week's empty box is how the note
              actually reads as a running conversation. */}
          {previousNote?.body && !notes ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#f0ddd2",
                backgroundColor: "#fdf6f2",
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: colors.primaryOnWhite, marginBottom: 2 }}
              >
                {"LAST TIME"}
                {previousNote.created_at ? ` | ${formatDateMD(dateInBoise(new Date(previousNote.created_at)))}` : ""}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, lineHeight: 16, color: "#57534e" }}>
                {previousNote.body}
                {previousNote.author_name ? (
                  <Text style={{ color: colors.muted }}>{` — ${previousNote.author_name}`}</Text>
                ) : null}
              </Text>
            </View>
          ) : null}

          {/* ONE note field, shared by every surface (0087) — whatever is
              typed here is the same note the wall display and the coach's
              live session page show, and it carries into the next time this
              lift is programmed. Saved on blur, and only when the text has
              actually changed: the table is append-only, so a blur that
              re-saved identical text would pile up duplicate rows. */}
          <RestFanGutter>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <TextInput
                value={notes}
                onChangeText={(t) => {
                  noteDirtyRef.current = true;
                  setNotes(t);
                }}
                onBlur={() => {
                  noteDirtyRef.current = false;
                  onSaveNote?.(item.exercise.id, notes);
                }}
                onFocus={() => scrollFieldIntoView(cardRef.current)}
                multiline
                onContentSizeChange={(e) => setNoteHeight(e.nativeEvent.contentSize.height)}
                placeholder="Notes"
                placeholderTextColor={colors.hint}
                inputAccessoryViewID={NUMERIC_DONE_ID}
                accessibilityLabel={`Notes for ${item.exercise.name}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: NOTE_MIN_HEIGHT,
                  height: noteHeight ? Math.max(NOTE_MIN_HEIGHT, noteHeight + noteChrome) : undefined,
                  // The box always grows to fit its text, so there is never
                  // anything to scroll to — and without this the web build
                  // renders a scroller inside it regardless.
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: INPUT_BORDER,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontFamily: fonts.sans,
                  // 16 rather than the 13 this used to be: it read as too
                  // small next to the 18-20pt set boxes, and on the PWA any
                  // input under 16px makes iOS Safari auto-zoom on focus
                  // (same reason the auth fields are 16).
                  fontSize: 16,
                  lineHeight: 21,
                  color: "#44403c",
                  backgroundColor: "#fff",
                }}
              />
              <RestTimerButton
                seconds={parseRestSeconds(item.rest)}
                onStart={handleStartRest}
                compact={compact}
                open={restPickerOpen}
                onOpenChange={setRestPickerOpen}
                hoverIndex={restHoverIndex}
                onHoverChange={setRestHoverIndex}
              />
            </View>
            <RestPresetFan
              open={restPickerOpen}
              compact={compact}
              hoverIndex={restHoverIndex}
              onPick={(s) => {
                setRestPickerOpen(false);
                handleStartRest(s);
              }}
            />
          </RestFanGutter>

          {/* The olive fill on a set box is the everyday "it saved" signal,
              so success stays silent — but a failure must not look
              identical to a save. Deliberately no transient "Saving…" line:
              autosave fires on every keystroke, so a line that appears and
              disappears mid-set changes the card's height over and over and
              shoves every card below it down the page. The error state is
              persistent, so it can take the space it needs. */}
          {saveState === "error" ? (
            <View className="flex-row items-center" style={{ marginTop: 8, gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#b23a22", flexShrink: 1 }}>
                Couldn't save — check your connection.
              </Text>
              <Pressable onPress={() => setSaveRetry((n) => n + 1)} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.primaryOnWhite }}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <ExerciseHistoryModal
        tracksWeight={tracksWeight}
        exercise={item.exercise}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        userId={userId}
        exerciseId={item.exercise.id}
        exerciseName={item.exercise.name}
        datePerformed={datePerformed}
        returnTo={restReturnTo ?? null}
      />

      <WeightCalculator
        visible={calcRowIndex !== null}
        onClose={() => setCalcRowIndex(null)}
        onInsert={(value) => updateRow(calcRowIndex, "weight", String(value))}
      />
    </View>
  );
}
