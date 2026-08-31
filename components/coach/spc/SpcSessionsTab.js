import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Modal, ActivityIndicator, Switch, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { PressFade } from "../../PressFade";
import { ExercisePickerModal } from "../../ExercisePickerModal";
import { fonts, colors } from "../../../lib/theme";
import { addDays, mondayOnOrBefore, todayInBoise } from "../../../lib/boiseDate";
import {
  listSpcWorkoutsForBlock,
  createSpcBlock,
  publishSpcBlock,
  setSpcProgramEnd,
  addSpcSessionSlot,
  rescheduleSpcProgram,
  unpublishSpcProgram,
  publishReadySessions,
  deleteSpcBlock,
} from "../../../lib/programming/spcBlocks";
import {
  listSpcWorkoutExercises,
  addSpcWorkoutExercise,
  updateSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  copySpcWorkoutContent,
  setSpcWorkoutStatus,
} from "../../../lib/programming/spcWorkouts";
import { listExercises } from "../../../lib/programming/exercises";
import { liftLabelsFor } from "../../../lib/programming/sessionLabels";
import { monthDay } from "../../../lib/programming/spcState";
import { calendarWeekNumber } from "../../../lib/programming/schedule";
import { listSpcCompletionDetailsForWorkouts } from "../../../lib/programming/sessionCompletions";
import {
  confirmRemoveLift,
  confirmOpenLiveEditor,
  confirmDeleteDraftBlock,
  confirmCancelQueuedProgram,
} from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";

// The Sessions tab — the whole SPC programming workflow
// (design_handoff_spc_rework_v1, 1c/1d).
//
// LEFT (Current program): live to the member. Sets / reps / rest edit in
// place but commit ONLY through the Update bar — deliberate, no accidents
// (Terra's explicit call; the app autosaves everywhere else, this pane is
// the exception). RIGHT (Upcoming program): invisible to the member, built
// in the full session editor which autosaves, published with a start Monday
// + a length. On that date it becomes current and the old program closes
// into History.
//
// On a phone the two panes become two sub-tabs, Current / Upcoming, with a
// dot per tab (olive = live, grey = invisible).

const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";
const OLIVE_BG = "#eef1e7";

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function Badge({ label, live }) {
  return (
    <View
      style={{
        backgroundColor: live ? OLIVE_BG : "#f1efec",
        borderRadius: 99,
        paddingVertical: 3,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: live ? OLIVE : "#78716c" }}>
        {label}
      </Text>
    </View>
  );
}

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "your client";
}

// "Mon Aug 3" — starts are always Mondays and ends Sundays by construction
// (0063's CHECK + setSpcProgramEnd), so the weekday prefix is static.
const monFmt = (iso) => `Mon ${monthDay(iso)}`;
const sunFmt = (iso) => `Sun ${monthDay(iso)}`;

/* ----------------------------------------------------------- data loading */

async function loadBlockSessions(block) {
  if (!block) return null;
  const workouts = await listSpcWorkoutsForBlock(block.id);
  const sorted = [...workouts].sort((a, b) => a.session_number - b.session_number);
  const sessions = await Promise.all(
    sorted.map(async (workout) => ({ workout, exercises: await listSpcWorkoutExercises(workout.id) }))
  );
  return sessions;
}

/* ------------------------------------------------------------ current pane */

function LiftRow({ label, row, draft, onDraft, onRemove, editable }) {
  const value = (field, fallback) => draft?.[field] ?? fallback ?? "";
  const inputStyle = {
    borderWidth: 1,
    borderColor: "#e2ddd6",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: "#2a211c",
    textAlign: "center",
    backgroundColor: "#fff",
  };
  const inSuperset = Boolean(row.superset_group_id);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: "#f4f1ec",
        borderLeftWidth: inSuperset ? 3 : 0,
        borderLeftColor: "#dbe8cf",
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 99,
          borderWidth: 1.5,
          borderColor: "#dcc9bf",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.primaryOnWhite }}>{label}</Text>
      </View>
      <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={1}>
        {row.exercises?.name ?? "Unknown lift"}
      </Text>

      {editable ? (
        <>
          <TextInput
            value={String(value("sets", row.sets))}
            onChangeText={(t) => onDraft(row.id, "sets", t)}
            keyboardType="number-pad"
            style={[inputStyle, { width: 44 }]}
          />
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>×</Text>
          <TextInput
            value={String(value("reps", row.reps))}
            onChangeText={(t) => onDraft(row.id, "reps", t)}
            style={[inputStyle, { width: 72 }]}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>rest</Text>
            <TextInput
              value={String(value("rest", row.rest ?? ""))}
              onChangeText={(t) => onDraft(row.id, "rest", t)}
              placeholder="—"
              placeholderTextColor="#c9c4bd"
              style={[inputStyle, { width: 58 }]}
            />
          </View>
          <PressFade onPress={() => onRemove(row)} hitSlop={8} accessibilityLabel={`Remove ${row.exercises?.name}`}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: "#c9c4bd" }}>×</Text>
          </PressFade>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e" }}>
            {row.sets} × {row.reps}
          </Text>
          {inSuperset ? <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c58a3a" }}>superset</Text> : null}
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", width: 44, textAlign: "right" }}>
            {row.rest ?? ""}
          </Text>
        </>
      )}
    </View>
  );
}

function supersetFootnote(exercises, labels) {
  const groups = new Map();
  for (const row of exercises) {
    if (!row.superset_group_id) continue;
    if (!groups.has(row.superset_group_id)) groups.set(row.superset_group_id, []);
    groups.get(row.superset_group_id).push(labels[row.id]);
  }
  const pairs = [...groups.values()].filter((g) => g.length > 1);
  if (!pairs.length) return null;
  return pairs.map((g) => `${g.join(" + ")} run as a superset, rest after ${g[g.length - 1]} only.`).join(" ");
}

function SessionCard({ session, labels, drafts, onDraft, onRemove, onAddLift, onOpenEditor, clientFirst, editable }) {
  const { workout, exercises } = session;
  const empty = exercises.length === 0;
  const note = supersetFootnote(exercises, labels);
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, marginTop: 14, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>Session {workout.session_number}</Text>
        {workout.title ? (
          <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }} numberOfLines={1}>
            {workout.title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {editable ? (
          <>
            <PressFade onPress={() => onOpenEditor(session)} hitSlop={6}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#a8a29e" }}>Full editor ›</Text>
            </PressFade>
            <PressFade onPress={() => onAddLift(session)} hitSlop={6}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>+ Add lift</Text>
            </PressFade>
          </>
        ) : (
          <PressFade onPress={() => onOpenEditor(session)} hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Edit</Text>
          </PressFade>
        )}
      </View>

      {empty ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
            Nothing in it yet. Hidden from {clientFirst} until it has lifts.
          </Text>
        </View>
      ) : (
        exercises.map((row) => (
          <LiftRow
            key={row.id}
            label={labels[row.id]}
            row={row}
            draft={drafts?.[row.id]}
            onDraft={onDraft}
            onRemove={onRemove}
            editable={editable}
          />
        ))
      )}

      {note ? (
        <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------- publish modal */

// Does double duty: publishing a draft, and changing the dates of one already
// published for a future Monday. Same question either way — which Monday, how
// long, and what that does to whatever is running — so a second modal would
// only be a second place for those rules to drift.
export function PublishProgramModal({ visible, onClose, current, spcClient, onPublish, busy, mode = "publish", block = null }) {
  const rescheduling = mode === "reschedule";
  const today = todayInBoise();
  const thisMonday = mondayOnOrBefore(today);
  const nextMonday = addDays(thisMonday, 7);
  // Terra's three (2026-08-30 follow-up): now / next Monday / in 2 weeks.
  // "Now" is this week's Monday — live to her the moment it publishes — so a
  // client whose program runs out Friday can walk in Monday with a new one.
  //
  // When rescheduling, the Monday it is CURRENTLY set to joins the list if it
  // isn't already one of the three: a program queued a month out would
  // otherwise offer no way back to where it started after a stray tap.
  const options = useMemo(() => {
    const base = [
      { date: thisMonday, note: "now", now: true },
      { date: nextMonday, note: "next Monday" },
      { date: addDays(nextMonday, 7), note: "in 2 weeks" },
    ];
    const scheduled = rescheduling ? block?.block_start_date : null;
    if (scheduled && !base.some((o) => o.date === scheduled)) {
      base.push({ date: scheduled, note: "where it is now" });
      base.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    return base;
  }, [thisMonday, nextMonday, rescheduling, block?.block_start_date]);

  const [startDate, setStartDate] = useState(null);
  const [weeks, setWeeks] = useState(null);
  useEffect(() => {
    if (!visible) return;
    if (rescheduling && block) {
      // Seeded from where it actually is, so the modal opens showing the
      // truth and any change is a deliberate one.
      setStartDate(block.block_start_date);
      setWeeks(
        block.block_end_date == null
          ? "ongoing"
          : [4, 5, 6, 8].includes(block.block_length_weeks)
            ? block.block_length_weeks
            : 6
      );
      return;
    }
    // No current program → default to Now, so publishing visibly takes
    // effect instead of sitting queued until Monday looking unpublished
    // (Terra's item 4). With one running, next Monday is the safer default
    // and Now is one tap away.
    setStartDate(current ? nextMonday : thisMonday);
    setWeeks([4, 5, 6, 8].includes(current?.block_length_weeks) ? current.block_length_weeks : 6);
    // Derived values are stable while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;
  const ongoing = weeks === "ongoing";
  const endDate = startDate && !ongoing ? addDays(startDate, weeks * 7 - 1) : null;
  const shortens = Boolean(
    current && current.block_start_date < startDate && (current.block_end_date == null || current.block_end_date >= startDate)
  );
  const replaces = Boolean(current && current.block_start_date >= startDate);

  const chip = (active) => ({
    borderWidth: 1.5,
    borderColor: active ? colors.primary : "#e2ddd6",
    backgroundColor: active ? "#fdf6f2" : "#fff",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <PressFade onPress={onClose} pressedOpacity={1} style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <PressFade onPress={() => {}} pressedOpacity={1} style={{ width: "100%", maxWidth: 480, backgroundColor: "#fff", borderRadius: 16, padding: 22 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#2a211c" }}>
            {rescheduling ? "Change when this program runs" : "Publish this program"}
          </Text>

          <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>STARTS MONDAY</Eyebrow>
          <View style={{ gap: 8 }}>
            {options.map((o) => (
              <PressFade key={o.date} onPress={() => setStartDate(o.date)} style={chip(startDate === o.date)}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
                  {monthDay(o.date)} <Text style={{ fontFamily: fonts.sans, color: "#78716c" }}>· {o.note}</Text>
                </Text>
              </PressFade>
            ))}
          </View>

          <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>HOW MANY WEEKS</Eyebrow>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* PressFade needs a plain object style, never an array — it
                spreads the style it's handed (see the v5 pass's Pressable
                lesson), and a spread array becomes indexed keys that crash
                RNW's CSSStyleDeclaration. "∞" publishes an Ongoing program
                (0103): no end date, never turns Due soon, the rolling
                replacement. */}
            {[4, 5, 6, 8, "ongoing"].map((w) => (
              <PressFade key={w} onPress={() => setWeeks(w)} style={{ ...chip(weeks === w), flex: 1, alignItems: "center" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: weeks === w ? colors.primaryOnWhite : "#57534e" }}>
                  {w === "ongoing" ? "∞" : w}
                </Text>
              </PressFade>
            ))}
          </View>
          {ongoing ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginTop: 6 }}>
              Ongoing: no end date, runs until you set one. Never turns Due soon.
            </Text>
          ) : null}

          <View style={{ backgroundColor: "#faf8f6", borderRadius: 10, padding: 13, marginTop: 18 }}>
            <Eyebrow style={{ marginBottom: 5 }}>{rescheduling ? "THIS PROGRAM" : "NEW PROGRAM"}</Eyebrow>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }}>
              {startDate
                ? ongoing
                  ? `Starts ${monthDay(startDate)} · ongoing`
                  : `${monthDay(startDate)} – ${monthDay(endDate)} · ${weeks} weeks`
                : ""}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 4 }}>
              {replaces
                ? `Replaces the program that started ${monthDay(current.block_start_date)}. It goes back to your build space as a draft, and her logged lifts keep their history.`
                : shortens
                  ? `Her current program is shortened to end ${sunFmt(addDays(startDate, -1))}. Everything she's logged keeps its history.`
                  : current?.block_end_date && startDate > current.block_end_date
                    ? `Her current program stays live until ${sunFmt(current.block_end_date)} and closes into History on ${monthDay(startDate)}.`
                    : startDate === thisMonday
                      ? rescheduling
                        ? "It goes live to her as soon as you save."
                        : "It goes live to her the moment you publish."
                      : "It goes live to her that Monday."}
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <PressFade onPress={onClose} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#78716c" }}>Cancel</Text>
            </PressFade>
            <PressFade
              onPress={() => onPublish(startDate, ongoing ? { ongoing: true } : { lengthWeeks: weeks })}
              disabled={busy || !startDate}
              style={{ backgroundColor: "#33251f", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, opacity: busy || !startDate ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#f7f3ee" }}>
                {busy
                  ? rescheduling
                    ? "Saving…"
                    : "Publishing…"
                  : rescheduling
                    ? startDate === thisMonday
                      ? "Save · live now"
                      : `Save · starts ${startDate ? monthDay(startDate) : ""}`
                    : startDate === thisMonday
                      ? "Publish · live now"
                      : `Publish · starts ${startDate ? monthDay(startDate) : ""}`}
              </Text>
            </PressFade>
          </View>
        </PressFade>
      </PressFade>
    </Modal>
  );
}

/* -------------------------------------------------------------- main tab */

export function SpcSessionsTab({ userId, member, spcClient, coachId, current, upcoming, onChanged, isDesktop }) {
  const router = useRouter();
  const today = todayInBoise();
  const clientFirst = firstNameOf(member?.name);

  const [currentSessions, setCurrentSessions] = useState(null);
  const [upcomingSessions, setUpcomingSessions] = useState(null);
  const [library, setLibrary] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [pickerFor, setPickerFor] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loggedCount, setLoggedCount] = useState(0);
  const [pane, setPane] = useState("current");

  const reloadSessions = useCallback(async () => {
    try {
      const [cur, up] = await Promise.all([loadBlockSessions(current), loadBlockSessions(upcoming)]);
      setCurrentSessions(cur ?? []);
      setUpcomingSessions(up ?? []);
      if (cur && cur.length) {
        const details = await listSpcCompletionDetailsForWorkouts(userId, cur.map((s) => s.workout.id)).catch(() => new Map());
        setLoggedCount(details.size);
      } else {
        setLoggedCount(0);
      }
    } catch (err) {
      toastError("Couldn't load the sessions", err);
      setCurrentSessions([]);
      setUpcomingSessions([]);
    }
  }, [current?.id, upcoming?.id, userId]);

  // On FOCUS, not just on mount/dep-change: coming back from the full
  // builder returns to an already-mounted page with the same block ids, and
  // without this the pane kept showing the pre-edit sessions — which also
  // kept the Publish button disabled ("everything looks empty"), the exact
  // round-trip Terra reported.
  useFocusEffect(
    useCallback(() => {
      reloadSessions();
    }, [reloadSessions])
  );

  useEffect(() => {
    listExercises()
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, []);

  /* ---------------- current-pane drafts (the Update bar) ---------------- */

  const originalFor = (rowId) => {
    for (const s of currentSessions ?? []) {
      const row = s.exercises.find((e) => e.id === rowId);
      if (row) return row;
    }
    return null;
  };

  const setDraft = (rowId, field, value) => {
    setDrafts((d) => ({ ...d, [rowId]: { ...d[rowId], [field]: value } }));
  };

  const dirtyRows = useMemo(() => {
    const out = [];
    for (const [rowId, fields] of Object.entries(drafts)) {
      const original = originalFor(rowId);
      if (!original) continue;
      const changed = {};
      if (fields.sets !== undefined && String(fields.sets) !== String(original.sets)) changed.sets = fields.sets;
      if (fields.reps !== undefined && String(fields.reps) !== String(original.reps)) changed.reps = fields.reps;
      if (fields.rest !== undefined && String(fields.rest) !== String(original.rest ?? "")) changed.rest = fields.rest;
      if (Object.keys(changed).length) out.push({ rowId, changed });
    }
    return out;
    // originalFor reads currentSessions, so both are real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, currentSessions]);

  const handleUpdate = async () => {
    setBusy(true);
    try {
      for (const { rowId, changed } of dirtyRows) {
        const fields = {};
        if (changed.sets !== undefined) fields.sets = Math.max(1, Number(changed.sets) || 1);
        if (changed.reps !== undefined) fields.reps = String(changed.reps);
        if (changed.rest !== undefined) fields.rest = String(changed.rest).trim() || null;
        await updateSpcWorkoutExercise(rowId, fields);
      }
      // A session that gained lifts while it was a hidden draft (a frequency
      // bump's new card) goes live with the same deliberate press.
      for (const s of currentSessions ?? []) {
        if (s.exercises.length > 0 && s.workout.status !== "published") {
          await setSpcWorkoutStatus(s.workout.id, "published");
        }
      }
      setDrafts({});
      await reloadSessions();
      toastSuccess(`Updated. ${clientFirst} sees this now.`);
    } catch (err) {
      toastError("Couldn't update", err);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------- actions ------------------------------ */

  const handleAddLift = async (exercise) => {
    const session = pickerFor;
    setPickerFor(null);
    if (!session || !exercise) return;
    try {
      await addSpcWorkoutExercise({
        workoutId: session.workout.id,
        exerciseId: exercise.id,
        position: session.exercises.length + 1,
        userId,
        defaultSets: exercise.default_sets,
        defaultReps: exercise.default_reps,
      });
      // Adding to a live session shows immediately; adding to a hidden draft
      // session stays hidden until Update publishes it.
      await reloadSessions();
      if (session.workout.status === "published") toastSuccess(`Added. Live to ${clientFirst}.`);
    } catch (err) {
      toastError("Couldn't add the lift", err);
    }
  };

  const handleRemoveLift = async (row) => {
    if (!(await confirmRemoveLift(row.exercises?.name ?? "this lift", clientFirst))) return;
    try {
      await removeSpcWorkoutExercise(row.id);
      await reloadSessions();
    } catch (err) {
      toastError("Couldn't remove the lift", err);
    }
  };

  const handleOpenEditor = async (session, live) => {
    if (live && session.exercises.length > 0) {
      if (!(await confirmOpenLiveEditor(clientFirst))) return;
    }
    router.push(`/(coach)/spc/builder/${session.workout.id}`);
  };

  const handleAddWeek = async () => {
    try {
      await setSpcProgramEnd(current.id, addDays(current.block_end_date, 7));
      toastSuccess(`Extended. Now ends ${sunFmt(addDays(current.block_end_date, 7))}.`);
      onChanged();
    } catch (err) {
      toastError("Couldn't extend", err);
    }
  };

  const handleOngoingToggle = async (on) => {
    try {
      if (on) {
        await setSpcProgramEnd(current.id, null);
        toastSuccess("Ongoing. Runs until you set an end date.");
      } else {
        // Restore a real end: the stored length from the start, and never in
        // the past — an ongoing program that outran its old length ends this
        // Sunday at the earliest.
        const candidate = addDays(current.block_start_date, (current.block_length_weeks ?? 4) * 7 - 1);
        const thisSunday = addDays(mondayOnOrBefore(today), 6);
        await setSpcProgramEnd(current.id, candidate >= today ? candidate : thisSunday);
      }
      onChanged();
    } catch (err) {
      toastError("Couldn't change the end date", err);
    }
  };

  const handleBuildSession = async (block, sessionNumber, thenReload = reloadSessions) => {
    try {
      await addSpcSessionSlot(block.id, sessionNumber);
      await thenReload();
    } catch (err) {
      toastError("Couldn't add the session", err);
    }
  };

  const handleStartUpcoming = async (copyCurrent) => {
    setBusy(true);
    try {
      const created = await createSpcBlock({
        spcClientId: userId,
        coachId: spcClient?.assigned_coach_id ?? coachId,
        lengthWeeks: current?.block_length_weeks ?? 4,
        sessionsPerWeek: spcClient?.sessions_per_week ?? 2,
        status: "draft",
        format: "sessions",
      });
      if (copyCurrent && currentSessions?.length) {
        const newSessions = await listSpcWorkoutsForBlock(created.id);
        for (const s of currentSessions) {
          const target = newSessions.find((w) => w.session_number === s.workout.session_number);
          if (target) await copySpcWorkoutContent(s.workout.id, target.id);
        }
      }
      onChanged();
    } catch (err) {
      toastError("Couldn't start the upcoming program", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUpcoming = async () => {
    if (!(await confirmDeleteDraftBlock())) return;
    try {
      await deleteSpcBlock(upcoming.id);
      onChanged();
    } catch (err) {
      toastError("Couldn't delete it", err);
    }
  };

  const handlePublish = async (startDate, { lengthWeeks = null, ongoing = false } = {}) => {
    setBusy(true);
    try {
      const result = await publishSpcBlock(upcoming.id, { startDate, lengthWeeks, ongoing });
      setPublishOpen(false);
      toastSuccess(
        result.startDate <= today
          ? `Published. Live to ${clientFirst} now.`
          : `Published. Goes live to ${clientFirst} ${monFmt(result.startDate)}.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = async (startDate, { lengthWeeks = null, ongoing = false } = {}) => {
    setBusy(true);
    try {
      const result = await rescheduleSpcProgram(upcoming.id, { startDate, lengthWeeks, ongoing });
      setRescheduleOpen(false);
      toastSuccess(
        result.startDate <= today
          ? `Saved. Live to ${clientFirst} now.`
          : `Saved. Goes live to ${clientFirst} ${monFmt(result.startDate)}.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't change the dates", err);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelUpcoming = async () => {
    if (!(await confirmCancelQueuedProgram(clientFirst, monFmt(upcoming.block_start_date)))) return;
    setBusy(true);
    try {
      await unpublishSpcProgram(upcoming.id);
      toastSuccess("Cancelled. It's back in your build space as a draft.");
      onChanged();
    } catch (err) {
      toastError("Couldn't cancel it", err);
    } finally {
      setBusy(false);
    }
  };

  // A session added AFTER publishing is created as a draft (addSpcSessionSlot),
  // and nothing was ever going to publish it — so it sat invisible to her with
  // the pane saying "Published" above it. Same deliberate press as the current
  // program's Update.
  const handlePublishAdded = async () => {
    setBusy(true);
    try {
      const { published } = await publishReadySessions(upcoming.id);
      toastSuccess(
        published === 0
          ? "Nothing new to send yet."
          : upcoming.block_start_date <= today
            ? `Sent. ${clientFirst} sees ${published === 1 ? "it" : "them"} now.`
            : `Sent. ${clientFirst} sees ${published === 1 ? "it" : "them"} ${monFmt(upcoming.block_start_date)}.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't send it", err);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------- render ------------------------------- */

  const weekNumber = current?.block_start_date ? calendarWeekNumber(current.block_start_date, today) : null;
  const lapsed = Boolean(current?.block_end_date && current.block_end_date < today);
  const expected = weekNumber ? weekNumber * (spcClient?.sessions_per_week ?? 1) : 0;
  const targetSessions = spcClient?.sessions_per_week ?? 1;
  const upcomingQueued = Boolean(upcoming && upcoming.status === "active");
  // Sessions built after it was published: they hold lifts but are still
  // drafts, so she cannot see them and nothing on screen said so.
  const unsentUpcoming = upcomingQueued
    ? (upcomingSessions ?? []).filter((s) => s.exercises.length > 0 && s.workout.status !== "published").length
    : 0;

  const missingCurrentSlots = useMemo(() => {
    if (!current || !currentSessions) return [];
    const have = new Set(currentSessions.map((s) => s.workout.session_number));
    const missing = [];
    for (let n = 1; n <= targetSessions; n += 1) if (!have.has(n)) missing.push(n);
    return missing;
  }, [current, currentSessions, targetSessions]);

  const currentPane = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: OLIVE }} />
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>Current program</Text>
        <Badge label={`LIVE TO ${clientFirst.toUpperCase()}`} live />
      </View>

      {!current ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 24, marginTop: 14 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }}>No current program</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 4 }}>
            Build her first one on the {isDesktop ? "right" : "Upcoming tab"} and publish it with a start Monday.
          </Text>
        </View>
      ) : currentSessions == null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <>
          {/* Dates band */}
          <View
            style={{
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: lapsed ? "#ecd9ab" : CARD_BORDER,
              borderRadius: 14,
              padding: 14,
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Eyebrow>DATES</Eyebrow>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }}>
              {monFmt(current.block_start_date)} →{" "}
              {current.block_end_date ? sunFmt(current.block_end_date) : "No end date"}
              {current.block_end_date ? (
                <Text style={{ fontFamily: fonts.sans, color: "#78716c" }}> · {current.block_length_weeks} weeks</Text>
              ) : null}
            </Text>
            {current.block_end_date ? (
              <PressFade
                onPress={handleAddWeek}
                style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#dcc9bf", borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>+ Add a week</Text>
              </PressFade>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Switch
                value={!current.block_end_date}
                onValueChange={handleOngoingToggle}
                trackColor={{ true: colors.primary, false: "#d9d4cd" }}
                thumbColor="#fff"
                {...(Platform.OS === "web" ? { activeThumbColor: "#fff" } : {})}
              />
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e" }}>Ongoing</Text>
            </View>
            <Text style={{ flex: 1, minWidth: 160, textAlign: "right", fontFamily: fonts.sans, fontSize: 12, color: lapsed ? "#9a6b1f" : "#78716c" }}>
              {lapsed
                ? `Ended ${sunFmt(current.block_end_date)} · still live to her until you publish something new`
                : current.block_end_date
                  ? `Week ${weekNumber} of ${current.block_length_weeks} · she's logged ${loggedCount} of ${expected} so far`
                  : `Week ${weekNumber} · runs until you set an end date`}
            </Text>
          </View>

          {currentSessions.map((s) => (
            <SessionCard
              key={s.workout.id}
              session={s}
              labels={liftLabelsFor(s.exercises)}
              drafts={drafts}
              onDraft={setDraft}
              onRemove={handleRemoveLift}
              onAddLift={(session) => setPickerFor(session)}
              onOpenEditor={(session) => handleOpenEditor(session, true)}
              clientFirst={clientFirst}
              editable
            />
          ))}

          {missingCurrentSlots.map((n) => (
            <PressFade
              key={n}
              onPress={() => handleBuildSession(current, n)}
              style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#dcc9bf", borderRadius: 14, padding: 18, marginTop: 14, alignItems: "center" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                + Build Session {n}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 3 }}>
                Her frequency is {targetSessions}× a week. This slot isn't built yet.
              </Text>
            </PressFade>
          ))}

          {dirtyRows.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: "#33251f",
                borderRadius: 12,
                padding: 14,
                marginTop: 16,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#f7f3ee" }}>
                  {dirtyRows.length} unsaved change{dirtyRows.length === 1 ? "" : "s"}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a89a92", marginTop: 2 }}>
                  Changes go live to {clientFirst} immediately.
                </Text>
              </View>
              <PressFade onPress={() => setDrafts({})} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#c9beb4" }}>Discard</Text>
              </PressFade>
              <PressFade
                onPress={handleUpdate}
                disabled={busy}
                style={{ backgroundColor: OLIVE, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18, opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>{busy ? "Updating…" : "Update"}</Text>
              </PressFade>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const upcomingPane = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: "#c9c4bd" }} />
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>Upcoming program</Text>
        <Badge label={`INVISIBLE TO ${clientFirst.toUpperCase()}`} />
      </View>

      {!upcoming ? (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: "#dcc9bf",
            borderRadius: 14,
            padding: 24,
            marginTop: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c", textAlign: "center" }}>
            Nothing queued yet
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", textAlign: "center", marginTop: 4 }}>
            Build the next program here. She can't see any of it until you publish.
          </Text>
          {current ? (
            <PressFade
              onPress={() => handleStartUpcoming(true)}
              disabled={busy}
              style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, marginTop: 14, opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Copy current program</Text>
            </PressFade>
          ) : null}
          <PressFade onPress={() => handleStartUpcoming(false)} disabled={busy} style={{ marginTop: 10 }} hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              {current ? "or build from blank" : "Build from blank"}
            </Text>
          </PressFade>
        </View>
      ) : upcomingSessions == null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: "#dcc9bf",
            borderRadius: 14,
            padding: 14,
            marginTop: 14,
          }}
        >
          {upcomingQueued ? (
            /* Published-with-a-future-date needs to LOOK published, or a
               coach reads the pane as "nothing happened" (Terra's item 4). */
            <View style={{ backgroundColor: "#eef1e7", borderRadius: 10, padding: 12 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#4d6142" }}>
                ✓ Published · goes live to {clientFirst} {monFmt(upcoming.block_start_date)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#57534e", marginTop: 2 }}>
                {upcoming.block_end_date == null
                  ? "Ongoing, no end date. Edits keep flowing into it until then."
                  : `Runs to ${sunFmt(upcoming.block_end_date)}. Edits keep flowing into it until then.`}
              </Text>
              {/* Published is not final. Nothing here is visible to her yet
                  (0102 gates her reads on the start date), so both of these
                  are safe right up until the Monday it starts. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                <PressFade onPress={() => setRescheduleOpen(true)} disabled={busy} hitSlop={6}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#4d6142", opacity: busy ? 0.5 : 1 }}>
                    Change dates
                  </Text>
                </PressFade>
                <PressFade onPress={handleCancelUpcoming} disabled={busy} hitSlop={6}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22", opacity: busy ? 0.5 : 1 }}>
                    Cancel program
                  </Text>
                </PressFade>
              </View>
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              Autosaves in the editor · publish it when it's ready
            </Text>
          )}

          {upcomingSessions.map((s) => (
            <SessionCard
              key={s.workout.id}
              session={s}
              labels={liftLabelsFor(s.exercises)}
              onOpenEditor={(session) => handleOpenEditor(session, false)}
              clientFirst={clientFirst}
              editable={false}
            />
          ))}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
            <PressFade
              onPress={() =>
                handleBuildSession(upcoming, (upcomingSessions[upcomingSessions.length - 1]?.workout.session_number ?? 0) + 1)
              }
              hitSlop={6}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>+ Add session</Text>
            </PressFade>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
              {upcomingSessions.length} session{upcomingSessions.length === 1 ? "" : "s"}
              {upcomingSessions.length === targetSessions ? ` · matches her ${targetSessions}× / week` : ` · her target is ${targetSessions}× / week`}
            </Text>
          </View>

          {upcomingQueued && unsentUpcoming > 0 ? (
            <>
              <PressFade
                onPress={handlePublishAdded}
                disabled={busy}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 14,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#f7f3ee" }}>
                  {`↑ Send ${unsentUpcoming} new session${unsentUpcoming === 1 ? "" : "s"}`}
                </Text>
              </PressFade>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 8 }}>
                {unsentUpcoming === 1 ? "This one was" : "These were"} built after you published, so {clientFirst} can't see{" "}
                {unsentUpcoming === 1 ? "it" : "them"} yet.
              </Text>
            </>
          ) : null}

          {!upcomingQueued ? (
            <>
              <PressFade
                onPress={() => setPublishOpen(true)}
                disabled={busy || upcomingSessions.every((s) => s.exercises.length === 0)}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 14,
                  opacity: busy || upcomingSessions.every((s) => s.exercises.length === 0) ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#f7f3ee" }}>↑ Publish</Text>
              </PressFade>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 8 }}>
                You pick the Monday it starts and how many weeks it runs. Her current program closes into History that day.
              </Text>
              <PressFade onPress={handleDeleteUpcoming} style={{ alignSelf: "center", marginTop: 8 }} hitSlop={6}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#b23a22" }}>Delete this draft</Text>
              </PressFade>
            </>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <View>
      {isDesktop ? (
        <View style={{ flexDirection: "row", gap: 26, alignItems: "flex-start" }}>
          {currentPane}
          {upcomingPane}
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
            {[
              { key: "current", label: "Current", live: true },
              { key: "upcoming", label: "Upcoming", live: false },
            ].map((t) => (
              <PressFade
                key={t.key}
                onPress={() => setPane(t.key)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: pane === t.key ? "#fff" : "transparent",
                  borderWidth: 1,
                  borderColor: pane === t.key ? CARD_BORDER : "transparent",
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: t.live ? OLIVE : "transparent",
                    borderWidth: t.live ? 0 : 1.5,
                    borderColor: "#c9c4bd",
                  }}
                />
                <Text style={{ fontFamily: pane === t.key ? fonts.sansBold : fonts.sansSemiBold, fontSize: 13, color: pane === t.key ? "#2a211c" : "#78716c" }}>
                  {t.label}
                </Text>
              </PressFade>
            ))}
          </View>
          {pane === "current" ? currentPane : upcomingPane}
        </View>
      )}

      <ExercisePickerModal
        visible={Boolean(pickerFor)}
        library={library.filter((e) => e.type !== "warmup")}
        onClose={() => setPickerFor(null)}
        onPick={handleAddLift}
      />

      <PublishProgramModal
        visible={publishOpen}
        onClose={() => setPublishOpen(false)}
        current={current}
        spcClient={spcClient}
        onPublish={handlePublish}
        busy={busy}
      />
      <PublishProgramModal
        visible={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        current={current}
        spcClient={spcClient}
        onPublish={handleReschedule}
        busy={busy}
        mode="reschedule"
        block={upcoming}
      />
    </View>
  );
}
