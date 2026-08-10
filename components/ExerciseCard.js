import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLastLoggedSession, getLoggedSetsForDate, logResult } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";
import { ExerciseHistoryModal } from "./ExerciseHistoryModal";
import { WeightCalculator } from "./WeightCalculator";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { useScrollToKeyboard } from "../lib/scrollToKeyboard";
import { useShowLastTime, setShowLastTime } from "../lib/lastTimePref";
import { PressFade } from "./PressFade";
import { setAccessoryAction, clearAccessoryAction } from "../lib/keyboardAccessory";

const AUTOSAVE_DELAY_MS = 900;

// Design tokens from design_handoff_visual_pass_v4/README.md, extended by
// design_handoff_member_mobile_v5 (1d).
const CARD_BORDER = "#ece7e1";
const INPUT_BORDER = "#d9d4cd";
const PILL_BG = "#fdece5";
const PILL_TEXT = "#b23a22";
const OLIVE = "#4d6142";
const OLIVE_BORDER = "#dbe8cf";
const CANVAS = "#faf8f6";
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";
const WEIGHT_STEP = 2.5; // smallest real plate pair in the gym

// "0:20" / "90" / "90s" → seconds. Coach-authored free text (the column is
// still text — v5 flags making it a real integer as a separate coach-side
// ticket), so this stays forgiving rather than assuming a format.
function parseRestSeconds(rest) {
  if (!rest) return null;
  const raw = String(rest).trim();
  if (raw.includes(":")) {
    const [m, s] = raw.split(":");
    const total = (Number(m) || 0) * 60 + (Number(s) || 0);
    return total > 0 ? total : null;
  }
  const digits = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(digits) && digits > 0 ? Math.round(digits) : null;
}

function formatSeconds(total) {
  const mm = Math.floor(total / 60);
  const ss = String(Math.max(0, total) % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// One ± group. The 44pt buttons are the point — this is meant to be usable
// standing at a rack without the keyboard, though the value itself is still
// a real field, so tapping it opens the numeric keypad (both work, per
// direct ask).
function Stepper({ label, value, onChange, step = 1, min = 0, onFocusField, onBlurField, inputRef }) {
  const numeric = value === "" ? null : Number(value);
  const bump = (delta) => {
    const base = numeric ?? 0;
    const next = Math.max(min, Math.round((base + delta) * 100) / 100);
    onChange(String(next));
  };
  return (
    <View style={{ flex: 1 }}>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: "#a8a29e", marginBottom: 5 }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: CANVAS, borderRadius: 14, padding: 5, gap: 5 }}>
        <PressFade
          onPress={() => bump(-step)}
          accessibilityLabel={`Decrease ${label}`}
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="remove" size={19} color="#8a5140" />
        </PressFade>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          onFocus={onFocusField}
          onBlur={onBlurField}
          keyboardType="decimal-pad"
          placeholder="–"
          placeholderTextColor="#c9c4bd"
          autoComplete="off"
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.1}
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            textAlign: "center",
            backgroundColor: "#fff",
            borderRadius: 9,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            fontFamily: fonts.display,
            fontSize: 22,
            color: "#44403c",
          }}
        />
        <PressFade
          onPress={() => bump(step)}
          accessibilityLabel={`Increase ${label}`}
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={19} color="#8a5140" />
        </PressFade>
      </View>
    </View>
  );
}

// Rest never auto-starts (explicit in the handoff) — it defaults to the
// coach's programmed rest and only runs on tap. With no programmed value it
// reads "Rest" and offers the same presets the old inline timer had.
function RestButton({ seconds }) {
  const [endsAt, setEndsAt] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, tick] = useState(0);
  const remainingMs = endsAt ? endsAt - Date.now() : null;
  const running = endsAt !== null && remainingMs > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  const start = (secs) => {
    setPickerOpen(false);
    setEndsAt(Date.now() + secs * 1000);
  };

  const label = running ? formatSeconds(Math.ceil(remainingMs / 1000)) : seconds ? formatSeconds(seconds) : "Rest";

  return (
    <>
      <PressFade
        onPress={() => (running ? setEndsAt(null) : seconds ? start(seconds) : setPickerOpen(true))}
        accessibilityLabel={running ? "Cancel rest timer" : "Start rest timer"}
        style={{
          width: 96,
          borderRadius: 15,
          backgroundColor: PEACH_BG,
          borderWidth: 1.5,
          borderColor: running ? colors.primary : PEACH_BORDER,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 8,
        }}
      >
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 17, color: "#8a5140" }}>
          {label}
        </Text>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.9, color: "#c0a294" }}>
          {running ? "TAP TO STOP" : "REST"}
        </Text>
      </PressFade>
      {pickerOpen ? (
        <View style={{ position: "absolute", right: 0, bottom: 58, flexDirection: "row", gap: 6, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: CARD_BORDER, padding: 6 }}>
          {[60, 90, 120].map((s) => (
            <PressFade
              key={s}
              onPress={() => start(s)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: CANVAS }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#8a5140" }}>{formatSeconds(s)}</Text>
            </PressFade>
          ))}
        </View>
      ) : null}
    </>
  );
}

// "3 × 10 @ 65" when last time was uniform, otherwise the sets spelled out.
function summarizeHistorySets(sets) {
  const real = sets.filter((s) => s.reps != null || s.weight != null);
  if (real.length === 0) return "no sets logged";
  const reps = real.map((s) => s.reps);
  const weights = real.map((s) => s.weight);
  if (new Set(reps).size <= 1 && new Set(weights).size <= 1) {
    return `${real.length} × ${reps[0] ?? "–"}${weights[0] != null ? ` @ ${weights[0]} lb` : ""}`;
  }
  return real.map((s) => `${s.reps ?? "–"}${s.weight != null ? `@${s.weight}` : ""}`).join(", ");
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

// Prescription only — tempo and rest belong to the target, but the coach's
// free-text note deliberately does NOT live here anymore. It used to be
// glued on with "·" in the same muted color, and on the index rows the
// whole line (note included) got replaced by the logged summary the moment
// a set was saved — the note gets its own labeled line now (see
// coachNoteFor / the render below).
export function targetLineFor(item) {
  const parts = [`Target: ${getTargetSets(item)} sets × ${repSchemeSummary(item.repScheme) ?? item.targetReps ?? "–"}`];
  if (item.tempo) parts.push(`tempo ${item.tempo}`);
  if (item.rest) parts.push(`rest ${item.rest}`);
  return parts.join(" · ");
}

export function coachNoteFor(item) {
  return item.notes || null;
}

// One exercise's logging card — used both by SessionLogger's accordion
// layout (expanded/onToggle drive an inline expand/collapse) and by
// SessionFocusModal's focus layout (forceExpanded keeps it permanently
// populated, no header tap needed — see SessionFocusModal.js for why every
// group's card has to mount immediately either way, not lazily).
export function ExerciseCard({
  userId,
  datePerformed,
  source,
  item,
  expanded,
  onToggle,
  hideVideo,
  forceExpanded,
  scrollViewRef,
  scrollOffsetRef,
  exerciseCompletionType,
  completed,
  showAdvanceArrow,
  onToggleComplete,
  onAdvance,
  onDataChanged,
}) {
  const targetSets = getTargetSets(item);
  const [rows, setRows] = useState(() => Array.from({ length: targetSets }, () => ({ reps: "", weight: "" })));
  const [notes, setNotes] = useState("");
  // How many sets are "logged" — the progression the Log set button
  // drives (v5, 1d). Deliberately separate from whether the fields have
  // values: carry-over prefills the next set before it's been done, so
  // "has numbers in it" can't stand in for "completed". Persistence is
  // unchanged — every keystroke still autosaves, so nothing depends on
  // the member remembering to press it.
  const [loggedCount, setLoggedCount] = useState(0);
  // "Last time" shows by default — the whole point of the lift-tracking
  // pass is seeing last time's numbers without asking for them. The
  // preference is device-local and shared across every card
  // (lib/lastTimePref.js), so one "Hide" sticks for all exercises/sessions
  // instead of resetting per card the way the old per-card toggle did.
  const showHistory = useShowLastTime();
  const [history, setHistory] = useState(null); // null until loaded — see historyLoaded for "loaded but genuinely empty"
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  // Which row's calculator modal is open, if any. The icon itself is always
  // visible next to a weight box (not gated on TextInput focus) — an
  // opacity/pointerEvents toggle keyed off focus turned out to race with
  // the tap itself: tapping the icon blurs the TextInput, and on both web
  // and native that blur can land before the press finishes, hiding the
  // icon out from under the tap. Not worth chasing further; always-visible
  // has no such race.
  const [calcRowIndex, setCalcRowIndex] = useState(null);
  const loaded = useRef(false);
  const debounceRef = useRef(null);
  // The load-on-expand effect below sets rows/notes from whatever's already
  // saved today, which would otherwise immediately re-trigger the autosave
  // effect — this skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);
  // Same skip-once idiom as skipAutosaveRef, for the auto-complete effect
  // below — loading already-saved (possibly already-full) sets shouldn't
  // itself count as "just became complete" and re-fire a mark, especially
  // if the member had since manually unchecked a fully-logged exercise.
  const skipCompletionEffectRef = useRef(true);
  const wasFullyFilledRef = useRef(false);
  // A single exercise's content is usually short enough to already be
  // visible once the keyboard opens, but a superset's two stacked full
  // cards often aren't — the second (bottom) exercise's fields can end up
  // hidden behind the keyboard with nothing to bring them into view
  // automatically. useScrollToKeyboard (lib/scrollToKeyboard.js) handles
  // both the "keyboard already up, just switching fields" case (immediate
  // call) and the "very first focus of the screen, keyboard frame not
  // known yet" race (retried once keyboardDidShow actually fires) — see
  // that file for why both are needed. Native only, same reasoning as
  // before.
  //
  // The scroll target on focus is this whole card, not the specific field
  // tapped — scrolling to just the field left the rest of the card (Notes,
  // any sets below it) still hidden behind the keyboard, per direct
  // feedback. If the card's taller than the space available above the
  // keyboard it'll scroll as far as it can and simply not fit the top of
  // the card on screen at the same time, which is the correct tradeoff
  // here — the fields still being edited (further down the card) are what
  // need to stay reachable, not the card's own heading.
  const cardRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  const loadOnFirstExpand = async () => {
    if (loaded.current) return;
    loaded.current = true;
    const todaysSets = await getLoggedSetsForDate(userId, item.exercise.id, datePerformed);
    if (todaysSets.length > 0) {
      skipAutosaveRef.current = true;
      skipCompletionEffectRef.current = true;
      setRows((prev) =>
        prev.map((row, i) => {
          const existing = todaysSets.find((s) => s.set_number === i + 1);
          return existing ? { reps: existing.reps === null ? "" : String(existing.reps), weight: existing.weight === null ? "" : String(existing.weight) } : row;
        })
      );
      const notedRow = todaysSets.find((s) => s.notes);
      if (notedRow) setNotes(notedRow.notes);
      // Reopening a session mid-way: every leading set that already has
      // both numbers counts as logged, so the card resumes on the right one
      // instead of restarting at set 1.
      let restored = 0;
      for (let i = 0; i < targetSets; i += 1) {
        const existing = todaysSets.find((s) => s.set_number === i + 1);
        if (existing && existing.reps !== null && existing.weight !== null) restored += 1;
        else break;
      }
      setLoggedCount(restored);
    }
  };

  const isExpanded = forceExpanded || expanded;

  const handleToggle = () => {
    if (!expanded) loadOnFirstExpand();
    onToggle(item.id);
  };

  // In focus layout there's no header tap to expand from — this card is
  // mounted permanently inside SessionFocusModal and just stays populated
  // from here on.
  useEffect(() => {
    if (forceExpanded) loadOnFirstExpand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded]);

  // Fetched once per card, whenever it's open with the pref on — covers the
  // default-on case and re-enabling after Hide. Hiding just hides; the
  // loaded data sticks around.
  const loadHistory = async () => {
    if (historyLoaded || historyLoading) return;
    setHistoryLoading(true);
    try {
      const last = await getLastLoggedSession(userId, item.exercise.id, datePerformed);
      setHistory(last);
      setHistoryLoaded(true);
    } catch (err) {
      console.error("Failed to load last-time history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded && showHistory) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, showHistory]);

  const handleToggleHistory = () => setShowLastTime(!showHistory);

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  // Carry-over (v5, 1d): the set that just became current inherits the one
  // before it, so a straight 3×10 @ 65 is three taps. The very first set
  // falls back to last time's matching set instead. Only ever fills a blank
  // field — it never overwrites something already typed.
  useEffect(() => {
    const i = loggedCount;
    if (i >= rows.length) return;
    const source = i > 0 ? rows[i - 1] : null;
    const histSet = i === 0 && history ? history.sets.find((s) => s.set_number === 1) : null;
    const reps = source ? source.reps : histSet?.reps != null ? String(histSet.reps) : "";
    const weight = source ? source.weight : histSet?.weight != null ? String(histSet.weight) : "";
    if (!reps && !weight) return;
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i ? { reps: r.reps === "" ? reps : r.reps, weight: r.weight === "" ? weight : r.weight } : r
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedCount, history]);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
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
        // Only meaningful once a session's already been finalized — the
        // parent (My Fitness) uses this to revert the Finalize button back
        // to its unfinalized state, since the finalized_at timestamp in the
        // database doesn't know a set was just edited after the fact. Not
        // gated here on whether the session is actually finalized — the
        // parent already knows that and just no-ops if it isn't relevant.
        onDataChanged?.();
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, notes]);

  // Auto-fills the checkbox to solid the moment every set has both reps and
  // weight — fires only on a genuine false→true transition (detected via
  // wasFullyFilledRef), never on every keystroke, and never auto-*un*-
  // completes when a field is later cleared (that's an explicit tap on the
  // solid checkbox only). The actual mark/unmark API call, the "did the
  // whole superset group just finish" check, and the delayed advance all
  // live in the parent (SessionFocusModal) now — a superset's two cards
  // both report up to it, so it's the only place that can correctly decide
  // when to actually move on, rather than each card advancing the instant
  // its own checkbox is hit.
  useEffect(() => {
    if (!exerciseCompletionType) return;
    const fullyFilled = rows.length > 0 && rows.every((r) => r.reps !== "" && r.weight !== "");
    if (skipCompletionEffectRef.current) {
      skipCompletionEffectRef.current = false;
      wasFullyFilledRef.current = fullyFilled;
      return;
    }
    if (fullyFilled && !wasFullyFilledRef.current) {
      onToggleComplete?.(true, "auto");
    }
    wasFullyFilledRef.current = fullyFilled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <View
      ref={cardRef}
      className="mb-2.5 rounded-2xl bg-white px-4"
      style={
        isExpanded
          ? {
              borderWidth: 1.5,
              borderColor: colors.primary,
              paddingVertical: 18,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.08,
              shadowRadius: 22,
            }
          : { borderWidth: 1, borderColor: CARD_BORDER, paddingVertical: 15, shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }
      }
    >
      {forceExpanded ? (
        <View style={{ gap: 2 }}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 27, lineHeight: 31, color: "#44403c" }}>
            {item.exercise.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>{targetLineFor(item)}</Text>
        </View>
      ) : (
        <Pressable onPress={handleToggle} className="flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: expanded ? 15 : 14, color: "#44403c" }}>
              {item.exercise.name}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>{targetLineFor(item)}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={expanded ? "#a8a29e" : "#d6d3d1"} />
        </Pressable>
      )}

      {isExpanded && (
        <View className="mt-3">
          {coachNoteFor(item) ? (
            <Text className="mb-2" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Coach note: </Text>
              {coachNoteFor(item)}
            </Text>
          ) : null}
          {item.exercise.cues ? (
            <Text className="mb-2" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Cues: </Text>
              {item.exercise.cues}
            </Text>
          ) : null}
          {/* Outlined pills (v5, 1d) rather than bare text links. */}
          <View className="mb-3 flex-row flex-wrap items-center" style={{ gap: 8 }}>
            {!hideVideo && item.exercise.video_url ? (
              <PressFade
                onPress={() => Linking.openURL(item.exercise.video_url)}
                accessibilityLabel={`Watch video for ${item.exercise.name}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: CARD_BORDER,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Ionicons name="play" size={11} color={colors.primaryOnWhite} />
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>Watch video</Text>
              </PressFade>
            ) : null}
            <PressFade
              onPress={() => setShowAllHistory(true)}
              accessibilityLabel="History and progress chart"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Ionicons name="trending-up-outline" size={12} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>History + chart</Text>
            </PressFade>
            <PressFade
              onPress={handleToggleHistory}
              accessibilityLabel={showHistory ? "Hide last time" : "Show last time"}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Ionicons name={showHistory ? "time" : "time-outline"} size={12} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>
                {showHistory ? "Hide last time" : "Show last time"}
              </Text>
            </PressFade>
          </View>

          {/* The "last time" summary block — one line, not a per-set list;
              the per-set reference now rides the current set row instead. */}
          {showHistory && history ? (
            <View
              className="mb-3 flex-row items-center"
              style={{ gap: 8, backgroundColor: PILL_BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: PILL_TEXT }} />
              <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 11.5, color: PILL_TEXT }}>
                Last time {formatDateMDY(history.date)} | {summarizeHistorySets(history.sets)}
              </Text>
            </View>
          ) : null}
          {showHistory && historyLoading ? (
            <Text className="mb-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              Loading last time…
            </Text>
          ) : null}
          {showHistory && historyLoaded && history === null ? (
            <Text className="mb-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              No previous history for this lift yet.
            </Text>
          ) : null}

          {rows.map((row, i) => {
            // Matched by set_number, not position — if last time had more
            // or fewer sets than today's target, only the sets that line
            // up by number get an annotation; anything else is silently
            // dropped rather than showing a mismatched row.
            const histSet = showHistory && history ? history.sets.find((s) => s.set_number === i + 1) : null;
            const state = i < loggedCount ? "logged" : i === loggedCount ? "current" : "upcoming";

            if (state === "logged") {
              return (
                <PressFade
                  key={i}
                  onPress={() => setLoggedCount(i)}
                  accessibilityLabel={`Set ${i + 1} logged, tap to edit`}
                  style={{
                    marginBottom: 8,
                    backgroundColor: "#fff",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: OLIVE_BORDER,
                    borderLeftWidth: 4,
                    borderLeftColor: OLIVE,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8, color: "#a8a29e", width: 38 }}>
                    SET {i + 1}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                    <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 21, color: "#44403c" }}>
                      {row.reps || "–"}
                    </Text>
                    <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                      reps
                    </Text>
                    {row.weight ? (
                      <>
                        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 21, color: "#44403c", marginLeft: 8 }}>
                          {row.weight}
                        </Text>
                        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                          lb
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <Ionicons name="checkmark-circle" size={30} color={OLIVE} />
                </PressFade>
              );
            }

            if (state === "upcoming") {
              const preview = [row.reps ? `${row.reps} reps` : `${item.repScheme?.[i] ?? item.targetReps ?? "–"} reps`, row.weight ? `${row.weight} lb` : null]
                .filter(Boolean)
                .join(" | ");
              return (
                <View
                  key={i}
                  style={{
                    marginBottom: 8,
                    opacity: 0.6,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8, color: "#a8a29e", width: 38 }}>
                    SET {i + 1}
                  </Text>
                  <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                    {preview}
                    {row.weight ? " | carried over" : ""}
                  </Text>
                </View>
              );
            }

            return (
              <View
                key={i}
                style={{
                  marginBottom: 10,
                  backgroundColor: "#fff",
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.1,
                  shadowRadius: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.9, color: "#8a5140" }}>
                    SET {i + 1} | NOW
                  </Text>
                  {histSet ? (
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: PILL_TEXT, flexShrink: 1 }}>
                      last: {histSet.reps ?? "–"} reps{histSet.weight ? ` @ ${histSet.weight}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Stepper
                    label="Reps"
                    value={row.reps}
                    onChange={(v) => updateRow(i, "reps", v)}
                    onFocusField={() => scrollFieldIntoView(cardRef.current)}
                  />
                  <Stepper
                    label="Weight"
                    value={row.weight}
                    step={WEIGHT_STEP}
                    onChange={(v) => updateRow(i, "weight", v)}
                    // The calculator moves onto the keyboard bar while a
                    // weight field is focused (v5, 1d) instead of living as
                    // a permanent icon inside the field.
                    onFocusField={() => {
                      scrollFieldIntoView(cardRef.current);
                      setAccessoryAction({
                        key: `${item.id}-w-${i}`,
                        label: "Calculator",
                        icon: "calculator-outline",
                        onPress: () => {
                          Keyboard.dismiss();
                          setCalcRowIndex(i);
                        },
                      });
                    }}
                    onBlurField={() => clearAccessoryAction(`${item.id}-w-${i}`)}
                  />
                </View>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 12 }}>
                  <PressFade
                    onPress={() => setLoggedCount(i + 1)}
                    disabled={row.reps === "" && row.weight === ""}
                    accessibilityLabel={`Log set ${i + 1}`}
                    style={{
                      flex: 1,
                      borderRadius: 15,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      paddingVertical: 14,
                      opacity: row.reps === "" && row.weight === "" ? 0.5 : 1,
                    }}
                  >
                    <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#fff" }}>
                      Log set {i + 1}
                    </Text>
                  </PressFade>
                  <RestButton seconds={parseRestSeconds(item.rest)} />
                </View>
              </View>
            );
          })}

          {showHistory && history?.sets.find((s) => s.notes) ? (
            <Text className="mb-2" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              Last time's note: {history.sets.find((s) => s.notes).notes}
            </Text>
          ) : null}

          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", marginBottom: 6 }}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onFocus={() => scrollFieldIntoView(cardRef.current)}
            multiline
            inputAccessoryViewID={NUMERIC_DONE_ID}
            placeholder="How did it feel? Anything to remember for next time?"
            placeholderTextColor="#a8a29e"
            className="mb-2.5"
            style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c", minHeight: 52, borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
          />

          {saveState === "saved" ? (
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#4d6142" }} />
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>Saved automatically</Text>
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              {saveState === "pending" && "Unsaved changes…"}
              {saveState === "saving" && "Saving…"}
              {saveState === "error" && "Couldn't save — check your connection."}
            </Text>
          )}

          {exerciseCompletionType ? (
            // A manual tap already advances on its own (see
            // SessionFocusModal's handleToggleComplete), so there's nothing
            // for an arrow to do then — it only ever shows once the app
            // auto-fills this card solid, as a deliberate "move on when
            // you're ready" control. Both stay anchored to the right edge
            // (flex-end), checkbox first then arrow (left to right) — the
            // arrow takes the rightmost spot the checkbox used to sit in,
            // and the checkbox scoots just far enough left to make room for
            // it, not all the way across the row (an earlier "space-between"
            // version did that, which read as the checkbox jumping to the
            // opposite side entirely).
            <View className="mt-3 flex-row items-center justify-end" style={{ gap: 10 }}>
              <Pressable
                onPress={() => onToggleComplete?.(!completed, "manual")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={completed ? "Mark exercise not complete" : "Mark exercise complete"}
              >
                <Ionicons name={completed ? "checkmark-circle" : "checkmark-circle-outline"} size={36} color="#4d6142" />
              </Pressable>
              {showAdvanceArrow && onAdvance ? (
                <Pressable
                  onPress={onAdvance}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Next exercise"
                  className="items-center justify-center"
                  style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#e7e5e4" }}
                >
                  <Ionicons name="chevron-forward" size={17} color="#4d6142" />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <ExerciseHistoryModal
            visible={showAllHistory}
            onClose={() => setShowAllHistory(false)}
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
      )}
    </View>
  );
}
