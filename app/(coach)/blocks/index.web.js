import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  listGroupPrograms,
  createGroupProgram,
  updateGroupProgram,
  createBlock,
  listWorkoutsForBlock,
  listBlocksForProgram,
  addDays,
} from "../../../lib/programming/blocks";
import {
  listSessionSummaries,
  copyWorkoutContent,
  setWorkoutStatusBulk,
  copyLastGroupBlockContent,
  clearWorkoutContent,
} from "../../../lib/programming/workouts";
import { listAssignments } from "../../../lib/programming/clients";
import { buildFinalizeChecks } from "../../../lib/programming/blockReadiness";
import { currentWeekNumber, blockLengthWeeks } from "../../../lib/programming/schedule";
import { WEEK_OFFSETS, groupRows, blockPrecedingGap } from "../../../lib/programming/gridRows";
import { todayInBoise, daysBetween } from "../../../lib/boiseDate";
import { formatDateMD } from "../../../lib/formatDate";
import { confirmOverwrite, confirmBulkPublish, confirmClearLifts } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { NewBlockModal } from "../../../components/NewBlockModal";
import { NewGroupProgramModal } from "../../../components/NewGroupProgramModal";
import { FinalizeBlockModal } from "../../../components/FinalizeBlockModal";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";

// Group Programs grid, coach web (design_handoff_coach_web_v2, 1b/1c).
//
// The grid is where a coach decides what to work on, so every cell says
// what it is at a glance — title, lift count, status — and selection is
// the primary interaction: tick any set of cells and the action bar rises.
// That replaces the old click-source-then-click-targets copy mode, which
// only ever did one thing and gave no way to publish or empty in bulk.
//
// Native keeps the previous read-only panel grid (index.js) — building is
// web-only per the build plan, and this screen's multi-select and preflight
// are desktop interactions.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CELL_MIN_HEIGHT = 104;
const ROW_LABEL_WIDTH = 132;

const STATE_STYLE = {
  published: { accent: "#4d6142", label: "Published", labelColor: "#4d6142" },
  draft: { accent: "#c58a3a", label: "Draft", labelColor: "#8a5a2e" },
  empty: { accent: "#e2ddd6", label: "Empty", labelColor: "#a8a29e" },
};

function stateOf(workout, summary) {
  if ((summary?.liftCount ?? 0) === 0) return "empty";
  return workout.status === "published" ? "published" : "draft";
}

// "7 lifts · 1 superset · warm-up set" — the one line that tells a coach
// whether a cell is done without opening it.
function describeSession(summary) {
  if (!summary || summary.liftCount === 0) return "Nothing in it yet";
  const parts = [`${summary.liftCount} lift${summary.liftCount === 1 ? "" : "s"}`];
  if (summary.supersetCount > 0) parts.push(`${summary.supersetCount} superset${summary.supersetCount === 1 ? "" : "s"}`);
  parts.push(summary.warmupCount > 0 ? "warm-up set" : "no warm-up");
  return parts.join(" · ");
}

async function loadProgramData(program) {
  const allBlocks = await listBlocksForProgram(program.id);
  const today = todayInBoise();

  const rows = WEEK_OFFSETS.map(({ offset, label }) => {
    const weekDate = addDays(today, offset * 7);
    const block = allBlocks.find((b) => b.block_start_date <= weekDate && weekDate <= b.block_end_date) ?? null;
    const weekNum = block ? currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), weekDate) : null;
    return { offset, label, weekDate, block, weekNum, sessions: [] };
  });

  const blockIds = [...new Set(rows.map((r) => r.block?.id).filter(Boolean))];
  const workoutsByBlockId = {};
  await Promise.all(
    blockIds.map(async (id) => {
      workoutsByBlockId[id] = await listWorkoutsForBlock(id);
    })
  );

  for (const row of rows) {
    if (!row.block) continue;
    row.sessions = (workoutsByBlockId[row.block.id] ?? []).filter((w) => w.week_number === row.weekNum);
  }

  // The band at the top describes the block that covers TODAY, and the
  // preflight checks the whole of it — not just the six weeks on screen.
  const currentBlock = rows[0].block ?? null;
  const allWorkouts = currentBlock ? (workoutsByBlockId[currentBlock.id] ?? []) : [];
  const visibleIds = rows.flatMap((r) => r.sessions.map((s) => s.id));
  const summaries = await listSessionSummaries([...new Set([...visibleIds, ...allWorkouts.map((w) => w.id)])]);

  return { program, rows, summaries, allBlocks, currentBlock, currentBlockWorkouts: allWorkouts };
}

/* ------------------------------------------------------------ block band */

function ReadinessBar({ published, draft, empty, total }) {
  const seg = (n, color) => (n > 0 ? <View key={color} style={{ flex: n, backgroundColor: color }} /> : null);
  return (
    <View>
      <View style={{ flexDirection: "row", height: 7, borderRadius: 99, overflow: "hidden", backgroundColor: "#ece7e1" }}>
        {seg(published, "#4d6142")}
        {seg(draft, "#c58a3a")}
        {seg(empty, "#e2ddd6")}
      </View>
      <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
        {[
          [published, "published", "#4d6142"],
          [draft, "draft", "#c58a3a"],
          [empty, "empty", "#d6d1ca"],
        ].map(([n, label, color]) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: color }} />
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c" }}>
              {n} {label}
            </Text>
          </View>
        ))}
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9c4bd" }}>of {total}</Text>
      </View>
    </View>
  );
}

function BlockBand({ program, block, blockLabel, workouts, summaries, today, onFinalize, onNewBlock }) {
  if (!block) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }}>No block running right now</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 4 }}>
          Members on {program.name} have nothing scheduled this week.
        </Text>
        <PressFade
          onPress={onNewBlock}
          style={{ alignSelf: "flex-start", marginTop: 14, backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Start a block</Text>
        </PressFade>
      </View>
    );
  }

  const states = workouts.map((w) => stateOf(w, summaries[w.id]));
  const published = states.filter((s) => s === "published").length;
  const draft = states.filter((s) => s === "draft").length;
  const empty = states.filter((s) => s === "empty").length;
  const daysLeft = daysBetween(block.block_end_date, today);
  const weeks = blockLengthWeeks(block, program);

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingVertical: 18,
        paddingHorizontal: 22,
        marginBottom: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 26,
        flexWrap: "wrap",
      }}
    >
      <View style={{ minWidth: 210 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 21, color: "#2a211c" }}>{blockLabel}</Text>
          <View style={{ backgroundColor: "#e3ead9", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: "#4d6142" }}>RUNNING</Text>
          </View>
        </View>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 5 }}>
          {formatDateMD(block.block_start_date)} → {formatDateMD(block.block_end_date)} · {weeks} weeks ·{" "}
          {program.sessions_per_week} session{program.sessions_per_week === 1 ? "" : "s"} a week
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 260 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }}>
            {published} of {workouts.length} sessions published
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            {daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in block` : "Block has ended"}
          </Text>
        </View>
        <ReadinessBar published={published} draft={draft} empty={empty} total={workouts.length} />
      </View>

      <PressFade
        onPress={onFinalize}
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 22 }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#fff" }}>Finalize block</Text>
      </PressFade>
    </View>
  );
}

/* ------------------------------------------------------------------ cells */

function Checkbox({ checked, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: checked ? colors.primary : "#d6d1ca",
        backgroundColor: checked ? colors.primary : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Text style={{ color: "#fff", fontSize: 11, fontFamily: fonts.sansBold, lineHeight: 13 }}>✓</Text> : null}
    </Pressable>
  );
}

function SessionCard({ workout, summary, selected, onToggle, onOpen, copyRole, resumedByYou, width }) {
  const state = stateOf(workout, summary);
  const style = STATE_STYLE[state];
  const border =
    copyRole === "source"
      ? colors.primary
      : copyRole === "selected"
        ? colors.primary
        : selected
          ? colors.primary
          : CARD_BORDER;

  return (
    <View
      style={{
        width,
        minHeight: CELL_MIN_HEIGHT,
        backgroundColor: "#fff",
        borderWidth: selected || copyRole === "source" || copyRole === "selected" ? 2 : 1,
        borderColor: border,
        borderLeftWidth: 3,
        borderLeftColor: style.accent,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <Pressable onPress={onOpen} style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5, color: state === "empty" ? "#a8a29e" : "#2a211c" }} numberOfLines={1}>
            {workout.title || "Untitled session"}
          </Text>
          {onToggle ? <Checkbox checked={selected} onPress={onToggle} /> : null}
        </View>
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 4 }} numberOfLines={1}>
          {describeSession(summary)}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: style.accent }} />
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: style.labelColor }}>
            {style.label}
            {resumedByYou ? " · you were here" : ""}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function BuildCard({ width, onPress, duplicateHint }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        width,
        minHeight: CELL_MIN_HEIGHT,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#d6d1ca",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>+ Build session</Text>
      {duplicateHint ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 3 }}>{duplicateHint}</Text>
      ) : null}
    </PressFade>
  );
}

/* ------------------------------------------------------------------- page */

export default function BlocksWeb() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();

  const [programData, setProgramData] = useState(null);
  const [memberCounts, setMemberCounts] = useState({});
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [editProgramOpen, setEditProgramOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);

  const [selection, setSelection] = useState(new Set());
  const [copySource, setCopySource] = useState(null);
  const [copyTargets, setCopyTargets] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [startingGap, setStartingGap] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const programs = await listGroupPrograms();
      const ordered = [...programs].sort((a, b) => (a.name === "Flagship" ? -1 : b.name === "Flagship" ? 1 : 0));
      setProgramData(await Promise.all(ordered.map(loadProgramData)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Roster counts sit on the program tabs; isolated so a failure there
    // costs a number rather than the whole grid.
    try {
      const assignments = await listAssignments();
      const counts = {};
      for (const a of assignments) if (a.group_program_id) counts[a.group_program_id] = (counts[a.group_program_id] ?? 0) + 1;
      setMemberCounts(counts);
    } catch {
      setMemberCounts({});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!programData || programData.length === 0) return;
    if (!programData.some((d) => d.program.id === selectedProgramId)) {
      const fromParam =
        typeof params.program === "string" && programData.some((d) => d.program.id === params.program) ? params.program : null;
      setSelectedProgramId(fromParam ?? programData[0].program.id);
    }
  }, [programData, selectedProgramId, params.program]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setCopySource(null);
    setCopyTargets(new Set());
  }, []);

  // Switching programs mid-selection would leave ids pointing at a grid
  // that's no longer on screen.
  useEffect(() => {
    clearSelection();
  }, [selectedProgramId, clearSelection]);

  // Esc deselects — the action bar says so, so it has to actually work.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const selected = programData?.find((d) => d.program.id === selectedProgramId);

  const blockLabels = useMemo(() => {
    // Blocks are numbered by chronological start, the same convention SPC
    // uses (labelBlocks in spcBlocks.js) — there's no stored name column.
    const map = {};
    for (const d of programData ?? []) {
      [...d.allBlocks]
        .sort((a, b) => (a.block_start_date < b.block_start_date ? -1 : 1))
        .forEach((b, i) => {
          map[b.id] = `Block ${i + 1}`;
        });
    }
    return map;
  }, [programData]);

  const toggle = (workoutId) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  };

  const toggleCopyTarget = (workoutId) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  };

  const handleCreateBlock = async ({ groupProgramId, startDate, copyFromLatest, lengthWeeks }) => {
    try {
      let sourceBlock = null;
      if (copyFromLatest) {
        const existing = await listBlocksForProgram(groupProgramId);
        sourceBlock = existing[existing.length - 1] ?? null;
      }
      const newBlock = await createBlock({ groupProgramId, startDate, createdBy: profile.id, lengthWeeks });
      if (sourceBlock) await copyLastGroupBlockContent(sourceBlock.id, newBlock.id);
      await load();
    } catch (err) {
      toastError("Failed to create block", err);
      throw err;
    }
  };

  const handleCreateProgram = async (fields) => {
    try {
      const program = await createGroupProgram(fields);
      await load();
      setSelectedProgramId(program.id);
    } catch (err) {
      toastError("Failed to create group program", err);
      throw err;
    }
  };

  const handleUpdateProgram = async ({ name, blockLengthWeeks, sessionsPerWeek, sessionDays }) => {
    try {
      await updateGroupProgram(selectedProgramId, {
        name,
        block_length_weeks: blockLengthWeeks,
        sessions_per_week: sessionsPerWeek,
        session_days: sessionDays,
      });
      await load();
    } catch (err) {
      toastError("Failed to update group program", err);
      throw err;
    }
  };

  const handleStartGapBlock = async (gapRows) => {
    setStartingGap(true);
    try {
      const preceding = blockPrecedingGap(selected.allBlocks, gapRows);
      const startDate = preceding ? addDays(preceding.block_end_date, 1) : todayInBoise();
      await createBlock({ groupProgramId: selected.program.id, startDate, createdBy: profile.id });
      await load();
    } catch (err) {
      toastError("Failed to start new block", err);
    } finally {
      setStartingGap(false);
    }
  };

  const handlePublishSelected = async () => {
    const ids = [...selection].filter((id) => {
      const w = allVisibleWorkouts.find((x) => x.id === id);
      return w && w.status !== "published";
    });
    if (ids.length === 0) {
      // Silent return read as "the button is broken" — say why nothing
      // happened rather than nothing at all.
      toastSuccess("Those sessions are already published");
      return;
    }
    if (!(await confirmBulkPublish(ids.length))) return;
    setBusy(true);
    try {
      await setWorkoutStatusBulk(ids, "published");
      await load();
      clearSelection();
      toastSuccess(`Published ${ids.length} session${ids.length === 1 ? "" : "s"}`);
    } catch (err) {
      toastError("Failed to publish", err);
    } finally {
      setBusy(false);
    }
  };

  const handleClearSelected = async () => {
    const ids = [...selection];
    if (ids.length === 0) return;
    if (!(await confirmClearLifts(ids.length))) return;
    setBusy(true);
    try {
      await clearWorkoutContent(ids);
      await load();
      clearSelection();
      toastSuccess(`Cleared ${ids.length} session${ids.length === 1 ? "" : "s"}`);
    } catch (err) {
      toastError("Failed to clear sessions", err);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCopy = async () => {
    const targets = [...copyTargets];
    if (targets.length === 0 || !copySource) return;
    const nonEmpty = targets.filter((id) => (selected.summaries[id]?.liftCount ?? 0) > 0).length;
    if (nonEmpty > 0 && !(await confirmOverwrite(nonEmpty))) return;
    setBusy(true);
    try {
      await Promise.all(targets.map((id) => copyWorkoutContent(copySource, id)));
      await load();
      clearSelection();
      toastSuccess(`Duplicated into ${targets.length} session${targets.length === 1 ? "" : "s"}`);
    } catch (err) {
      toastError("Failed to duplicate", err);
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    const draftIds = (selected?.currentBlockWorkouts ?? []).filter((w) => w.status !== "published").map((w) => w.id);
    if (draftIds.length === 0) return;
    setFinalizeBusy(true);
    try {
      await setWorkoutStatusBulk(draftIds, "published");
      await load();
      setFinalizeOpen(false);
      toastSuccess(`Published ${draftIds.length} session${draftIds.length === 1 ? "" : "s"}`);
    } catch (err) {
      toastError("Failed to finalize block", err);
    } finally {
      setFinalizeBusy(false);
    }
  };

  const allVisibleWorkouts = useMemo(
    () => (selected?.rows ?? []).flatMap((r) => r.sessions ?? []),
    [selected]
  );

  if (loadError) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, padding: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center" }}>{loadError}</Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!programData) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const today = todayInBoise();
  const sessionsPerWeek = selected?.program.sessions_per_week ?? 3;
  const columnWidth = 264;
  const gridWidth = sessionsPerWeek * columnWidth + (sessionsPerWeek - 1) * 14;
  const currentBlockMembers = selected ? (memberCounts[selected.program.id] ?? 0) : 0;

  const checks = selected?.currentBlock
    ? buildFinalizeChecks({ sessions: selected.currentBlockWorkouts, summaries: selected.summaries })
    : { mustFix: [], worthALook: [] };
  const draftCount = (selected?.currentBlockWorkouts ?? []).filter((w) => w.status !== "published").length;

  const selectionCount = selection.size;
  const copying = Boolean(copySource);

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 36, paddingVertical: 26, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Group Programs</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PressFade
              onPress={() => selectedProgramId && router.push(`/(coach)/blocks/history?program=${selectedProgramId}`)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Block history</Text>
            </PressFade>
            <PressFade
              onPress={() => setNewBlockOpen(true)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>+ New block</Text>
            </PressFade>
          </View>
        </View>

        {/* Underline tabs carrying each program's roster count — the pill
            row this replaces gave no sense of size, and stopped reading as
            navigation once there were more than two. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 26, borderBottomWidth: 1, borderBottomColor: CARD_BORDER, marginBottom: 20 }}>
          {programData.map(({ program }) => {
            const active = program.id === selectedProgramId;
            return (
              <Pressable
                key={program.id}
                onPress={() => setSelectedProgramId(program.id)}
                style={{ paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: active ? colors.primary : "transparent" }}
              >
                <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sans, fontSize: 15, color: active ? colors.primaryOnWhite : "#57534e" }}>
                  {program.name}{" "}
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>{memberCounts[program.id] ?? 0}</Text>
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setNewProgramOpen(true)} style={{ paddingBottom: 10 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: "#a8a29e" }}>+ New program</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {selected ? (
            <Pressable onPress={() => setEditProgramOpen(true)} style={{ paddingBottom: 10 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#a8a29e" }}>⚙ {selected.program.name} settings</Text>
            </Pressable>
          ) : null}
        </View>

        {selected ? (
          <>
            <BlockBand
              program={selected.program}
              block={selected.currentBlock}
              blockLabel={blockLabels[selected.currentBlock?.id] ?? "Block"}
              workouts={selected.currentBlockWorkouts}
              summaries={selected.summaries}
              today={today}
              onFinalize={() => setFinalizeOpen(true)}
              onNewBlock={() => setNewBlockOpen(true)}
            />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: "#a8a29e" }}>SESSIONS</Text>
              {copying ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.primaryOnWhite }}>
                  Pick the sessions to duplicate into
                </Text>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: "row", gap: 14, marginLeft: ROW_LABEL_WIDTH, marginBottom: 10 }}>
                  {Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((n) => (
                    <View key={n} style={{ width: columnWidth, alignItems: "center" }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, letterSpacing: 0.8, color: "#a8a29e" }}>
                        SESSION {n}
                      </Text>
                    </View>
                  ))}
                </View>

                {groupRows(selected.rows).map((group, idx) => {
                  if (group.type === "gap") {
                    const rolling = Boolean(blockPrecedingGap(selected.allBlocks, group.rows)?.auto_extend);
                    return (
                      <View key={`gap-${idx}`} style={{ flexDirection: "row", gap: 14, marginBottom: 12 }}>
                        <View style={{ width: ROW_LABEL_WIDTH }} />
                        <View
                          style={{
                            width: gridWidth,
                            minHeight: CELL_MIN_HEIGHT * Math.min(group.rows.length, 2),
                            borderWidth: 1,
                            borderStyle: "dashed",
                            borderColor: "#d6d1ca",
                            borderRadius: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 18,
                          }}
                        >
                          {rolling ? (
                            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", textAlign: "center" }}>
                              This block rolls forward on its own — it'll fill these weeks a week at a time.
                            </Text>
                          ) : (
                            <>
                              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
                                Nothing scheduled for {group.rows.length} week{group.rows.length === 1 ? "" : "s"}
                              </Text>
                              <PressFade
                                onPress={() => handleStartGapBlock(group.rows)}
                                style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 18 }}
                              >
                                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>
                                  {startingGap ? "Starting…" : "Start new block"}
                                </Text>
                              </PressFade>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  }

                  const row = group.row;
                  const weekStart = row.weekDate;
                  const totalWeeks = blockLengthWeeks(row.block, selected.program);
                  return (
                    <View key={row.offset} style={{ flexDirection: "row", gap: 14, marginBottom: 12 }}>
                      <View style={{ width: ROW_LABEL_WIDTH, justifyContent: "center" }}>
                        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: row.offset === 0 ? "#4d6142" : "#44403c" }}>
                          {row.label}
                        </Text>
                        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
                          {formatDateMD(weekStart)}
                        </Text>
                        <View style={{ alignSelf: "flex-start", marginTop: 6, backgroundColor: "#f1efed", borderRadius: 5, paddingVertical: 3, paddingHorizontal: 7 }}>
                          <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.6, color: "#78716c" }}>
                            BLOCK WK {row.weekNum} OF {totalWeeks}
                          </Text>
                        </View>
                      </View>

                      {Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((sessionNum) => {
                        const workout = row.sessions.find((w) => w.session_number === sessionNum);
                        if (!workout) {
                          return (
                            <View key={sessionNum} style={{ width: columnWidth, minHeight: CELL_MIN_HEIGHT }}>
                              <View style={{ flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: "#e7e2db", borderRadius: 12 }} />
                            </View>
                          );
                        }

                        const isEmpty = (selected.summaries[workout.id]?.liftCount ?? 0) === 0;
                        if (isEmpty && !copying && selectionCount === 0) {
                          return (
                            <BuildCard
                              key={sessionNum}
                              width={columnWidth}
                              onPress={() => router.push(`/(coach)/builder/${workout.id}`)}
                              duplicateHint={row.weekNum > 1 ? `or duplicate week ${row.weekNum - 1}` : null}
                            />
                          );
                        }

                        let copyRole;
                        let onOpen = () => router.push(`/(coach)/builder/${workout.id}`);
                        if (copying) {
                          if (workout.id === copySource) {
                            copyRole = "source";
                            onOpen = () => {};
                          } else {
                            copyRole = copyTargets.has(workout.id) ? "selected" : "eligible";
                            onOpen = () => toggleCopyTarget(workout.id);
                          }
                        }

                        return (
                          <SessionCard
                            key={sessionNum}
                            workout={workout}
                            summary={selected.summaries[workout.id]}
                            width={columnWidth}
                            selected={selection.has(workout.id)}
                            onToggle={copying ? null : () => toggle(workout.id)}
                            onOpen={onOpen}
                            copyRole={copyRole}
                            resumedByYou={workout.last_edited_by === profile?.id && workout.status !== "published"}
                          />
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </>
        ) : null}

        <NewBlockModal
          visible={newBlockOpen}
          programs={programData.map((d) => d.program)}
          onClose={() => setNewBlockOpen(false)}
          onSubmit={handleCreateBlock}
        />
        <NewGroupProgramModal visible={newProgramOpen} onClose={() => setNewProgramOpen(false)} onSubmit={handleCreateProgram} />
        <NewGroupProgramModal
          visible={editProgramOpen}
          initialProgram={selected?.program}
          onClose={() => setEditProgramOpen(false)}
          onSubmit={handleUpdateProgram}
        />
        <FinalizeBlockModal
          visible={finalizeOpen}
          onClose={() => setFinalizeOpen(false)}
          programName={selected?.program.name ?? ""}
          blockLabel={blockLabels[selected?.currentBlock?.id] ?? "Block"}
          block={selected?.currentBlock}
          weeks={selected?.currentBlock ? blockLengthWeeks(selected.currentBlock, selected.program) : 0}
          sessionCount={selected?.currentBlockWorkouts?.length ?? 0}
          memberCount={currentBlockMembers}
          draftCount={draftCount}
          checks={checks}
          busy={finalizeBusy}
          onGo={(item) => {
            setFinalizeOpen(false);
            router.push(item.route);
          }}
          onFinalize={handleFinalize}
        />
      </ScrollView>

      {/* Bulk action bar. Rises out of the bottom of the viewport rather
          than sitting in the scroll flow, so it's reachable however far
          down the grid you've selected from. */}
      {(selectionCount > 0 || copying) && (
        <View style={{ position: "absolute", left: 36, right: 36, bottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: "#33251f",
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 20,
              shadowColor: "#33251f",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.28,
              shadowRadius: 28,
            }}
          >
            {copying ? (
              <>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#f7f3ee" }}>
                  Duplicating into {copyTargets.size} session{copyTargets.size === 1 ? "" : "s"}
                </Text>
                <View style={{ flex: 1 }} />
                <PressFade onPress={clearSelection} style={{ borderWidth: 1, borderColor: "rgba(247,243,238,.28)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#f7f3ee" }}>Cancel</Text>
                </PressFade>
                <Pressable
                  onPress={copyTargets.size === 0 || busy ? undefined : handleConfirmCopy}
                  style={{ backgroundColor: "#f7f3ee", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, opacity: copyTargets.size === 0 || busy ? 0.5 : 1 }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#33251f" }}>
                    {busy ? "Duplicating…" : "Duplicate"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#f7f3ee" }}>
                  {selectionCount} session{selectionCount === 1 ? "" : "s"} selected
                </Text>
                <View style={{ width: 1, height: 22, backgroundColor: "rgba(247,243,238,.18)", marginHorizontal: 4 }} />
                <PressFade
                  onPress={handlePublishSelected}
                  style={{ backgroundColor: "#f7f3ee", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#33251f" }}>
                    Publish {selectionCount === 1 ? "" : `all ${selectionCount}`}
                  </Text>
                </PressFade>
                {/* One source, many targets — "duplicate into" with several
                    sources selected has no meaning, so it only lights up
                    when exactly one cell is ticked. */}
                <Pressable
                  onPress={selectionCount === 1 ? () => setCopySource([...selection][0]) : undefined}
                  style={{ borderWidth: 1, borderColor: "rgba(247,243,238,.28)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: selectionCount === 1 ? 1 : 0.4 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#f7f3ee" }}>Duplicate into…</Text>
                </Pressable>
                <PressFade
                  onPress={handleClearSelected}
                  style={{ borderWidth: 1, borderColor: "rgba(247,243,238,.28)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#f7f3ee" }}>Clear lifts</Text>
                </PressFade>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(247,243,238,.5)" }}>Esc to deselect</Text>
              </>
            )}
          </View>
        </View>
      )}
    </CoachShell>
  );
}
