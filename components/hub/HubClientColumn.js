import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { PressFade } from "../PressFade";
import { ClientGoalLine } from "../ClientGoalCard";
import { SetBubbleRow } from "./HubSetBubbles";
import { HubLiftCard } from "./HubLiftCard";
import { HubDock, DockPill } from "./HubDock";
import { HubNumberPad } from "./HubNumberPad";
import { HubPlateCalcStrip, HubPlateCalcGrid, useHubPlateCalc } from "./HubPlateCalc";
import { HubHistoryStrip, HubHistoryPanel } from "./HubLiftHistory";
import { schemeLabel } from "../builder/SessionBuilderParts";
import { supersetLettersFor } from "../../lib/programming/spcBlockDetail";
import { getLiftBlockHistory } from "../../lib/programming/hub";
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

function summaryText(item, logs) {
  const tracksWeight = item.exercise?.tracks_weight !== false;
  const real = (logs ?? []).filter((r) => r.reps != null || r.weight != null);
  if (real.length === 0) {
    return schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps });
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
function RestingRow({ item, letter, logs, completed, hasNote, editOrder, isFirst, isLast, onPress, onToggleComplete, onMove }) {
  const tracksWeight = item.exercise?.tracks_weight !== false;
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: completed ? DONE : CARD_BORDER,
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <LetterChip letter={letter} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: "#292524" }}>
          {item.exercise.name}
        </Text>
        {hasNote ? <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.primaryOnWhite} style={{ marginRight: 4 }} /> : null}
        {editOrder ? <ReorderArrows isFirst={isFirst} isLast={isLast} onMove={onMove} /> : <CompletionTick completed={completed} onPress={onToggleComplete} />}
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2, marginLeft: letter ? 29 : 0 }}>
        {schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps })}
        {item.rest ? ` | Rest ${item.rest}` : ""}
      </Text>
      <View style={{ marginLeft: letter ? 29 : 0 }}>
        <SetBubbleRow
          sets={logs}
          targetCount={item.targetSets > 0 ? item.targetSets : 3}
          targetFor={(i) => item.repScheme?.[i - 1] ?? item.targetReps ?? null}
          tracksWeight={tracksWeight}
          size="md"
        />
      </View>
    </PressFade>
  );
}

// Every other lift, while one is expanded. Name, that lift's set summary,
// its tick — nothing else. Full rows are ~104px each and five of them plus a
// usable card does not fit in a column's 992px at any client count, so this
// is arithmetic rather than taste.
function CollapsedRow({ item, letter, logs, completed, hasNote, editOrder, isFirst, isLast, onPress, onToggleComplete, onMove }) {
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
      {editOrder ? (
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
}) {
  const compact = scale !== "tv";
  const [editOrder, setEditOrder] = useState(false);
  const [showWarmups, setShowWarmups] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [active, setActive] = useState({ set: 0, field: "reps" });
  const [dock, setDock] = useState("keypad"); // keypad | calculator | history | null
  const [history, setHistory] = useState(undefined); // undefined = loading
  const [overflow, setOverflow] = useState({ scrollable: false, remaining: 0 });

  const calc = useHubPlateCalc();
  const saveTimer = useRef(null);
  const seededFor = useRef(null);
  const noteSeed = useRef("");
  const rowsRef = useRef([]);
  rowsRef.current = rows;
  // Set only once the coach actually changes something, so opening a lift to
  // look at it and closing it again writes nothing.
  const dirtyRef = useRef(false);

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
    setActive(focus);
    dirtyRef.current = false;
    setDock("keypad");
    calc.reset();
    setHistory(undefined);
    getLiftBlockHistory({
      userId,
      exerciseId: expandedItem.exercise.id,
      spcBlockId: entry.spcBlockId,
      excludeWorkoutId: entry.spcWorkoutId,
    })
      .then(setHistory)
      .catch(() => setHistory([])); // history is context, never a blocker on logging
    // calc is a stable-ish hook object; only the identity of the open lift matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedItem?.id, userId, entry.spcBlockId, entry.spcWorkoutId]);

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
    if (dirtyRef.current || saveTimer.current) return;
    const logs = entry.logsByExerciseId.get(expandedItem.exercise.id) ?? [];
    const merged = rowsFromLogs(expandedItem, logs, rowsRef.current.length);
    if (!sameRows(rowsRef.current, merged)) {
      rowsRef.current = merged;
      setRows(merged);
    }
    // A note typed elsewhere lands the same way, unless this coach has started
    // editing it here.
    const remote = entry.noteForWeekByExerciseId?.get(expandedItem.exercise.id)?.body ?? "";
    if (note.trim() === (noteSeed.current ?? "").trim() && remote !== note) {
      noteSeed.current = remote; // no local edit in progress — adopt it
      setNote(remote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.logsByExerciseId, entry.noteForWeekByExerciseId, expandedItem?.id, note]);

  const scheduleSave = (nextRows) => {
    dirtyRef.current = true;
    onEditDirty?.(userId); // hold the poll off this lift until the write lands
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      // Cleared here too, so collapsing after the debounce has already landed
      // doesn't write the identical rows a second time.
      dirtyRef.current = false;
      onSaveSets?.({ exerciseId: expandedItem.exercise.id, rows: nextRows });
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
    noteSeed.current = body;
    if (!body) return; // clearing a note isn't a delete; the table is append-only
    onSaveNote?.({ exerciseId: item.exercise.id, body, authorName });
  };

  const collapse = () => {
    flushLift(expandedItem);
    setExpandedId(null);
    seededFor.current = null;
    onEndEdit?.(userId);
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

  const handleKey = (key) => {
    const current = rows[active.set]?.[active.field] ?? "";
    if (key === "back") {
      setValue(active.set, active.field, current.slice(0, -1));
      return;
    }
    if (key === "." && (current.includes(".") || active.field === "reps")) return;
    if (current.length >= 6) return;
    setValue(active.set, active.field, current + key);
  };

  const handleNext = () => {
    if (tracksWeight && active.field === "reps") setActive({ set: active.set, field: "weight" });
    else if (active.set + 1 < rows.length) setActive({ set: active.set + 1, field: "reps" });
  };

  const handleAddSet = () => {
    const next = [...rowsRef.current, { reps: "", weight: "" }];
    rowsRef.current = next;
    setRows(next);
    setActive({ set: next.length - 1, field: "reps" });
  };

  // One place that decides whether a pending draft is worth writing.
  const flushLift = (item) => {
    flushSets();
    if (!item) return;
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onSaveSets?.({ exerciseId: item.exercise.id, rows: rowsRef.current });
    }
    commitNote(item);
  };

  const handleSameAsLast = () => {
    if (active.set === 0) return;
    const prev = rowsRef.current;
    commitRows(prev.map((r, i) => (i === active.set ? { ...prev[active.set - 1] } : r)));
  };

  const handleInsertWeight = (total) => {
    setValue(active.set, "weight", String(total));
    setDock("keypad");
  };

  const warmupRows = warmups ?? [];
  // On the wall the label has to say WHOSE lift, because four columns are on
  // screen and the keypad is the one thing that must never be ambiguous. On
  // the phone only one client is visible and their name and the lift are
  // directly above it, so the label drops to just the field — the full
  // version wrapped to three lines and truncated at 390px.
  const fieldLabel = `SET ${active.set + 1} ${active.field === "weight" ? "WEIGHT" : "REPS"}`;
  const dockLabel = expandedItem
    ? dock === "history"
      ? compact
        ? "THIS BLOCK"
        : `THIS BLOCK · ${expandedItem.exercise.name}`
      : dock === "calculator"
        ? `CALCULATOR · SET ${active.set + 1}`
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
          onSetActive={setActive}
          onSwitchItem={switchSibling}
          onAddSet={handleAddSet}
          onSameAsLast={handleSameAsLast}
          onChangeNote={setNote}
          onCommitNote={() => commitNote(item)}
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
          same signal from across the room. */}
      {entry.finalized ? <View style={{ height: 6, backgroundColor: DONE }} /> : null}

      <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: compact ? 17 : 20, color: "#292524" }}>
              {entry.clientName}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 1 }}>
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
            <Ionicons name={editOrder ? "close-circle" : "swap-vertical"} size={compact ? 22 : 25} color={editOrder ? colors.primary : colors.muted} />
          </PressFade>
        </View>

        {/* What she's working toward — the same shared card the coach edits on
            her programming page and she reads on her own session, reduced to
            the one line this column has room for. A solid clay pill rather
            than the quieter ghost line the member app uses: this one has to
            read from across the gym. */}
        <ClientGoalLine goal={entry.goal} tone="pill" size="md" style={{ marginTop: 8 }} />
      </View>

      {/* Warm-up strip — states its own count so the chevron has something to
          promise. Expanding pushes the lift list down; the list absorbs it by
          scrolling rather than the open card being forced shut. */}
      {warmupRows.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 10, paddingVertical: 7, backgroundColor: colors.canvas, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
          <Text numberOfLines={showWarmups ? undefined : 1} style={{ flex: 1, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, paddingRight: 8 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#57534e" }}>{`Warm-up · ${warmupRows.length} · `}</Text>
            {showWarmups
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
          <PressFade
            onPress={() => setShowWarmups((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={showWarmups ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
          </PressFade>
        </View>
      ) : null}

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
          onDismiss={() => setDock(null)}
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
              <HubPlateCalcStrip calc={calc} onInsert={handleInsertWeight} onBackToKeypad={() => setDock("keypad")} />
            ) : (
              <HubHistoryStrip onBackToKeypad={() => setDock("keypad")} weekCount={history?.length ?? 0} />
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
          onPress={() => setDock("keypad")}
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
