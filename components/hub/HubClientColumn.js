import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { PressFade } from "../PressFade";
import { ClientGoalLine } from "../ClientGoalCard";
import { SetBubbleRow, hubBubbleSize } from "./HubSetBubbles";
import { HubLiftCard, coachInstruction } from "./HubLiftCard";
import { HubDock, DockPill } from "./HubDock";
import { HubNumberPad } from "./HubNumberPad";
import { HubPlateCalcStrip, HubPlateCalcGrid, useHubPlateCalc } from "./HubPlateCalc";
import { HubHistoryStrip, HubHistoryPanel } from "./HubLiftHistory";
import { schemeLabel } from "../builder/SessionBuilderParts";
import { supersetLettersFor } from "../../lib/programming/spcBlockDetail";
import { getLiftBlockHistory } from "../../lib/programming/hub";
import { confirmDropFromBoard } from "../../lib/confirmDialog";
import { registerHubKeyboard, focusHubKeyboard } from "../../lib/hubKeyboard";
import { fonts, colors, type } from "../../lib/theme";

// One client's live session — a vertical "phone screen" on the wall display
// and the same thing, narrower, on the coach's phone. Two surfaces, one
// pattern: expand a lift IN PLACE, type into it on the docked keypad below,
// collapse. There is no modal on either surface any more.
//
// This component owns the editing state rather than the board above it,
// because two columns can genuinely be expanded at once (a coach running
// four people moves between two racks) — a single shared "the open pad"
// would make that impossible.
//
// Persistence is autosave, debounced, NOT commit-on-Save: the design has no
// Save button anywhere, and the member app's own logging has worked this way
// since the v5 pass. useHubBoard freezes THIS lift's logs against the poll
// while it is being edited, so a client's phone writing a different lift
// still lands live.

const CARD_BORDER = "#ece7e1";
const DONE = "#4d6142";
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";
const SAVE_DEBOUNCE_MS = 700;

// ── The column grid ────────────────────────────────────────────────────────
// Every block in a column is a FIXED height whether or not it has content, so
// the client names line up, the goals line up, the warm-up strips line up, and
// "lift 3" sits at the same y in all four columns. That is the whole point of
// being able to reorder lifts: a coach scanning the wall reads ACROSS, not
// down, and a row that has drifted 30px is a row you have to hunt for.
//
// So a block with no data reserves its space instead of collapsing. Before
// this, a client with no goal, or with no warm-ups, or a finalized column
// (whose 6px olive bar pushed its own content down), each started its lift
// list at a different height from its neighbours.
//
// Two things still break alignment, both deliberately: a column with a lift
// expanded, and a column somebody has scrolled. Both are the column being
// actively worked in, which is the one place it doesn't matter.
const FINALIZED_BAR_H = 6;
const HEADER_NAME_H_TV = 26;
const HEADER_NAME_H_COMPACT = 22;
const HEADER_META_H = 16;
const GOAL_GAP = 8;
const GOAL_H = 27; // ClientGoalLine tone="pill" size="md"
const WARMUP_H = 45; // collapsed strip; expanding is deliberate and local
const ROW_NAME_H = 26; // governed by the 26px completion tick, not the text
const ROW_SCHEME_H = 18;
const ROW_BUBBLES_H = 32;
// Borders (1.5 x 2) + padding (9 + 10) + the three fixed blocks.
const RESTING_ROW_H = 3 + 9 + ROW_NAME_H + ROW_SCHEME_H + ROW_BUBBLES_H + 10;
const RESTING_ROW_GAP = 8;

function summaryText(item, logs) {
  const tracksWeight = item.exercise?.tracks_weight !== false;
  const real = (logs ?? []).filter((r) => r.reps != null || r.weight != null);
  if (real.length === 0) {
    return schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps }, item.exercise);
  }
  return real
    .sort((a, b) => (a.set_number ?? 1) - (b.set_number ?? 1))
    .map((r) => (tracksWeight && r.weight != null ? `${r.reps ?? "–"}×${r.weight}` : `${r.reps ?? "–"}`))
    .join(" · ");
}

// The draft rows for a lift, built from what is already logged. Shared by the
// initial seed and by the poll merge below so the two cannot drift on set
// count or on what an empty box means.
function rowsFromLogs(item, logs, atLeast = 0) {
  const targetSets = item.targetSets > 0 ? item.targetSets : 3;
  const maxSet = (logs ?? []).reduce((m, r) => Math.max(m, r.set_number ?? 1), 0);
  const count = Math.max(targetSets, maxSet, atLeast);
  return Array.from({ length: count }, (_, i) => {
    const row = (logs ?? []).find((r) => (r.set_number ?? 1) === i + 1);
    return {
      reps: row?.reps != null ? String(row.reps) : "",
      weight: row?.weight != null ? String(row.weight) : "",
    };
  });
}

function sameRows(a, b) {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.reps === b[i].reps && r.weight === b[i].weight);
}

function CompletionTick({ completed, onPress, size = 26 }) {
  return (
    <PressFade onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingLeft: 6 }}>
      <Ionicons name={completed ? "checkmark-circle" : "checkmark-circle-outline"} size={size} color={DONE} />
    </PressFade>
  );
}

function LetterChip({ letter }) {
  if (!letter) return null;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: PEACH_BG,
        borderWidth: 1,
        borderColor: PEACH_BORDER,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 7,
      }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite }}>{letter}</Text>
    </View>
  );
}

function ReorderArrows({ isFirst, isLast, onMove }) {
  return (
    <View style={{ flexDirection: "row" }}>
      <PressFade onPress={() => onMove(-1)} disabled={isFirst} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 4, opacity: isFirst ? 0.3 : 1 }}>
        <Ionicons name="arrow-up-circle" size={26} color={colors.primary} />
      </PressFade>
      <PressFade onPress={() => onMove(1)} disabled={isLast} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 4, opacity: isLast ? 0.3 : 1 }}>
        <Ionicons name="arrow-down-circle" size={26} color={colors.primary} />
      </PressFade>
    </View>
  );
}

// A resting lift: name, prescription, that lift's sets as bubbles, its tick.
function RestingRow({ item, letter, logs, completed, hasNote, editOrder, canReorder, isFirst, isLast, onPress, onToggleComplete, onMove }) {
  const tracksWeight = item.exercise?.tracks_weight !== false;
  const indent = letter ? 29 : 0;
  const targetCount = item.targetSets > 0 ? item.targetSets : 3;
  // A client logging a fourth set on a 3-set lift must not make her row taller
  // than the same lift in the next column, so the size is chosen off whatever
  // the row will actually draw, not off the prescription alone.
  const setCount = Math.max(targetCount, (logs ?? []).reduce((m, r) => Math.max(m, r.set_number ?? 0), 0));
  return (
    <PressFade
      onPress={onPress}
      style={{
        height: RESTING_ROW_H,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: completed ? DONE : CARD_BORDER,
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: 10,
        marginBottom: RESTING_ROW_GAP,
        overflow: "hidden",
      }}
    >
      <View style={{ height: ROW_NAME_H, flexDirection: "row", alignItems: "center" }}>
        <LetterChip letter={letter} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: "#292524" }}>
          {item.exercise.name}
        </Text>
        {hasNote ? <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.primaryOnWhite} style={{ marginRight: 4 }} /> : null}
        {editOrder && canReorder ? (
          <ReorderArrows isFirst={isFirst} isLast={isLast} onMove={onMove} />
        ) : (
          <CompletionTick completed={completed} onPress={onToggleComplete} />
        )}
      </View>
      <View style={{ height: ROW_SCHEME_H, justifyContent: "center", marginLeft: indent }}>
        {/* The coach's note rides the prescription line rather than earning a
            row of its own: these rows are fixed-height so the same lift lands
            at the same y in every column, and a fourth line would break that
            for all four clients. Clay against the muted prescription, so
            "V-Handle" reads as an instruction and not as more of the
            programming. Truncates on a long one — the whole note is one tap
            away on the card. */}
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
          {schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps }, item.exercise)}
          {item.rest ? ` | Rest ${item.rest}` : ""}
          {coachInstruction(item) ? (
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>{` | ${coachInstruction(item)}`}</Text>
          ) : null}
        </Text>
      </View>
      <View style={{ height: ROW_BUBBLES_H, justifyContent: "center", overflow: "hidden", marginLeft: indent }}>
        <SetBubbleRow
          sets={logs}
          targetCount={targetCount}
          targetFor={(i) => item.repScheme?.[i - 1] ?? item.targetReps ?? null}
          tracksWeight={tracksWeight}
          size={hubBubbleSize(setCount)}
          wrap={false}
        />
      </View>
    </PressFade>
  );
}

// Every other lift, while one is expanded. Name, that lift's set summary,
// its tick — nothing else. Full rows are ~104px each and five of them plus a
// usable card does not fit in a column's 992px at any client count, so this
// is arithmetic rather than taste.
function CollapsedRow({ item, letter, logs, completed, hasNote, editOrder, canReorder, isFirst, isLast, onPress, onToggleComplete, onMove }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: completed ? "#cfdcc2" : CARD_BORDER,
        backgroundColor: "white",
        paddingHorizontal: 10,
        height: 34,
        marginBottom: 5,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {letter ? (
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite, marginRight: 6 }}>{letter}</Text>
      ) : null}
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#292524" }}>
        {item.exercise.name}
      </Text>
      {hasNote ? <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.primaryOnWhite} style={{ marginRight: 5 }} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.muted, maxWidth: "52%" }}>
        {summaryText(item, logs)}
      </Text>
      {editOrder && canReorder ? (
        <View style={{ marginLeft: 4 }}>
          <ReorderArrows isFirst={isFirst} isLast={isLast} onMove={onMove} />
        </View>
      ) : (
        <CompletionTick completed={completed} onPress={onToggleComplete} size={19} />
      )}
    </PressFade>
  );
}

// The bottom of a scrolling list fades out, so a card cut at the fold reads
// as "there is more below". No scrollbar anywhere: a classic one consumes
// content width in the scrolling column only, which would render that
// client's cards ~19px narrower than its neighbours' on a four-up wall.
function ListFade() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="hubFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hubFade)" />
      </Svg>
    </View>
  );
}

export function HubClientColumn({
  entry,
  userId,
  warmups,
  scale = "tv",
  authorName = null,
  onToggleComplete,
  onMoveLift,
  onToggleFinalize,
  onBeginEdit,
  onEndEdit,
  onEditDirty,
  onSaveSets,
  onSaveNote,
  onDropClient = null,
}) {
  const compact = scale !== "tv";
  const nameH = compact ? HEADER_NAME_H_COMPACT : HEADER_NAME_H_TV;
  const [editOrder, setEditOrder] = useState(false);
  // Position lives on the join row, and a group program's join row is shared
  // by everyone on it — so reordering an LLYL column would rewrite that week's
  // session for the whole group. The toggle stays (it is also where dropping a
  // client lives) but it opens drop-only.
  const canReorder = entry.kind !== "group";
  const [showWarmups, setShowWarmups] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  // null until a box is actually tapped. The keypad is the tallest thing on
  // the card, and a coach reading a lift she is not typing into wants that
  // space back — so "a cell is focused" and "the keypad is up" are one fact,
  // not two. Dismissing leaves a "Show keypad" bar rather than stranding it.
  const [active, setActive] = useState(null);
  const [dock, setDock] = useState(null); // keypad | calculator | history | null
  const [history, setHistory] = useState(undefined); // undefined = loading
  const [overflow, setOverflow] = useState({ scrollable: false, remaining: 0 });

  const calc = useHubPlateCalc();
  const saveTimer = useRef(null);
  const seededFor = useRef(null);
  const noteSeed = useRef("");
  const rowsRef = useRef([]);
  rowsRef.current = rows;
  // The active cell needs the same hand-advanced ref as the rows, and for the
  // same reason: a hardware keyboard can deliver Tab-then-digit inside one
  // tick, and a handler reading `active` out of its render closure would move
  // the caret and then type into the box it just left.
  const activeRef = useRef(active);
  activeRef.current = active;
  const applyActive = (next) => {
    activeRef.current = next;
    setActive(next);
  };
  // Where the keypad lands when summoned without a box being tapped (the
  // "Show keypad" bar, or a hardware keystroke). Computed on expand, so the
  // "first box still needing a number" seeding survives the keypad no longer
  // opening on its own.
  const suggestedCell = useRef({ set: 0, field: "reps" });
  const focusCell = (next) => {
    applyActive(next);
    suggestedCell.current = next;
    setDock("keypad");
  };
  const blurCell = () => {
    applyActive(null);
    setDock(null);
  };
  // A hardware keystroke IS a coach reaching for a box, so it opens one rather
  // than going nowhere. typingIntoAField() in lib/hubKeyboard already keeps
  // these keys away from the note box, so this can never steal prose.
  const ensureCell = () => {
    const cell = activeRef.current;
    if (cell) return cell;
    const next = suggestedCell.current ?? { set: 0, field: "reps" };
    focusCell(next);
    return next;
  };
  // A draft counts as dirty from the keystroke until the WRITE LANDS, not
  // until the debounce merely fires. Those are different moments, and
  // treating them as one is what let the poll adopt pre-edit logs over
  // digits that were still in flight, clearing the box a beat after it was
  // typed into (reported 2026-08-23).
  //
  // Seq numbers rather than a boolean, mirroring useHubBoard's own: a
  // keystroke arriving while a write is in flight bumps editSeq, so the
  // write that is finishing cannot declare the newer digits saved. Equal
  // seqs — including the 0/0 a freshly opened card starts at — mean nothing
  // is pending, so opening a lift to look at it and closing it writes nothing.
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const inFlightSeq = useRef(-1);
  const isDirty = () => editSeq.current !== savedSeq.current;

  // Superset letters precomputed per item id — a counter mutated during
  // render hands out wrong suffixes under list re-render.
  const letterById = useMemo(() => {
    const letters = supersetLettersFor(entry.items);
    const seen = {};
    const map = new Map();
    for (const item of entry.items) {
      if (!item.supersetGroupId) continue;
      seen[item.supersetGroupId] = (seen[item.supersetGroupId] ?? 0) + 1;
      map.set(item.id, `${letters[item.supersetGroupId]}${seen[item.supersetGroupId]}`);
    }
    return map;
  }, [entry.items]);

  const expandedItem = expandedId ? entry.items.find((i) => i.id === expandedId) ?? null : null;
  const expandedLogs = expandedItem ? entry.logsByExerciseId.get(expandedItem.exercise.id) : null;
  const siblings = useMemo(() => {
    if (!expandedItem?.supersetGroupId) return [];
    return entry.items
      .filter((i) => i.supersetGroupId === expandedItem.supersetGroupId)
      .map((i) => ({ ...i, letter: letterById.get(i.id) ?? null }));
  }, [entry.items, expandedItem, letterById]);

  const flushSets = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  // Seed the draft when a lift opens or the superset switches.
  useEffect(() => {
    if (!expandedItem) return;
    const key = `${userId}:${expandedItem.id}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    const logs = entry.logsByExerciseId.get(expandedItem.exercise.id) ?? [];
    const seeded = rowsFromLogs(expandedItem, logs);
    setRows(seeded);
    const existing = entry.noteForWeekByExerciseId?.get(expandedItem.exercise.id) ?? null;
    setNote(existing?.body ?? "");
    noteSeed.current = existing?.body ?? "";
    // Open on the first field that still needs a number, not on set 1 — a
    // coach tapping a lift mid-session is almost always adding the set that
    // just happened, and landing on an already-logged box invites typing
    // digits onto the end of it.
    const wantsWeight = expandedItem.exercise?.tracks_weight !== false;
    let focus = { set: 0, field: "reps" };
    for (let i = 0; i < seeded.length; i++) {
      if (seeded[i].reps === "") {
        focus = { set: i, field: "reps" };
        break;
      }
      if (wantsWeight && seeded[i].weight === "") {
        focus = { set: i, field: "weight" };
        break;
      }
      if (i === seeded.length - 1) focus = { set: i, field: wantsWeight ? "weight" : "reps" };
    }
    suggestedCell.current = focus;
    applyActive(null);
    editSeq.current = 0;
    savedSeq.current = 0;
    inFlightSeq.current = -1;
    setDock(null);
    calc.reset();
    setHistory(undefined);
    getLiftBlockHistory({
      userId,
      exerciseId: expandedItem.exercise.id,
      blockId: entry.blockId,
      kind: entry.kind,
      excludeWorkoutId: entry.workoutId,
      // Without the week, a sessions-format run excludes its only workout row
      // and every past week with it.
      excludeWeekNumber: entry.completionWeek ?? null,
    })
      .then(setHistory)
      .catch(() => setHistory([])); // history is context, never a blocker on logging
    // calc is a stable-ish hook object; only the identity of the open lift matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedItem?.id, userId, entry.blockId, entry.kind, entry.workoutId]);

  useEffect(() => () => flushSets(), [flushSets]);

  // Take in sets entered somewhere else — the client's own phone, the coach's
  // phone while the wall display has the same lift up — WITHOUT closing the
  // card. Only when nothing local is pending: a clean draft is by definition
  // equal to what is stored, so adopting the poll is a no-op here and the
  // only thing it can ever bring in is somebody else's change.
  //
  // Never shrinks the row count, so a set added with "+ Add set" and not yet
  // typed into doesn't disappear underneath the coach.
  useEffect(() => {
    if (!expandedItem) return;
    if (isDirty() || saveTimer.current) return;
    const logs = entry.logsByExerciseId.get(expandedItem.exercise.id) ?? [];
    const merged = rowsFromLogs(expandedItem, logs, rowsRef.current.length);
    if (!sameRows(rowsRef.current, merged)) {
      rowsRef.current = merged;
      setRows(merged);
    }
    // A note typed elsewhere lands the same way, unless this coach has started
    // editing it here.
    const remote = entry.noteForWeekByExerciseId?.get(expandedItem.exercise.id)?.body ?? "";
    // EXACT compare, never trimmed. Trimming here made a newline invisible to
    // the "has this coach started editing?" test: typing Enter at the end of
    // an existing note left note === seed once trimmed, so this branch read it
    // as untouched and adopted `remote` straight back over it — the caret
    // dropped to line two and sprang back up (reported 2026-09-02). The trim
    // in commitNote is right; it is answering a different question, namely
    // whether the change is worth appending a row for.
    if (note === (noteSeed.current ?? "") && remote !== note) {
      noteSeed.current = remote; // no local edit in progress — adopt it
      setNote(remote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.logsByExerciseId, entry.noteForWeekByExerciseId, expandedItem?.id, note]);

  // The one place a write is issued. Marks the draft saved only once the
  // write resolves, and only if nothing was typed in the meantime — so the
  // merge effect above can never adopt the board's pre-edit snapshot over
  // work that hasn't reached the database yet. A FAILED write deliberately
  // leaves the draft dirty: the numbers on screen are the only copy, and the
  // poll must not be allowed to paint over them.
  const runSave = (item, nextRows) => {
    if (!item) return;
    const seq = editSeq.current;
    if (inFlightSeq.current === seq) return; // these exact rows are already being written
    inFlightSeq.current = seq;
    return Promise.resolve(onSaveSets?.({ exerciseId: item.exercise.id, rows: nextRows }))
      .then(() => {
        if (editSeq.current === seq) savedSeq.current = seq;
      })
      .catch(() => {});
  };

  const scheduleSave = (nextRows) => {
    editSeq.current += 1;
    onEditDirty?.(userId); // hold the poll off this lift until the write lands
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      runSave(expandedItem, nextRows);
    }, SAVE_DEBOUNCE_MS);
  };

  // Writes go through here rather than from inside a setRows updater. An
  // updater must stay pure — React may call it twice, and scheduling a save
  // (or telling the board an edit is pending) from inside one is a side
  // effect in the render phase. rowsRef is advanced by hand so two keystrokes
  // in the same tick compose instead of the second overwriting the first.
  const commitRows = (next) => {
    rowsRef.current = next;
    setRows(next);
    scheduleSave(next);
  };

  const setValue = (setIndex, field, value) => {
    commitRows(rowsRef.current.map((r, i) => (i === setIndex ? { ...r, [field]: value } : r)));
  };

  // Takes the lift explicitly rather than reading expandedItem, because the
  // switch/expand paths call it while the old lift is still the open one and
  // reading state there would be a coin flip on ordering.
  const commitNote = (item) => {
    if (!item) return;
    const body = note.trim();
    if (body === (noteSeed.current ?? "").trim()) return; // nothing changed — don't append a duplicate row
    // The RAW text, so the merge guard above keeps recognising this as the
    // coach's own in-progress edit rather than the trimmed copy coming back.
    noteSeed.current = note;
    if (!body) return; // clearing a note isn't a delete; the table is append-only
    onSaveNote?.({ exerciseId: item.exercise.id, body, authorName });
  };

  const collapse = () => {
    // Tell the board the edit is over only once the write has landed —
    // dropping the entry immediately unfreezes the poll while the write is
    // still in flight, which puts pre-edit sets back on the row you just
    // closed.
    const pending = flushLift(expandedItem);
    setExpandedId(null);
    seededFor.current = null;
    Promise.resolve(pending).finally(() => onEndEdit?.(userId));
  };

  const expand = (item) => {
    if (expandedId === item.id) {
      collapse();
      return;
    }
    flushLift(expandedItem);
    seededFor.current = null;
    setExpandedId(item.id);
    onBeginEdit?.(userId, item.exercise.id);
  };

  const switchSibling = (sib) => {
    flushLift(expandedItem);
    seededFor.current = null;
    setExpandedId(sib.id);
    onBeginEdit?.(userId, sib.exercise.id);
  };

  const tracksWeight = expandedItem?.exercise?.tracks_weight !== false;

  // rowsRef, not rows: a hardware keyboard can deliver two keystrokes inside
  // one tick, and reading state there would make the second overwrite the
  // first instead of appending to it. commitRows advances the ref by hand for
  // exactly this reason.
  const handleKey = (key) => {
    const cell = ensureCell();
    const current = rowsRef.current[cell.set]?.[cell.field] ?? "";
    if (key === "back") {
      setValue(cell.set, cell.field, current.slice(0, -1));
      return;
    }
    if (key === "." && (current.includes(".") || cell.field === "reps")) return;
    if (current.length >= 6) return;
    setValue(cell.set, cell.field, current + key);
  };

  const handleNext = () => {
    const cell = ensureCell();
    if (tracksWeight && cell.field === "reps") applyActive({ set: cell.set, field: "weight" });
    else if (cell.set + 1 < rowsRef.current.length) applyActive({ set: cell.set + 1, field: "reps" });
  };

  // Arrow keys walk the grid. Reps <-> weight sideways, set to set vertically,
  // clamped at the edges rather than wrapping — wrapping from the last set
  // back to the first is how a number ends up on the wrong row.
  const handleMove = (dir) => {
    const cell = ensureCell();
    if (dir === "left" && cell.field === "weight") applyActive({ set: cell.set, field: "reps" });
    else if (dir === "right" && tracksWeight && cell.field === "reps") applyActive({ set: cell.set, field: "weight" });
    else if (dir === "up" && cell.set > 0) applyActive({ set: cell.set - 1, field: cell.field });
    else if (dir === "down" && cell.set + 1 < rowsRef.current.length) applyActive({ set: cell.set + 1, field: cell.field });
  };

  // The keyboard next to the touchscreen types into whichever box the dock's
  // keypad would. Held in a ref because the handlers close over the current
  // rows and active cell, while the registration itself must survive every
  // render of the open card.
  const keyboardApi = useRef(null);
  keyboardApi.current = { handleKey, handleNext, handleMove };
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    if (!expandedId) return undefined;
    const unregister = registerHubKeyboard(userId, (action) => {
      const api = keyboardApi.current;
      if (!api) return;
      if (action.type === "digit") api.handleKey(action.key);
      else if (action.type === "next") api.handleNext();
      else if (action.type === "move") api.handleMove(action.dir);
    });
    focusHubKeyboard(userId);
    return unregister;
  }, [expandedId, userId]);

  const handleAddSet = () => {
    focusHubKeyboard(userId);
    const next = [...rowsRef.current, { reps: "", weight: "" }];
    rowsRef.current = next;
    setRows(next);
    focusCell({ set: next.length - 1, field: "reps" });
  };

  // One place that decides whether a pending draft is worth writing.
  const flushLift = (item) => {
    flushSets();
    if (!item) return;
    const pending = isDirty() ? runSave(item, rowsRef.current) : null;
    commitNote(item);
    return pending;
  };

  const handleSameAsLast = () => {
    const cell = activeRef.current;
    if (!cell || cell.set === 0) return;
    const prev = rowsRef.current;
    commitRows(prev.map((r, i) => (i === cell.set ? { ...prev[cell.set - 1] } : r)));
  };

  const handleInsertWeight = (total) => {
    const cell = ensureCell();
    setValue(cell.set, "weight", String(total));
    setDock("keypad");
  };

  const handleDrop = async () => {
    if (!onDropClient) return;
    if (!(await confirmDropFromBoard(entry.clientName))) return;
    setEditOrder(false);
    onDropClient();
  };

  const warmupRows = warmups ?? [];
  const hasWarmups = warmupRows.length > 0;
  // showWarmups can survive a client having their warm-ups removed mid-session.
  const expandWarmups = hasWarmups && showWarmups;
  // On the wall the label has to say WHOSE lift, because four columns are on
  // screen and the keypad is the one thing that must never be ambiguous. On
  // the phone only one client is visible and their name and the lift are
  // directly above it, so the label drops to just the field — the full
  // version wrapped to three lines and truncated at 390px.
  const fieldLabel = active ? `SET ${active.set + 1} ${active.field === "weight" ? "WEIGHT" : "REPS"}` : "KEYPAD";
  const dockLabel = expandedItem
    ? dock === "history"
      ? compact
        ? "THIS BLOCK"
        : `THIS BLOCK · ${expandedItem.exercise.name}`
      : dock === "calculator"
        ? `CALCULATOR${active ? ` · SET ${active.set + 1}` : ""}`
        : compact
          ? fieldLabel
          : `${(entry.clientName ?? "").split(" ")[0]} · ${expandedItem.exercise.name} · ${fieldLabel}`
    : "";

  const padWidth = compact ? 200 : 214;

  // Scroll bookkeeping for the "more lifts" affordance. onLayout is
  // ResizeObserver-backed on web, so the per-row offsets are unavailable in
  // a headless preview — the count degrades to a plain "More lifts" rather
  // than rendering a wrong number.
  const rowOffsets = useRef(new Map());
  const metrics = useRef({ scrollY: 0, viewport: 0, content: 0 });
  const recomputeOverflow = () => {
    const { scrollY, viewport, content } = metrics.current;
    if (!viewport || !content) return;
    const bottom = scrollY + viewport;
    const more = content - bottom > 8;
    let remaining = 0;
    for (const y of rowOffsets.current.values()) if (y > bottom - 12) remaining += 1;
    setOverflow((prev) => (prev.scrollable === more && prev.remaining === remaining ? prev : { scrollable: more, remaining }));
  };
  const handleScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    metrics.current = { scrollY: contentOffset.y, viewport: layoutMeasurement.height, content: contentSize.height };
    recomputeOverflow();
  };
  const listRef = useRef(null);

  const liftRows = entry.items.map((item, index) => {
    const shared = {
      item,
      letter: letterById.get(item.id) ?? null,
      logs: entry.logsByExerciseId.get(item.exercise.id),
      completed: entry.completedItemIds.has(item.id),
      hasNote: entry.latestNoteByExerciseId.has(item.exercise.id),
      editOrder,
      canReorder,
      isFirst: index === 0,
      isLast: index === entry.items.length - 1,
      onPress: () => (editOrder ? null : expand(item)),
      onToggleComplete: () => onToggleComplete?.(item, !entry.completedItemIds.has(item.id)),
      onMove: (dir) => onMoveLift?.(item.id, dir),
    };
    const body =
      item.id === expandedId ? (
        <HubLiftCard
          item={item}
          letter={letterById.get(item.id) ?? null}
          siblings={siblings}
          rows={rows}
          active={active}
          note={note}
          weekNumber={entry.weekNumber}
          lastWeek={history?.[0] ?? null}
          weekCount={history?.length ?? 0}
          historyLoading={history === undefined}
          compact={compact}
          onSetActive={(next) => {
            focusHubKeyboard(userId);
            focusCell(next);
          }}
          onSwitchItem={switchSibling}
          onAddSet={handleAddSet}
          onSameAsLast={handleSameAsLast}
          onChangeNote={setNote}
          onCommitNote={() => commitNote(item)}
          onFocusNote={() => { if (dock !== "history") blurCell(); }}
          onOpenHistory={() => setDock("history")}
          onCollapse={collapse}
        />
      ) : expandedId ? (
        <CollapsedRow {...shared} />
      ) : (
        <RestingRow {...shared} />
      );
    return (
      <View
        key={item.id}
        onLayout={(e) => {
          rowOffsets.current.set(item.id, e.nativeEvent.layout.y);
        }}
      >
        {body}
      </View>
    );
  });

  return (
    <View
      style={{
        flex: scale === "tv" ? 1 : undefined,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: entry.finalized ? "#cfdcc2" : CARD_BORDER,
        backgroundColor: "white",
        overflow: "hidden",
      }}
    >
      {/* A finalized column gets a 6px olive bar and a COMPLETE pill rather
          than washing its whole background olive — visual-pass v4's house
          rule is border-and-fill, never a full wash, and the bar carries the
          same signal from across the room. The bar's height is reserved in
          every column: rendering it only when finalized pushed that one
          column's entire contents 6px below its neighbours'. */}
      <View style={{ height: FINALIZED_BAR_H, backgroundColor: entry.finalized ? DONE : "transparent" }} />

      <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
        <View style={{ height: nameH + HEADER_META_H, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ height: nameH, lineHeight: nameH, fontFamily: fonts.sansBold, fontSize: compact ? 17 : 20, color: "#292524" }}>
              {entry.clientName}
            </Text>
            <Text numberOfLines={1} style={{ height: HEADER_META_H, lineHeight: HEADER_META_H, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
              {[`Week ${entry.weekNumber}`, entry.sessionNumber ? `Session ${entry.sessionNumber}` : null, entry.title || null]
                .filter(Boolean)
                .join(" | ")}
            </Text>
          </View>
          {entry.finalized ? (
            <View style={{ borderRadius: 999, backgroundColor: "#eef1e7", borderWidth: 1, borderColor: "#cfdcc2", paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: DONE }}>COMPLETE</Text>
            </View>
          ) : null}
          <PressFade onPress={() => setEditOrder((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Ionicons
              name={editOrder ? "close-circle" : canReorder ? "swap-vertical" : "person-remove-outline"}
              size={compact ? 22 : 25}
              color={editOrder ? colors.primary : colors.muted}
            />
          </PressFade>
        </View>

        {/* What she's working toward — the same shared card the coach edits on
            her programming page and she reads on her own session, reduced to
            the one line this column has room for. A solid clay pill rather
            than the quieter ghost line the member app uses: this one has to
            read from across the gym.

            The slot is reserved whether or not she has a goal — ClientGoalLine
            renders nothing without one, and letting it collapse lifted that
            column's warm-ups and every lift under them out of line. */}
        <View style={{ height: GOAL_H, marginTop: GOAL_GAP, justifyContent: "center" }}>
          {/* Dropping a client is buried inside the reorder toggle on purpose:
              a bare ✕ at the top of a column is far too easy to catch while
              someone is mid-set. It takes the goal's slot rather than adding a
              row of its own, so the column's height — and therefore every
              other column's alignment — does not change when you open reorder
              mode. While reordering, the goal is not what anyone is reading. */}
          {editOrder && onDropClient ? (
            <PressFade
              onPress={handleDrop}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#e8c4b8",
                backgroundColor: "white",
                paddingHorizontal: 11,
                paddingVertical: 4,
              }}
            >
              <Ionicons name="close-circle-outline" size={15} color="#b23a22" style={{ marginRight: 5 }} />
              <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>
                Drop from board
              </Text>
            </PressFade>
          ) : (
            <ClientGoalLine goal={entry.goal} tone="pill" size="md" />
          )}
        </View>
      </View>

      {/* Warm-up strip — states its own count so the chevron has something to
          promise. Expanding pushes the lift list down; the list absorbs it by
          scrolling rather than the open card being forced shut.

          The strip is drawn for every client, including one with nothing
          programmed: skipping it entirely started that column's lifts a whole
          band above everyone else's. Collapsed it is a fixed height, so a
          client with eight warm-ups and a client with two still line up. */}
      <View
        style={{
          height: expandWarmups ? undefined : WARMUP_H,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 14,
          paddingRight: 10,
          paddingVertical: 7,
          backgroundColor: colors.canvas,
          borderBottomWidth: 1,
          borderBottomColor: CARD_BORDER,
        }}
      >
        {hasWarmups ? (
          <Text numberOfLines={expandWarmups ? undefined : 1} style={{ flex: 1, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, paddingRight: 8 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#57534e" }}>{`Warm-up · ${warmupRows.length} · `}</Text>
            {expandWarmups
              ? warmupRows
                  .map((w) => {
                    const name = w.label || w.exercises?.name || "—";
                    const sets = w.sets || w.exercises?.default_sets || "";
                    const reps = w.reps || w.exercises?.default_reps || "";
                    return `${name}${sets && reps ? ` ${sets}×${reps}` : ""}`;
                  })
                  .join("\n")
              : warmupRows.map((w) => w.label || w.exercises?.name || "—").join(" · ")}
          </Text>
        ) : (
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sans, fontSize: type.caption, color: colors.hint, paddingRight: 8 }}>
            No warm-up programmed
          </Text>
        )}
        {hasWarmups ? (
          <PressFade
            onPress={() => setShowWarmups((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={expandWarmups ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
          </PressFade>
        ) : (
          // Keeps the text column the same width as a client who does have
          // warm-ups, so the two strips read as the same band.
          <View style={{ width: 30, height: 30 }} />
        )}
      </View>

      {/* Lifts. The list scrolls INSIDE its own column — nothing in any other
          column moves, and columns never resize or reflow. */}
      <View style={{ flex: scale === "tv" ? 1 : undefined, minHeight: 0 }}>
        {scale === "tv" ? (
          <>
            <ScrollView
              ref={listRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 10, paddingBottom: 6 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={100}
              onScroll={handleScroll}
              onLayout={(e) => {
                metrics.current = { ...metrics.current, viewport: e.nativeEvent.layout.height };
                recomputeOverflow();
              }}
              onContentSizeChange={(w, h) => {
                metrics.current = { ...metrics.current, content: h };
                recomputeOverflow();
              }}
            >
              {liftRows}
              {entry.items.length === 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 21, color: colors.muted, padding: 8 }}>
                  Nothing published for this session yet. A coach can publish it from their phone and it appears here within a few seconds.
                </Text>
              ) : null}
            </ScrollView>
            {overflow.scrollable ? <ListFade /> : null}
          </>
        ) : (
          <View style={{ padding: 10, paddingBottom: 6 }}>
            {liftRows}
            {entry.items.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 21, color: colors.muted, padding: 8 }}>
                Nothing published for this session yet. A coach can publish it from their phone and it appears here within a few seconds.
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {/* Pinned outside the scroll area so it never scrolls away. */}
      {scale === "tv" && overflow.scrollable ? (
        <PressFade
          onPress={() => listRef.current?.scrollTo({ y: 100000, animated: true })}
          style={{ paddingVertical: 7, alignItems: "center", borderTopWidth: 1, borderTopColor: CARD_BORDER, backgroundColor: colors.canvas }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted }}>
            {overflow.remaining > 0 ? `${overflow.remaining} more ${overflow.remaining === 1 ? "lift" : "lifts"} ⌄` : "More lifts ⌄"}
          </Text>
        </PressFade>
      ) : null}

      {/* The dock — one slot, three occupants, all the same footprint. */}
      {expandedItem && dock ? (
        <HubDock
          label={dockLabel}
          // Whatever the dock is showing, ⌄ means "put it away" — so the
          // highlight goes with it. A lit box under no keypad claims to be
          // the live cell when nothing can type into it.
          onDismiss={blurCell}
          rightWidth={dock === "history" ? undefined : dock === "calculator" ? (compact ? 220 : 240) : padWidth}
          strip={
            dock === "keypad" ? (
              <View>
                <View style={{ marginBottom: 8 }}>
                  <DockPill
                    label="Calculator"
                    icon="calculator-outline"
                    onPress={() => setDock("calculator")}
                    disabled={!tracksWeight}
                  />
                </View>
                <DockPill label="Next" tone="filled" onPress={handleNext} />
              </View>
            ) : dock === "calculator" ? (
              <HubPlateCalcStrip calc={calc} onInsert={handleInsertWeight} onBackToKeypad={() => { ensureCell(); setDock("keypad"); }} />
            ) : (
              <HubHistoryStrip onBackToKeypad={() => { ensureCell(); setDock("keypad"); }} weekCount={history?.length ?? 0} />
            )
          }
          right={
            dock === "keypad" ? (
              <HubNumberPad onKey={handleKey} width={padWidth} keyHeight={compact ? 46 : 44} />
            ) : dock === "calculator" ? (
              <HubPlateCalcGrid calc={calc} width={compact ? 220 : 240} />
            ) : (
              <HubHistoryPanel weeks={history ?? []} tracksWeight={tracksWeight} height={compact ? 200 : 194} />
            )
          }
        />
      ) : null}

      {/* Dismissed dock leaves a way back rather than stranding the card. */}
      {expandedItem && !dock ? (
        <PressFade
          onPress={() => { focusHubKeyboard(userId); ensureCell(); }}
          style={{ paddingVertical: 9, alignItems: "center", borderTopWidth: 2, borderTopColor: colors.primary, backgroundColor: PEACH_BG }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Show keypad ⌃</Text>
        </PressFade>
      ) : null}

      <View style={{ padding: 10, paddingTop: 8 }}>
        <PressFade
          onPress={onToggleFinalize}
          style={{
            borderRadius: 12,
            paddingVertical: compact ? 11 : 13,
            alignItems: "center",
            backgroundColor: entry.finalized ? "transparent" : DONE,
            borderWidth: entry.finalized ? 1.5 : 0,
            borderColor: DONE,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 14 : 15, color: entry.finalized ? DONE : "white" }}>
            {entry.finalized ? "Un-finalize session" : "Finalize session"}
          </Text>
        </PressFade>
      </View>
    </View>
  );
}
