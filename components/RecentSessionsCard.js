import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listLogsForDate, listLogsForSession } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { repUnit } from "../lib/programming/repUnit";
import { fonts, colors } from "../lib/theme";

// Groups one date's flat set rows by exercise, same shape
// history/[exerciseId].js's groupByDate uses for the member's own read of
// this data, just keyed by exercise instead of by date since a single
// session spans several exercises.
function groupByExercise(logs) {
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
  return groups;
}

// Exported for the coach dashboard's ActivityFeed, which renders the same
// expandable per-set row but titled with the member's name (`title`) and
// with a tap-through into the client page (`onOpenClient`) inside the
// expansion. Both props optional — the per-client card below passes neither
// and behaves exactly as before.
export function SessionRow({ userId, session, title, onOpenClient }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(null);
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
      const scoped = session.session ? await listLogsForSession(userId, session.session) : null;
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
  const groups = visibleLogs ? groupByExercise(visibleLogs) : [];

  return (
    <View className="border-b border-stone-100 py-3">
      <Pressable onPress={handleToggle} className="flex-row items-center justify-between">
        {/* Headline is which session it was ("SPC - Week 1 session 1");
            the coach's own name for it, when they gave one, sits on the
            second line after the date rather than competing with it. In
            the dashboard feed `title` is the member's name, so the session
            label moves down a line there instead. */}
        <View className="flex-1 pr-3">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13.5 }} className="text-stone-700">
            {title ?? session.label}
          </Text>
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {title ? `${session.label} · ${formatDateMDY(session.date)}` : formatDateMDY(session.date)}
            {session.sessionTitle ? ` · ${session.sessionTitle}` : ""}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
      </Pressable>

      {open ? (
        <View className="mt-2.5 pl-1">
          {onOpenClient ? (
            <Pressable onPress={onOpenClient} className="mb-2 self-start" hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Open client page ›</Text>
            </Pressable>
          ) : null}
          {loadError ? (
            <Text className="text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load this session: {loadError}
            </Text>
          ) : !visibleLogs ? (
            <ActivityIndicator color={colors.primary} size="small" style={{ alignSelf: "flex-start" }} />
          ) : groups.length === 0 ? (
            <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              Nothing logged for this session.
            </Text>
          ) : (
            groups.map((g) => (
              <View key={g.exerciseId} className="mb-2.5">
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }} className="text-stone-700">
                  {g.name}
                </Text>
                {g.sets.map((s) => (
                  <Text key={s.id} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 1 }}>
                    Set {s.set_number}: {s.reps ?? "–"} {repUnit(g.exercise).word}{s.weight ? ` @ ${s.weight}` : ""}
                  </Text>
                ))}
                {g.notes ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 2, fontStyle: "italic" }}>
                    {g.notes}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
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
