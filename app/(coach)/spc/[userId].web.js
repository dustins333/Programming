import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import {
  listBlocksForSpcClient,
  labelBlocks,
  createSpcBlock,
  addDays,
  listSpcWorkoutsForBlock,
  trimSpcBlockTo,
} from "../../../lib/programming/spcBlocks";
import { copyLastBlockContent, copySpcWorkoutContent, listSpcWorkoutExercisesForWorkouts } from "../../../lib/programming/spcWorkouts";
import { getSpcBlockDetail, weekWindow } from "../../../lib/programming/spcBlockDetail";
import { getExerciseStats } from "../../../lib/programming/exerciseStats";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { getClient as getNutritionClient } from "../../../lib/nutrition/clients";
import { getSetting } from "../../../lib/settings";
import { SpcSessionReadout } from "../../../components/SpcSessionReadout";
import { NewSpcBlockChoiceModal } from "../../../components/NewSpcBlockChoiceModal";
import { PrintSessionPickerModal } from "../../../components/PrintSessionPickerModal";
import { CoachMessageBubble } from "../../../components/CoachMessageBubble";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import { CoachSpcOverview } from "../../../components/coach/CoachSpcOverview";
import { PressFade } from "../../../components/PressFade";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { STATUS_LABELS, STATUS_ORDER } from "../../../lib/programming/spcStatus";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD } from "../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmOverwrite, confirmEndBlockHere } from "../../../lib/confirmDialog";
import { fonts, colors } from "../../../lib/theme";

// SPC client block view, coach web (design_handoff_coach_web_v2, screen 15).
//
// The whole block, session by session, because an SPC block is a single
// client's plan and the useful question is never "what's this week" — it's
// "what has she actually done, and what does that mean for what I write
// next". The previous version answered that with a rolling six-week calendar
// borrowed from Group Programs, which is the wrong window: a block is the
// unit here, not a fortnight either side of today.
//
// Native (app/(coach)/spc/[userId].js) keeps the calendar-grid version —
// same web/native split precedent as the roster and the clients list.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

const CELL_STATES = {
  logged: { border: "#4d6142", bg: "#fff", dot: "#4d6142", label: "logged" },
  due: { border: colors.primary, bg: "#fff", dot: "#c58a3a", label: "due" },
  upcoming: { border: CARD_BORDER, bg: "#fff", dot: "#d6d1ca", label: "upcoming" },
  skipped: { border: CARD_BORDER, bg: "#faf8f6", dot: "#c9c4bd", label: "skipped" },
  draft: { border: CARD_BORDER, bg: "#fdfbf8", dot: "#c58a3a", label: "draft" },
  empty: { border: "#efe9e2", bg: "#faf8f6", dot: "#e0dbd4", label: "empty" },
};

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function weeksSince(dateStr, today) {
  const days = Math.floor((new Date(`${today}T12:00:00`) - new Date(`${dateStr}T12:00:00`)) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.round(days / 7));
}

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/* ------------------------------------------------------------ block band */

function BlockBand({ block, label, summary, weekNumber, nextQueued, onBuildNext }) {
  const total = summary.total || 1;
  const seg = (n, color) => (n > 0 ? <View key={color} style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} /> : null);

  return (
    <View style={{ backgroundColor: "#33251f", borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <View style={{ flexDirection: "row", gap: 26, flexWrap: "wrap", alignItems: "center" }}>
        <View style={{ minWidth: 210 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: "#a89a92" }}>CURRENT BLOCK</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 25, color: "#f7f3ee", marginTop: 4 }}>
            {label} · Week {weekNumber} of {block.block_length_weeks}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a89a92", marginTop: 3 }}>
            {formatDateMD(block.block_start_date)} → {formatDateMD(block.block_end_date)}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 260 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#f7f3ee" }}>
              {summary.logged} of {summary.total} sessions logged
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a89a92" }}>
              {summary.daysLeft >= 0 ? `${summary.daysLeft} day${summary.daysLeft === 1 ? "" : "s"} left` : "Ended"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", height: 7, borderRadius: 99, overflow: "hidden", backgroundColor: "#4a382f", marginTop: 9 }}>
            {seg(summary.logged, "#8fb473")}
            {seg(summary.pending, "#a89a92")}
            {seg(summary.skipped, "#7d6a60")}
            {seg(summary.draft + summary.empty, "#5c473d")}
          </View>
          <View style={{ flexDirection: "row", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
            {[
              [summary.logged, "logged", "#8fb473"],
              [summary.pending, "still to come", "#a89a92"],
              [summary.skipped, "skipped", "#7d6a60"],
              [summary.draft + summary.empty, "not ready", "#5c473d"],
            ]
              .filter(([n]) => n > 0)
              .map(([n, text, color]) => (
                <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9bcb4" }}>
                    {n} {text}
                  </Text>
                </View>
              ))}
          </View>
        </View>

        {!nextQueued ? (
          <PressFade
            onPress={onBuildNext}
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 17 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Build next block</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#f0d9d0", marginTop: 2 }}>
              Nothing queued after {formatDateMD(block.block_end_date)}
            </Text>
          </PressFade>
        ) : (
          <View style={{ borderWidth: 1, borderColor: "#5c473d", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 17 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#c9bcb4" }}>Next block queued</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- the grid */

// copyRole is undefined outside copy mode (the plain tile). In copy mode:
// "source" = the tile being copied FROM, "selected" = a chosen target,
// "eligible" = a valid but unchosen target. Same vocabulary as the native
// page's shared BlockGridCells.SessionCell so the two can't drift apart.
function SessionCell({ session, onPress, copyRole, onStartCopy }) {
  const style = CELL_STATES[session.state] ?? CELL_STATES.upcoming;
  const detail = (() => {
    switch (session.state) {
      case "logged":
        return `${session.loggedSets} of ${session.programmedSets} sets`;
      case "skipped":
        return "Skipped";
      case "due":
        return "Waiting on her";
      case "upcoming":
        return `${session.programmedSets} sets programmed`;
      case "draft":
        return "Draft — not published";
      default:
        return "Nothing programmed";
    }
  })();

  const when = (() => {
    if (session.state === "logged" && session.loggedDate) return `Logged ${formatDateMD(session.loggedDate)}`;
    if (session.state === "due") return "Published · due this week";
    if (session.state === "skipped") return "Not logged";
    if (session.state === "upcoming") return "Published";
    return null;
  })();

  // Copy-mode styling wins over the state colours — while copying, "which
  // tiles am I about to overwrite" matters more than "is this one logged".
  const copyStyle =
    copyRole === "source"
      ? { backgroundColor: "#fdf6f2", borderColor: colors.primary, borderStyle: "solid" }
      : copyRole === "selected"
        ? { backgroundColor: "#fdf6f2", borderColor: colors.primary, borderStyle: "dashed" }
        : copyRole === "eligible"
          ? { backgroundColor: "#ffffff", borderColor: "#e0cdc2", borderStyle: "dashed" }
          : null;

  return (
    <PressFade
      onPress={() => onPress(session)}
      style={{
        flex: 1,
        minWidth: 190,
        backgroundColor: copyStyle?.backgroundColor ?? style.bg,
        borderWidth: 1,
        borderColor: copyStyle?.borderColor ?? style.border,
        borderStyle: copyStyle?.borderStyle ?? "solid",
        borderLeftWidth: 3,
        borderLeftColor: copyStyle?.borderColor ?? style.border,
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 13,
      }}
    >
      {/* The ⧉ only shows on a tile that has something worth copying, and
          only when we're not already in copy mode. */}
      {onStartCopy && !copyRole && session.programmedSets > 0 ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onStartCopy(session);
          }}
          hitSlop={8}
          accessibilityLabel={`Copy session ${session.session_number} of week ${session.week_number}`}
          style={{ position: "absolute", top: 6, right: 8, zIndex: 2 }}
        >
          <Text style={{ color: "#4d6142", fontSize: 13 }}>⧉</Text>
        </Pressable>
      ) : null}
      {copyRole === "source" ? (
        <Text style={{ position: "absolute", top: 6, right: 8, color: colors.primaryOnWhite, fontSize: 11, fontFamily: fonts.sansSemiBold }}>
          copying
        </Text>
      ) : null}
      {copyRole === "selected" ? (
        <Text style={{ position: "absolute", top: 6, right: 8, color: colors.primaryOnWhite, fontSize: 13 }}>✓</Text>
      ) : null}
      <Text
        style={{
          fontFamily: fonts.sansBold,
          fontSize: 13,
          color: session.state === "empty" || session.state === "skipped" ? "#a8a29e" : "#2a211c",
        }}
        numberOfLines={1}
      >
        {session.title || `Session ${session.session_number}`}
      </Text>
      {when ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }} numberOfLines={1}>
          {when}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
        <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: style.dot }} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#57534e" }}>
          {copyRole === "eligible" && session.state === "empty" ? "Click to paste here" : detail}
        </Text>
      </View>
    </PressFade>
  );
}

/* -------------------------------------------------------------- the rail */

function Sparkline({ values }) {
  const real = values.filter((v) => v != null);
  if (real.length < 2) return null;
  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min || 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 22, marginTop: 6 }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: v == null ? 3 : 5 + ((v - min) / span) * 17,
            borderRadius: 2,
            backgroundColor: i === values.length - 1 ? "#4d6142" : "#e0dbd4",
          }}
        />
      ))}
    </View>
  );
}

function KeyLifts({ exercises }) {
  if (exercises.length === 0) {
    return <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>No lifts logged in this block yet.</Text>;
  }
  return exercises.map((e) => (
    <View key={e.exercise.id} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c" }} numberOfLines={1}>
          {e.exercise.name}
        </Text>
        <Text
          style={{
            fontFamily: fonts.sansBold,
            fontSize: 12.5,
            color: e.jump == null || e.jump === 0 ? "#a8a29e" : e.jump > 0 ? "#4d6142" : "#b23a22",
          }}
        >
          {e.jump == null || e.jump === 0 ? "flat" : `${e.jump > 0 ? "+" : ""}${e.jump} lb`}
        </Text>
      </View>
      <Sparkline values={e.trend} />
    </View>
  ));
}

function WhatSheSaid({ notes }) {
  if (notes.length === 0) {
    return <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>No notes from her in this block.</Text>;
  }
  return notes.map((n, i) => (
    <View key={i} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, padding: 12, marginBottom: 9 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#44403c", lineHeight: 18, fontStyle: "italic" }}>“{n.note}”</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 6 }}>
        {formatDateMD(n.date)} · {n.exerciseName}
      </Text>
    </View>
  ));
}

/* ------------------------------------------------------------------ page */

function SpcClientDesktop() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [member, setMember] = useState(null);
  const [spcClient, setSpcClient] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const selectedBlockIdRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [rail, setRail] = useState("Lift progress");
  const [readoutSession, setReadoutSession] = useState(null);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  // Print is per-session, not per-block: spc/print/[blockId] requires a
  // ?session= param and rendered an empty "Session NaN" page without one.
  const [printPickerOpen, setPrintPickerOpen] = useState(false);
  // Click-to-copy: pick a source tile with the ⧉, then click any number of
  // target tiles, then confirm. Restored on web — it only ever existed on
  // the native page, so adding this .web.js sibling silently took it away
  // from the platform where the programming actually happens.
  const [copySource, setCopySource] = useState(null);
  const [copyTargets, setCopyTargets] = useState(new Set());
  const [copyBusy, setCopyBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [defaultLengthWeeks, setDefaultLengthWeeks] = useState(4);
  const [latestBlockPreview, setLatestBlockPreview] = useState([]);

  const today = todayInBoise();

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [memberRow, clientRow, coachRows, blockRows, lengthSetting] = await Promise.all([
        getUser(userId),
        getSpcClient(userId),
        listCoaches(),
        listBlocksForSpcClient(userId),
        getSetting("default_block_length_spc_weeks", 4).catch(() => 4),
      ]);
      setDefaultLengthWeeks(Number(lengthSetting) || 4);
      setMember(memberRow);
      setSpcClient(clientRow);
      setNotesDraft(clientRow?.notes_goals_feedback ?? "");
      setCoaches(coachRows);

      const labelled = labelBlocks(blockRows).sort((a, b) => (a.block_start_date < b.block_start_date ? 1 : -1));
      setBlocks(labelled);

      // Default to the block covering today, else the most recent one.
      const current =
        labelled.find((b) => b.block_start_date <= today && today <= b.block_end_date) ?? labelled[0] ?? null;
      // Read through a ref, not the state value: `load` must NOT depend on
      // selectedBlockId, or every block-tab click changes load's identity,
      // re-fires the focus effect, and reloads the whole page (member,
      // coaches, blocks, stats, nutrition, preview) on top of the
      // getSpcBlockDetail selectBlock already ran.
      const previous = selectedBlockIdRef.current;
      const targetId = previous && labelled.some((b) => b.id === previous) ? previous : current?.id ?? null;
      selectedBlockIdRef.current = targetId;
      setSelectedBlockId(targetId);

      // Isolated: a stats failure must not blank the block itself, which is
      // the whole point of the page.
      getExerciseStats(userId)
        .then(setStats)
        .catch(() => setStats(null));

      getNutritionClient(userId)
        .then(setNutritionClient)
        .catch(() => setNutritionClient(null));

      // Week 1 of the most recent block, for the "copy last block" preview.
      // Week 1 specifically because since 0016 each week has its own
      // exercise list — there's no single list that represents the block.
      if (labelled.length > 0) {
        listSpcWorkoutsForBlock(labelled[0].id)
          .then(async (all) => {
            const week1 = all.filter((w) => w.week_number === 1);
            const names = await listSpcWorkoutExercisesForWorkouts(week1.map((w) => w.id));
            setLatestBlockPreview(
              week1
                .map((w) => ({ sessionNumber: w.session_number, names: names[w.id] ?? [] }))
                .sort((a, b) => a.sessionNumber - b.sessionNumber)
            );
          })
          .catch(() => setLatestBlockPreview([]));
      } else {
        setLatestBlockPreview([]);
      }

      setDetail(targetId ? await getSpcBlockDetail(userId, targetId, today) : null);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, [userId, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selectBlock = async (blockId) => {
    selectedBlockIdRef.current = blockId;
    setSelectedBlockId(blockId);
    try {
      setDetail(await getSpcBlockDetail(userId, blockId, today));
    } catch (err) {
      toastError("Couldn't load that block", err);
    }
  };

  const cancelCopy = () => {
    setCopySource(null);
    setCopyTargets(new Set());
  };

  const handleCellPress = (session) => {
    // While copying, a tile click means "toggle this as a paste target"
    // rather than "open it" — clicking the source again cancels.
    if (copySource) {
      if (session.id === copySource.id) {
        cancelCopy();
        return;
      }
      setCopyTargets((prev) => {
        const next = new Set(prev);
        if (next.has(session.id)) next.delete(session.id);
        else next.add(session.id);
        return next;
      });
      return;
    }
    // A logged session opens the read-out; anything else opens the builder,
    // because the only useful thing to do with an unlogged session is write
    // or finish it.
    if (session.state === "logged") setReadoutSession(session);
    else router.push(`/(coach)/spc/builder/${session.id}`);
  };

  const handleConfirmCopy = async () => {
    const targets = [...copyTargets];
    if (targets.length === 0) return;
    // Only warn about tiles that would actually lose something.
    const overwriting = targets.filter((id) => {
      const target = detail?.sessions.find((x) => x.id === id);
      return (target?.programmedSets ?? 0) > 0;
    }).length;
    if (overwriting > 0 && !(await confirmOverwrite(overwriting))) return;
    setCopyBusy(true);
    try {
      await Promise.all(targets.map((id) => copySpcWorkoutContent(copySource.id, id)));
      toastSuccess(`Copied into ${targets.length} session${targets.length === 1 ? "" : "s"}.`);
      cancelCopy();
      await load();
    } catch (err) {
      toastError("Failed to copy session", err);
    } finally {
      setCopyBusy(false);
    }
  };

  const handleCreateBlock = async (mode, lengthWeeks) => {
    if (!blocks.length && mode === "copy") return;
    const latest = [...blocks].sort((a, b) => (a.block_end_date < b.block_end_date ? -1 : 1)).pop();
    try {
      const created = await createSpcBlock({
        spcClientId: userId,
        coachId: spcClient?.assigned_coach_id ?? profile.id,
        startDate: latest ? addDays(latest.block_end_date, 1) : today,
        lengthWeeks,
        sessionsPerWeek: spcClient?.sessions_per_week ?? 2,
      });
      if (mode === "copy" && latest) await copyLastBlockContent(latest.id, created.id);
      setNewBlockOpen(false);
      setSelectedBlockId(created.id);
      await load();
      toastSuccess("New block started");
    } catch (err) {
      toastError("Couldn't create the block", err);
    }
  };

  const patch = async (fields, message) => {
    try {
      await updateSpcClient(userId, fields);
      setSpcClient((c) => ({ ...c, ...fields }));
      if (message) toastSuccess(message);
    } catch (err) {
      toastError("Couldn't save", err);
    }
  };

  const nextQueued = useMemo(() => {
    if (!detail) return false;
    return blocks.some((b) => b.block_start_date > detail.block.block_end_date);
  }, [blocks, detail]);

  // Key lifts and her notes are scoped to the block being viewed, not her
  // whole history — the rail is context for this block's programming.
  const blockLifts = useMemo(() => {
    if (!stats || !detail) return [];
    const { block_start_date: start, block_end_date: end } = detail.block;
    return stats.exercises
      .map((e) => {
        const within = e.sessions.filter((s) => s.date >= start && s.date <= end);
        if (within.length === 0) return null;
        const weights = within.map((s) => s.weight).filter((w) => w != null);
        const jump = weights.length >= 2 ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10 : null;
        return { exercise: e.exercise, trend: within.map((s) => s.weight), jump, count: within.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [stats, detail]);

  const blockNotes = useMemo(() => {
    if (!detail) return [];
    const out = [];
    for (const [date, rows] of detail.logsByDate) {
      const seen = new Set();
      for (const r of rows) {
        if (!r.notes || seen.has(r.exercise_id)) continue;
        seen.add(r.exercise_id);
        out.push({ date, note: r.notes, exerciseName: r.exercises?.name ?? "a lift" });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  }, [detail]);

  const blockPRs = useMemo(() => {
    if (!stats || !detail) return [];
    const { block_start_date: start, block_end_date: end } = detail.block;
    return stats.personalRecords.filter((p) => p.date >= start && p.date <= end);
  }, [stats, detail]);

  // Has to be declared ABOVE the two early returns below, not down beside the
  // handler that uses it: this component bails out early while loading and on
  // error, so a hook after those returns runs on some renders and not others.
  // That's "Rendered more hooks than during the previous render" — it only
  // fires once the page finishes loading, so it looks like a data bug rather
  // than a hooks bug. Keep every hook above this line.
  const [ending, setEnding] = useState(false);

  if (!ready) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (loadError || !member) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
            Couldn't load this client: {loadError ?? "not found"}
          </Text>
          <Pressable onPress={load}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  // "End here": keep this week, drop every week after it. See trimSpcBlockTo.
  // The handler is a plain function so it can live here, but its useState
  // cannot — see the declaration above the early returns.
  const handleEndBlockHere = async (block, lastWeek) => {
    const ok = await confirmEndBlockHere({
      lastWeek,
      removedWeeks: block.block_length_weeks - lastWeek,
      endDate: formatDateMD(addDays(block.block_start_date, lastWeek * 7 - 1)),
      wasRolling: Boolean(block.auto_extend),
    });
    if (!ok) return;
    setEnding(true);
    try {
      const { removedWeeks } = await trimSpcBlockTo(block.id, lastWeek);
      toastSuccess(`Block now ends after week ${lastWeek} — ${removedWeeks} week${removedWeeks === 1 ? "" : "s"} removed.`);
      await load();
    } catch (err) {
      toastError(err.message ?? String(err));
    } finally {
      setEnding(false);
    }
  };

  const weeks = detail ? [...new Set(detail.sessions.map((s) => s.week_number))].sort((a, b) => a - b) : [];
  const sessionNumbers = detail ? [...new Set(detail.sessions.map((s) => s.session_number))].sort((a, b) => a - b) : [];

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 26, paddingBottom: 70 }}>
        <Pressable onPress={() => router.push("/(coach)/spc")} style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#a8a29e" }}>‹ SPC</Text>
        </Pressable>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <View
            style={{ width: 46, height: 46, borderRadius: 99, backgroundColor: "#fdece5", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#b23a22" }}>{initials(member.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 240 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 29, color: "#2a211c" }}>{member.name}</Text>
              <View style={{ backgroundColor: "#33251f", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.7, color: "#f7f3ee" }}>SPC</Text>
              </View>
              {nutritionClient ? (
                <Pressable
                  onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)}
                  style={{ backgroundColor: "#e3ead9", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#4d6142" }}>Nutrition ›</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 3 }}>
              Coach: {coaches.find((c) => c.id === spcClient?.assigned_coach_id)?.name ?? "Unassigned"} · training{" "}
              {spcClient?.sessions_per_week ?? "—"}× a week
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {detail ? (
              <PressFade
                onPress={() => setPrintPickerOpen(true)}
                style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: "#fff" }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Print block</Text>
              </PressFade>
            ) : null}
            {/* Manages block length, Extend and the rolling switch as well
                as past blocks — the native page has always linked here, but
                this .web.js sibling never did, so on the platform where
                programming actually happens none of that was reachable. */}
            {/* Read view of this client's block in the member's own
                language — the builder is a build surface and doesn't hold up
                on a phone. */}
            <PressFade
              onPress={() => router.push(`/(coach)/spc/overview/${userId}`)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Preview</Text>
            </PressFade>
            <PressFade
              onPress={() => router.push(`/(coach)/spc/history/${userId}`)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 15, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>SPC blocks</Text>
            </PressFade>
            <PressFade
              onPress={() => setNewBlockOpen(true)}
              style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 17 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Build next block</Text>
            </PressFade>
          </View>
        </View>

        {/* Block tabs */}
        {blocks.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: CARD_BORDER, marginBottom: 20 }}>
            {blocks.map((b) => {
              const active = b.id === selectedBlockId;
              const isCurrent = b.block_start_date <= today && today <= b.block_end_date;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => selectBlock(b.id)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 15,
                    borderBottomWidth: 2,
                    borderBottomColor: active ? colors.primary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
                      fontSize: 13,
                      color: active ? colors.primaryOnWhite : "#a8a29e",
                    }}
                  >
                    {b.label}
                    {isCurrent ? " · current" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!detail ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 34, alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c", marginBottom: 6 }}>No blocks yet</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", textAlign: "center", marginBottom: 16 }}>
              Start her first block to begin programming.
            </Text>
            <PressFade
              onPress={() => setNewBlockOpen(true)}
              style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Start a block</Text>
            </PressFade>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 480 }}>
              <BlockBand
                block={detail.block}
                label={blocks.find((b) => b.id === detail.block.id)?.label ?? "Block"}
                summary={detail.summary}
                weekNumber={currentWeekNumber(detail.block.block_start_date, detail.block.block_length_weeks, today)}
                nextQueued={nextQueued}
                onBuildNext={() => setNewBlockOpen(true)}
              />

              <View style={{ flexDirection: "row", gap: 10, paddingLeft: 74, marginBottom: 8 }}>
                {sessionNumbers.map((n) => (
                  <View key={n} style={{ flex: 1, minWidth: 190 }}>
                    <Eyebrow>SESSION {n}</Eyebrow>
                  </View>
                ))}
              </View>

              {weeks.map((week) => {
                const { start } = weekWindow(detail.block, week);
                const isThisWeek = start <= today && today <= weekWindow(detail.block, week).end;
                return (
                  <View key={week} style={{ flexDirection: "row", gap: 10, alignItems: "stretch", marginBottom: 10 }}>
                    <View style={{ width: 64, paddingTop: 11 }}>
                      <Text
                        style={{
                          fontFamily: fonts.sansBold,
                          fontSize: 12.5,
                          color: isThisWeek ? colors.primaryOnWhite : "#57534e",
                        }}
                      >
                        Week {week}
                      </Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: isThisWeek ? colors.primaryOnWhite : "#a8a29e" }}>
                        {isThisWeek ? "This week" : formatDateMD(start)}
                      </Text>
                      {week >= currentWeekNumber(detail.block.block_start_date, detail.block.block_length_weeks, today) &&
                      week < detail.block.block_length_weeks ? (
                        <PressFade
                          onPress={() => handleEndBlockHere(detail.block, week)}
                          disabled={ending}
                          hitSlop={6}
                          style={{ alignSelf: "flex-start", marginTop: 5, opacity: ending ? 0.5 : 1 }}
                        >
                          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: "#b23a22" }}>End here</Text>
                        </PressFade>
                      ) : null}
                    </View>
                    {sessionNumbers.map((n) => {
                      const session = detail.sessions.find((s) => s.week_number === week && s.session_number === n);
                      let copyRole;
                      if (copySource && session) {
                        if (session.id === copySource.id) copyRole = "source";
                        else copyRole = copyTargets.has(session.id) ? "selected" : "eligible";
                      }
                      return session ? (
                        <SessionCell
                          key={n}
                          session={session}
                          onPress={handleCellPress}
                          copyRole={copyRole}
                          onStartCopy={(src) => {
                            setCopySource(src);
                            setCopyTargets(new Set());
                          }}
                        />
                      ) : (
                        <View key={n} style={{ flex: 1, minWidth: 190 }} />
                      );
                    })}
                  </View>
                );
              })}
            </View>

            {/* Right rail */}
            <View style={{ width: 280, flexGrow: 0, flexShrink: 0 }}>
              <View style={{ flexDirection: "row", gap: 2, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
                {["Lift progress", "Nutrition", "Notes"].map((tab) => (
                  <Pressable
                    key={tab}
                    onPress={() => setRail(tab)}
                    style={{ paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: rail === tab ? colors.primary : "transparent" }}
                  >
                    <Text
                      style={{
                        fontFamily: rail === tab ? fonts.sansBold : fonts.sansSemiBold,
                        fontSize: 12,
                        color: rail === tab ? colors.primaryOnWhite : "#a8a29e",
                      }}
                    >
                      {tab}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {rail === "Lift progress" ? (
                <>
                  <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15, marginBottom: 16 }}>
                    <Eyebrow style={{ marginBottom: 11 }}>THIS BLOCK</Eyebrow>
                    {[
                      ["Adherence", detail.summary.adherence == null ? "—" : `${detail.summary.adherence}%`],
                      ["PRs", String(blockPRs.length)],
                      ["Sets skipped", String(detail.summary.setsSkipped)],
                    ].map(([label, value]) => (
                      <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 }}>
                        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e" }}>{label}</Text>
                        <Text style={{ fontFamily: fonts.display, fontSize: 19, color: "#2a211c" }}>{value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15 }}>
                    <Eyebrow style={{ marginBottom: 12 }}>KEY LIFTS</Eyebrow>
                    <KeyLifts exercises={blockLifts} />
                  </View>
                </>
              ) : null}

              {rail === "Nutrition" ? (
                <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15 }}>
                  {nutritionClient ? (
                    <>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c", marginBottom: 4 }}>
                        On nutrition coaching
                      </Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginBottom: 12 }}>
                        Her check-ins, targets and photos live on the nutrition record.
                      </Text>
                      <PressFade
                        onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)}
                        style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, alignItems: "center" }}
                      >
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Open nutrition record</Text>
                      </PressFade>
                    </>
                  ) : (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                      She isn't on nutrition coaching.
                    </Text>
                  )}
                </View>
              ) : null}

              {rail === "Notes" ? (
                <>
                  <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15, marginBottom: 16 }}>
                    <Eyebrow style={{ marginBottom: 10 }}>WHAT SHE SAID</Eyebrow>
                    <WhatSheSaid notes={blockNotes} />
                  </View>

                  {/* Status, coach and frequency aren't in the v2 mock, which
                      shows them as plain text — but they have no other home
                      on web, so they stay editable here rather than being
                      dropped from the redesign. */}
                  <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15 }}>
                    <Eyebrow style={{ marginBottom: 10 }}>CLIENT SETTINGS</Eyebrow>

                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Status</Text>
                    <select
                      value={spcClient?.status ?? ""}
                      onChange={async (e) => {
                        const status = e.target.value;
                        try {
                          await setSpcStatus(userId, status);
                          setSpcClient((c) => ({ ...c, status }));
                        } catch (err) {
                          toastError("Couldn't update status", err);
                        }
                      }}
                      style={{ width: "100%", fontFamily: fonts.sans, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #d9d4cd", background: "#fff", marginBottom: 12 }}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>

                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Assigned coach</Text>
                    <select
                      value={spcClient?.assigned_coach_id ?? ""}
                      onChange={(e) => patch({ assigned_coach_id: e.target.value || null })}
                      style={{ width: "100%", fontFamily: fonts.sans, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #d9d4cd", background: "#fff", marginBottom: 12 }}
                    >
                      <option value="">Unassigned</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginBottom: 5 }}>Sessions a week</Text>
                    <SegmentedControl
                      segments={[1, 2, 3, 4].map((n) => ({ key: String(n), label: `${n}×` }))}
                      activeKey={String(spcClient?.sessions_per_week ?? 2)}
                      onSelect={(key) => patch({ sessions_per_week: Number(key) })}
                    />

                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginTop: 12, marginBottom: 5 }}>
                      Goals & feedback
                    </Text>
                    <TextInput
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      onBlur={() => {
                        if (notesDraft !== (spcClient?.notes_goals_feedback ?? "")) patch({ notes_goals_feedback: notesDraft }, "Notes saved");
                      }}
                      multiline
                      placeholder="What she's working toward…"
                      style={{
                        minHeight: 70,
                        borderWidth: 1,
                        borderColor: CARD_BORDER,
                        borderRadius: 8,
                        padding: 10,
                        fontFamily: fonts.sans,
                        fontSize: 12.5,
                        color: "#2a211c",
                        textAlignVertical: "top",
                      }}
                    />
                  </View>
                </>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky confirm bar — outside the ScrollView so it stays put while
          you scroll the grid picking targets. Same shape as the Group
          Programs grid's own copy bar. */}
      {copySource ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            paddingHorizontal: 22,
            paddingVertical: 14,
            backgroundColor: "#3b3531",
          }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: "#ffffff" }}>
            Copying{" "}
            <Text style={{ fontFamily: fonts.sansSemiBold }}>
              {copySource.title || `Session ${copySource.session_number}`} · Week {copySource.week_number}
            </Text>
            {" — "}
            {copyTargets.size} target{copyTargets.size === 1 ? "" : "s"} selected. Click tiles to choose where it goes.
          </Text>
          <PressFade onPress={cancelCopy} style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#c9beb4" }}>Cancel</Text>
          </PressFade>
          <PressFade
            onPress={handleConfirmCopy}
            disabled={copyTargets.size === 0 || copyBusy}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 9,
              backgroundColor: colors.primary,
              opacity: copyTargets.size === 0 || copyBusy ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#ffffff" }}>
              {copyBusy ? "Copying…" : `Copy to ${copyTargets.size} session${copyTargets.size === 1 ? "" : "s"}`}
            </Text>
          </PressFade>
        </View>
      ) : null}

      <SpcSessionReadout
        visible={Boolean(readoutSession)}
        session={readoutSession}
        logsByDate={detail?.logsByDate ?? new Map()}
        personalRecords={stats?.personalRecords ?? []}
        memberName={member.name}
        blockLabel={blocks.find((b) => b.id === selectedBlockId)?.label}
        onClose={() => setReadoutSession(null)}
        onPrev={(() => {
          if (!detail || !readoutSession) return null;
          const logged = detail.sessions.filter((s) => s.state === "logged");
          const i = logged.findIndex((s) => s.id === readoutSession.id);
          return i > 0 ? () => setReadoutSession(logged[i - 1]) : null;
        })()}
        onNext={(() => {
          if (!detail || !readoutSession) return null;
          const logged = detail.sessions.filter((s) => s.state === "logged");
          const i = logged.findIndex((s) => s.id === readoutSession.id);
          return i >= 0 && i < logged.length - 1 ? () => setReadoutSession(logged[i + 1]) : null;
        })()}
      />

      <NewSpcBlockChoiceModal
        visible={newBlockOpen}
        nextLabel={`Block ${blocks.length + 1}`}
        latestBlockLabel={blocks[0]?.label ?? null}
        weeksAgo={blocks[0] ? weeksSince(blocks[0].block_end_date, today) : 0}
        preview={latestBlockPreview}
        defaultLengthWeeks={defaultLengthWeeks}
        lastBlockLengthWeeks={blocks[0]?.block_length_weeks}
        onClose={() => setNewBlockOpen(false)}
        onSubmit={handleCreateBlock}
      />

      <PrintSessionPickerModal
        visible={printPickerOpen}
        loading={false}
        sessionNumbers={[...new Set((detail?.sessions ?? []).map((w) => w.session_number))].sort((a, b) => a - b)}
        onClose={() => setPrintPickerOpen(false)}
        onPick={(n) => {
          setPrintPickerOpen(false);
          router.push(`/(coach)/spc/print/${detail.block.id}?session=${n}`);
        }}
      />

      <CoachMessageBubble userId={userId} clientName={member.name} />
    </CoachShell>
  );
}

// See the same split in app/(coach)/blocks/index.web.js: a .web.js sibling
// shadows its native file on web at any width, so the installed PWA served a
// coach the desktop build grid on a phone. Below the breakpoint this renders
// what native renders (app/(coach)/spc/[userId].js). Two components rather
// than one early return, so the desktop screen's hooks keep a stable order.
function SpcClientMobileWeb() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  return (
    <CoachShell>
      <CoachSpcOverview
        userId={userId}
        showBack
        backTo="/(coach)/spc"
        footer={
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <PressFade onPress={() => router.push(`/(coach)/spc/history/${userId}`)} hitSlop={10} style={{}}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                Manage blocks ›
              </Text>
            </PressFade>
          </View>
        }
      />
      <CoachMessageBubble userId={userId} />
    </CoachShell>
  );
}

export default function SpcClientDetailWeb() {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT ? <SpcClientMobileWeb /> : <SpcClientDesktop />;
}
