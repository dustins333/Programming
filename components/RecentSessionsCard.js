import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listLogsForDate, listLogsForSession, listSessionExercisePlan } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { repUnit } from "../lib/programming/repUnit";
import { sumVolume } from "../lib/programming/volume";
import { liftLabelsFor } from "../lib/programming/sessionLabels";
import { SetBubbleRow } from "./hub/HubSetBubbles";
import { fonts, colors } from "../lib/theme";

// Groups one date's flat set rows by exercise, same shape
// history/[exerciseId].js's groupByDate uses for the member's own read of
// this data, just keyed by exercise instead of by date since a single
// session spans several exercises.
//
// `plan` is the session's own programmed exercise rows (memberPlan.js's
// listSessionExercisePlan) and is what puts the lifts back in the order the
// coach wrote them: the log rows themselves arrive ordered by exercise_id, a
// uuid, so without this the session reads back shuffled. It also carries the
// A / B1+B2 / C letters, from the same labeling language the builders, the
// printed sheet and the member app use.
//
// Anything logged but no longer programmed (a lift swapped out after the
// session was done) has no position and no letter, and sorts to the end
// rather than being dropped — it really was performed.
function groupByExercise(logs, plan) {
  const groups = [];
  const byExercise = new Map();
  for (const row of logs) {
    if (!byExercise.has(row.exercise_id)) {
      const group = { exerciseId: row.exercise_id, name: row.exercises?.name ?? "Exercise", exercise: row.exercises ?? null, sets: [], notes: null };
      byExercise.set(row.exercise_id, group);
      groups.push(group);
    }
    const group = byExercise.get(row.exercise_id);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }

  if (!plan || plan.length === 0) return groups;

  const labelsByRowId = liftLabelsFor(plan);
  const orderByExercise = new Map();
  const labelByExercise = new Map();
  plan.forEach((row, i) => {
    // First occurrence wins — an exercise programmed twice in one session
    // has only one set of logs to hang off it either way.
    if (orderByExercise.has(row.exercise_id)) return;
    orderByExercise.set(row.exercise_id, i);
    labelByExercise.set(row.exercise_id, labelsByRowId[row.id]);
  });

  for (const group of groups) group.label = labelByExercise.get(group.exerciseId) ?? null;
  // Array.sort is stable, so unplanned lifts keep their arrival order among
  // themselves after everything programmed.
  return groups.sort(
    (a, b) => (orderByExercise.get(a.exerciseId) ?? Infinity) - (orderByExercise.get(b.exerciseId) ?? Infinity)
  );
}

// A set counts once the member put a real number in either box. The same
// rule SetBubbleRow uses to decide a bubble is filled rather than dashed, so
// the count above the lifts and the shapes below it can't disagree.
const isRealSet = (row) => row.reps != null || row.weight != null;

function SessionStats({ groups, logs }) {
  const sets = logs.filter(isRealSet).length;
  const volume = sumVolume(logs);
  // Omitted rather than shown as 0 for a session of bodyweight, carries or
  // holds — reps x weight is not arithmetic there (see volume.js), and a
  // zero would read as "she lifted nothing".
  const tiles = [
    { value: String(groups.length), label: groups.length === 1 ? "LIFT" : "LIFTS" },
    { value: String(sets), label: sets === 1 ? "SET" : "SETS" },
    ...(volume > 0 ? [{ value: volume.toLocaleString(), label: "LB LIFTED" }] : []),
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#fdf6f2",
        borderWidth: 1,
        borderColor: "#f0ddd2",
        borderRadius: 12,
        paddingVertical: 9,
        marginBottom: 12,
      }}
    >
      {tiles.map((tile, i) => (
        <View
          key={tile.label}
          style={{
            flex: 1,
            alignItems: "center",
            borderLeftWidth: i === 0 ? 0 : 1,
            borderLeftColor: "#f0ddd2",
          }}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 17, color: colors.primaryOnWhite }}>
            {tile.value}
          </Text>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.8, color: "#a8998f", marginTop: 1 }}>
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// The lift's letter from the session's own labeling (A, B1, B2, C). Absent
// only when the plan couldn't be read, in which case the name simply starts
// at the left rather than a letter being invented that wouldn't match what
// the coach sees in the builder.
function LiftChip({ label }) {
  return (
    <View
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 4,
        borderRadius: 7,
        backgroundColor: "#f5efe9",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.primaryOnWhite }}>
        {label}
      </Text>
    </View>
  );
}

function initials(name) {
  return (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// What one expanded session shows: the shape of the work (a summary strip
// and a bubble per set) rather than a paragraph of "Set 1: 10 reps @ 135"
// lines, which a coach had to read end to end to see whether the weight
// went up. Split out of SessionRow so it can be rendered against fixed data
// without a network.
function SessionDetail({ groups, logs, loadError, onOpenClient }) {
  return (
    <View className="mt-2.5">
      {onOpenClient ? (
        <Pressable onPress={onOpenClient} className="mb-2.5 self-start" hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Open client page ›</Text>
        </Pressable>
      ) : null}
      {loadError ? (
        <Text className="text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          Couldn't load this session: {loadError}
        </Text>
      ) : !logs ? (
        <ActivityIndicator color={colors.primary} size="small" style={{ alignSelf: "flex-start" }} />
      ) : groups.length === 0 ? (
        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          Nothing logged for this session.
        </Text>
      ) : (
        <>
          <SessionStats groups={groups} logs={logs} />
          {groups.map((g) => (
            <View key={g.exerciseId} style={{ marginBottom: 11 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                {g.label ? <LiftChip label={g.label} /> : null}
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#44403c", flexShrink: 1 }} numberOfLines={1}>
                  {g.name}
                </Text>
              </View>
              <SetBubbleRow
                sets={g.sets}
                size="sm"
                tracksWeight={g.exercise?.tracks_weight !== false}
                suffix={repUnit(g.exercise).suffix}
              />
              {g.notes ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 5, fontStyle: "italic" }}>
                  “{g.notes}”
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// Exported for the coach dashboard's ActivityFeed, which renders the same
// expandable per-set row but titled with the member's name (`title`) and
// with a tap-through into the client page (`onOpenClient`) inside the
// expansion. `avatarName` draws an initials disc on the left and `subtitle`
// replaces the generated second line — both used by the sessions-today
// popup, where the list is one member per row and already scoped to today,
// so the date it would otherwise print says nothing. All optional; the
// per-client card below passes none and behaves exactly as before.
export function SessionRow({ userId, session, title, subtitle, avatarName, onOpenClient }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(null);
  // The session's programmed exercise rows — order and letters. Fetched
  // alongside the logs and allowed to fail on its own: without it the sets
  // are still right, they just aren't sorted.
  const [plan, setPlan] = useState(null);
  // Whether `logs` came back already scoped to this exact session (0063) or
  // is a whole calendar day that still needs narrowing by exercise.
  const [logsAreScoped, setLogsAreScoped] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const handleToggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (logs) return;
    // Cleared first so re-opening after a failed fetch retries cleanly
    // rather than showing the stale error alongside freshly-loaded rows.
    setLoadError(null);
    try {
      // Ask for this exact session first. Returns null when none of its logs
      // carry a session stamp — i.e. anything logged before 0063 — in which
      // case fall back to the calendar day and narrow it the old way.
      const [scoped, sessionPlan] = await Promise.all([
        session.session ? listLogsForSession(userId, session.session) : null,
        session.session ? listSessionExercisePlan(session.session).catch(() => null) : null,
      ]);
      setPlan(sessionPlan);
      setLogsAreScoped(Boolean(scoped));
      setLogs(scoped ?? (await listLogsForDate(userId, session.date)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  };

  // A scoped result is already exactly this session's sets. A fallback
  // result is everything logged that calendar day, so a client who finalized
  // two sessions in one evening would otherwise see both sessions' lifts
  // under each row — narrow to the exercises this session actually programs.
  // session.exerciseIds is null for a session with no exercise rows, and
  // then the unfiltered day is the honest answer.
  const visibleLogs = logs && !logsAreScoped && session.exerciseIds ? logs.filter((row) => session.exerciseIds.has(row.exercise_id)) : logs;
  const groups = visibleLogs ? groupByExercise(visibleLogs, plan) : [];

  return (
    <View className="border-b border-stone-100 py-3">
      <Pressable onPress={handleToggle} className="flex-row items-center justify-between">
        {avatarName ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#f5efe9",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>
              {initials(avatarName)}
            </Text>
          </View>
        ) : null}
        {/* Headline is which session it was ("SPC - Week 1 session 1");
            the coach's own name for it, when they gave one, sits on the
            second line after the date rather than competing with it. In
            the dashboard feed `title` is the member's name, so the session
            label moves down a line there instead. */}
        <View className="flex-1 pr-3">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13.5 }} className="text-stone-700">
            {title ?? session.label}
          </Text>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }} numberOfLines={1}>
            {subtitle ??
              `${title ? `${session.label} · ${formatDateMDY(session.date)}` : formatDateMDY(session.date)}${
                session.sessionTitle ? ` · ${session.sessionTitle}` : ""
              }`}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
      </Pressable>

      {open ? (
        <SessionDetail groups={groups} logs={visibleLogs} loadError={loadError} onOpenClient={onOpenClient} />
      ) : null}
    </View>
  );
}

// Recent finalized sessions for one client, each expanding into per-set
// reps/weight and the member's own notes — first real "does anyone see
// what a client actually logged" view on the coach side (previously only
// aggregate completion checkmarks/flags existed, never the numbers). No
// migration needed: "staff can read session completions" (0007) and
// "staff manage logs" (0004) already permit this.
// Capped at `initialCount` so this sits level with the Upcoming card
// beside it rather than running a dozen rows longer than its neighbour.
export function RecentSessionsCard({ userId, sessions, initialCount = 3 }) {
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) {
    return (
      <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
        No finalized sessions yet.
      </Text>
    );
  }

  const shown = expanded ? sessions : sessions.slice(0, initialCount);
  const hidden = sessions.length - shown.length;

  return (
    <View>
      {shown.map((session) => (
        <SessionRow key={session.id} userId={userId} session={session} />
      ))}
      {hidden > 0 || expanded ? (
        <Pressable onPress={() => setExpanded((prev) => !prev)} className="pt-3" hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            {expanded ? "Show fewer" : `Show ${hidden} more`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
