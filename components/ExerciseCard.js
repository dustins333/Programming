import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMD } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";
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
//  - "Last time" is one grey line in the header, not a red band (which read
//    as a warning) — and the per-set reference is now the grey ghost value
//    sitting in each not-yet-logged box.
//  - The History and Video links are gone as pills. The lift title itself is
//    the way into history + chart (chevron after the name); video is a small
//    ▶ beside it.
//  - The rest timer no longer lives here at all. Tapping the stopwatch hands
//    off to the app-level rest timer (lib/restTimer.js) so it survives
//    leaving this card, this session, and this tab — the old local-state
//    version died on unmount, which is exactly what this replaces.
const CARD_BORDER = "#ece7e1";
const INPUT_BORDER = "#d9d4cd";
const BOX_BORDER = "#ece7e1";
const GHOST = "#c9c4bd";
const OLIVE = "#4d6142";
const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";
const MUTED = "#a8a29e";
const SOFT = "#fdfbf8";

// "3 × 10 @ 135" when the sets are uniform, otherwise spelled out. Takes
// either strings (this card's own live rows) or numbers (a logged history
// row), so one helper covers both the "Logged …" collapsed line and the
// "Last time …" header line.
export function summarizeSets(entries) {
  const val = (v) => (v === "" || v == null ? null : String(v));
  const real = entries.filter((s) => val(s.reps) !== null || val(s.weight) !== null);
  if (real.length === 0) return null;
  const reps = real.map((s) => val(s.reps));
  const weights = real.map((s) => val(s.weight));
  if (new Set(reps).size <= 1 && new Set(weights).size <= 1) {
    return `${real.length} × ${reps[0] ?? "–"}${weights[0] != null ? ` @ ${weights[0]}` : ""}`;
  }
  return real.map((s, i) => `${reps[i] ?? "–"}${weights[i] != null ? `@${weights[i]}` : ""}`).join(", ");
}

// Only worth showing as a per-set breakdown when the sets actually differ —
// a uniform scheme reads better as the existing flat "X sets × Y reps".
export function repSchemeSummary(repScheme) {
  if (!repScheme?.length) return null;
  const unique = [...new Set(repScheme)];
  return unique.length > 1 ? repScheme.join(", ") : null;
}

export function getTargetSets(item) {
  return item.targetSets && item.targetSets > 0 ? item.targetSets : 3;
}

// Prescription only — the coach's free-text note deliberately gets its own
// labelled line rather than being glued on with "·" in the same muted color.
export function targetLineFor(item) {
  const parts = [`${getTargetSets(item)} × ${repSchemeSummary(item.repScheme) ?? item.targetReps ?? "–"}`];
  if (item.tempo) parts.push(`tempo ${item.tempo}`);
  if (item.rest) parts.push(`rest ${item.rest}`);
  return parts.join(" · ");
}

export function coachNoteFor(item) {
  return item.notes || null;
}

// The stopwatch bottom-right of each lift, with the coach's programmed rest
// under it. Never auto-starts — a rest only ever begins on a real tap. With
// no programmed rest there's no number to start from, so it offers the same
// three presets the old inline timer did rather than inventing a default.
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
// metrics; at 11 it also reproduces today's layout to the pixel.
const REST_LABEL_H = 11;
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
function RestPresetFan({ open, compact, onPick }) {
  const { bubble, radius } = restFanGeometry(compact);
  return REST_PRESETS.map((s, i) => {
    const theta = (PRESET_ANGLES[i] * Math.PI) / 180;
    return (
      <PressFade
        key={s}
        onPress={() => onPick(s)}
        accessibilityLabel={`Rest ${formatSeconds(s)}`}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={{
          position: "absolute",
          opacity: open ? 1 : 0,
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
          backgroundColor: "#fff",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#8a5140" }}>
          {formatSeconds(s)}
        </Text>
      </PressFade>
    );
  });
}

function RestTimerButton({ seconds, onStart, compact, open, onOpenChange }) {
  const { size } = restFanGeometry(compact);
  const pickerOpen = open;
  const setPickerOpen = (next) => onOpenChange(typeof next === "function" ? next(open) : next);
  return (
    // Explicit width so the arc's horizontal anchor is the button's own
    // centre regardless of how wide the caption under it happens to render.
    <View style={{ width: size, alignItems: "center", gap: 4, flexShrink: 0 }}>
      <PressFade
        onPress={() => (seconds ? onStart(seconds) : setPickerOpen((o) => !o))}
        accessibilityLabel={seconds ? "Start rest timer" : pickerOpen ? "Hide rest presets" : "Choose a rest length"}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: pickerOpen ? colors.primary : CARD_BORDER,
          backgroundColor: SOFT,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="stopwatch-outline" size={compact ? 17 : 19} color="#8a5140" />
      </PressFade>
      <Text
        maxFontSizeMultiplier={1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, height: REST_LABEL_H, lineHeight: REST_LABEL_H, textAlign: "center", color: MUTED }}
      >
        {seconds ? formatSeconds(seconds) : "Rest"}
      </Text>
    </View>
  );
}

// The little keypad mark that rides the right edge of the weight box on the
// set you're on — the plate calculator's only entry point now. It used to
// also hang off the floating keyboard accessory bar, which is iOS-native
// only: on the installed web PWA the OS renders Safari's own keyboard
// toolbar instead, so that path simply didn't exist there.
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
  item,
  numberLabel,
  expanded,
  onToggleExpanded,
  completed,
  onToggleComplete,
  lastSession,
  hideVideo,
  scrollViewRef,
  scrollOffsetRef,
  onDataChanged,
  restReturnTo,
  compact,
}) {
  const targetSets = getTargetSets(item);
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
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
        const todaysSets = await getLoggedSetsForDate(userId, item.exercise.id, datePerformed);
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
        const notedRow = todaysSets.find((s) => s.notes);
        if (notedRow) setNotes(notedRow.notes);
      } catch (err) {
        console.error("Failed to load today's logged sets:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, completed]);

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
              weight: row.weight === "" ? null : Number(row.weight),
              notes: notes === "" ? null : notes,
              source,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, notes, saveRetry]);

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
    const fullyFilled = rows.length > 0 && rows.every((r) => r.reps !== "" && r.weight !== "");
    if (skipCompletionEffectRef.current) {
      skipCompletionEffectRef.current = false;
      wasFullyFilledRef.current = fullyFilled;
      return;
    }
    if (fullyFilled && !wasFullyFilledRef.current) onToggleComplete(true, "auto");
    wasFullyFilledRef.current = fullyFilled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const isLogged = (r) => r.reps !== "" && r.weight !== "";
  const currentIndex = rows.findIndex((r) => !isLogged(r));
  const loggedSummary = summarizeSets(rows);
  const lastSummary = lastSession ? summarizeSets(lastSession.sets) : null;

  const title = `${numberLabel ? `${numberLabel}. ` : ""}${item.exercise.name}`;
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

  // Header subtitle, in priority order: what's logged today (once the card
  // is closed and there's something to show), else last time, else the
  // coach's prescription.
  let subtitle = null;
  if (!expanded && loggedSummary) {
    subtitle = <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: MUTED, marginTop: 2 }}>Logged {loggedSummary}</Text>;
  } else if (lastSummary) {
    subtitle = (
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: MUTED, marginTop: 2 }}>
        Last time {formatDateMD(lastSession.date)} ·{" "}
        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#78716c" }}>{lastSummary}</Text>
      </Text>
    );
  } else {
    subtitle = <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: MUTED, marginTop: 2 }}>{targetLineFor(item)}</Text>;
  }

  const boxHeight = compact ? 40 : 44;
  const boxRadius = compact ? 11 : 12;
  const setLabelWidth = compact ? 36 : 40;
  const trailingWidth = compact ? 30 : 33;
  const rowGap = compact ? 8 : 9;

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
            {/* The title is the way into history + chart — there's no
                separate link on the card anymore. */}
            <PressFade
              onPress={() => setHistoryOpen(true)}
              accessibilityLabel={`${item.exercise.name} history and progress`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 }}
            >
              <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: titleSize, lineHeight: titleSize * 1.15, color: "#44403c", flexShrink: 1 }}>
                {title}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={GHOST} style={{ flexShrink: 0 }} />
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

          {/* REPS / LB said once for the whole lift. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: rowGap, marginBottom: 5 }}>
            <View style={{ width: setLabelWidth }} />
            <Text maxFontSizeMultiplier={1} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 1, color: "#c0b9b0" }}>
              REPS
            </Text>
            <Text maxFontSizeMultiplier={1} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 1, color: "#c0b9b0" }}>
              LB
            </Text>
            <View style={{ width: trailingWidth }} />
          </View>

          {rows.map((row, i) => {
            const logged = isLogged(row);
            const isCurrent = i === currentIndex;
            const isLast = i === rows.length - 1;
            // Ghost values come from last time's matching set number; reps
            // fall back to the coach's programmed reps for that set, so a
            // first-time lift still shows what to aim for.
            const histSet = lastSession?.sets.find((s) => s.set_number === i + 1) ?? null;
            const repsGhost = histSet?.reps != null ? String(histSet.reps) : String(item.repScheme?.[i] ?? item.targetReps ?? "");
            const weightGhost = histSet?.weight != null ? String(histSet.weight) : "";

            const boxStyle = {
              flex: 1,
              minWidth: 0,
              height: boxHeight,
              borderRadius: boxRadius,
              textAlign: "center",
              fontFamily: fonts.display,
              fontSize: compact ? 18 : 20,
              color: "#44403c",
              paddingHorizontal: 8,
              ...(logged
                ? { backgroundColor: LOGGED_BG, borderWidth: 1, borderColor: LOGGED_BORDER }
                : { backgroundColor: "#fff", borderWidth: 1, borderColor: BOX_BORDER }),
            };

            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: rowGap, marginBottom: 7 }}>
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ width: setLabelWidth, fontFamily: fonts.sansBold, fontSize: compact ? 9.5 : 10, color: isCurrent ? "#8a5140" : MUTED }}
                >
                  SET {i + 1}
                </Text>
                <TextInput
                  ref={autofillSuppressedRef}
                  value={row.reps}
                  onChangeText={(v) => updateRow(i, "reps", v)}
                  onFocus={() => scrollFieldIntoView(cardRef.current)}
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  placeholder={repsGhost}
                  placeholderTextColor={GHOST}
                  maxFontSizeMultiplier={1}
                  accessibilityLabel={`Set ${i + 1} reps`}
                  style={{ ...boxStyle, ...(isCurrent && !logged ? { borderWidth: 1.5, borderColor: colors.primary } : null) }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    ref={autofillSuppressedRef}
                    value={row.weight}
                    onChangeText={(v) => updateRow(i, "weight", v)}
                    onFocus={() => scrollFieldIntoView(cardRef.current)}
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    placeholder={weightGhost}
                    placeholderTextColor={GHOST}
                    maxFontSizeMultiplier={1}
                    accessibilityLabel={`Set ${i + 1} weight`}
                    style={{ ...boxStyle, flex: undefined, width: "100%", paddingRight: isCurrent ? 30 : 8 }}
                  />
                  {isCurrent ? (
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
                  ) : null}
                </View>
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

          {/* Note beside the rest timer on the card's bottom row. Blank —
              the old prefilled prompt read as content that was already
              there. */}
          <RestFanGutter>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                onFocus={() => scrollFieldIntoView(cardRef.current)}
                multiline
                inputAccessoryViewID={NUMERIC_DONE_ID}
                accessibilityLabel={`Notes for ${item.exercise.name}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 42,
                  borderWidth: 1,
                  borderColor: INPUT_BORDER,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontFamily: fonts.sans,
                  fontSize: 13,
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
              />
            </View>
            <RestPresetFan
              open={restPickerOpen}
              compact={compact}
              onPick={(s) => {
                setRestPickerOpen(false);
                handleStartRest(s);
              }}
            />
          </RestFanGutter>

          {/* The olive fill on a set box is the everyday "it saved" signal,
              so success stays silent — but a failure must not look
              identical to a save. */}
          {saveState === "saving" ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 8 }}>Saving…</Text>
          ) : saveState === "error" ? (
            <View className="flex-row items-center" style={{ marginTop: 8, gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#b23a22", flexShrink: 1 }}>
                Couldn't save — check your connection.
              </Text>
              <Pressable onPress={() => setSaveRetry((n) => n + 1)} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <ExerciseHistoryModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        userId={userId}
        exerciseId={item.exercise.id}
        exerciseName={item.exercise.name}
      />

      <WeightCalculator
        visible={calcRowIndex !== null}
        onClose={() => setCalcRowIndex(null)}
        onInsert={(value) => updateRow(calcRowIndex, "weight", String(value))}
      />
    </View>
  );
}
