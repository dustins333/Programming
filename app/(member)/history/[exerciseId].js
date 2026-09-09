import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLogsForExercise } from "../../../lib/programming/memberPlan";
import { getExercise } from "../../../lib/programming/exercises";
import { formatDateMDY } from "../../../lib/formatDate";
import { deriveSetLabels } from "../../../lib/programming/setLabels";
import { LiftProgressSection } from "../../../components/LiftProgress";
import { TrueCoachLinkRow } from "../../../components/TrueCoachLinkRow";
import { PressFade } from "../../../components/PressFade";
import { LiftPhotoViewer } from "../../../components/LiftPhotoViewer";
import { listLiftPhotos } from "../../../lib/programming/liftPhotos";
import { fonts, colors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

// A set typed into and then cleared leaves a row behind with both reps and
// weight null — logResult updates an existing row even to null on purpose, so
// that clearing a filled-in field persists. Those husks aren't history; drop
// them, and drop a date left with nothing real rather than rendering it as a
// session of dashes. The chart (LiftProgress) and the PR stats already skip
// them; this list was the one place they still surfaced.
const isRealSet = (row) => row.reps !== null || row.weight !== null;

// Groups per-set rows under one date header instead of one flat row per
// set — a 3-set session would otherwise show as 3 near-identical rows.
function groupByDate(logs, photos = []) {
  const groups = [];
  const byDate = new Map();
  for (const row of logs.filter(isRealSet)) {
    if (!byDate.has(row.date_performed)) {
      const group = { date: row.date_performed, sets: [], notes: null };
      byDate.set(row.date_performed, group);
      groups.push(group);
    }
    const group = byDate.get(row.date_performed);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }
  // A photo on a day whose sets were never typed, or typed and then cleared,
  // has no row to hang off — so without this it would be unreachable, and she
  // would have taken a photo that silently went nowhere. Give that day its own
  // card with no sets on it.
  for (const photo of photos) {
    if (byDate.has(photo.date_performed)) continue;
    const group = { date: photo.date_performed, sets: [], notes: null };
    byDate.set(photo.date_performed, group);
    groups.push(group);
  }
  for (const group of groups) {
    group.photos = photos.filter((p) => p.date_performed === group.date);
  }
  // The logs arrive newest-first, so appending photo-only days can break that
  // order. Sorted once here rather than assuming.
  groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return groups;
}

export default function ExerciseHistory() {
  // `returnTo`/`before` are set when this was opened from a lift's history
  // sheet mid-session (see ExerciseHistoryModal). Reached from My History
  // itself, both are absent and nothing below changes.
  const { exerciseId, before, returnTo } = useLocalSearchParams();
  const backToSession = useMemo(() => {
    if (!returnTo) return null;
    try {
      return JSON.parse(returnTo);
    } catch {
      // A malformed param shouldn't strand her on a screen with no way out.
      return "/(member)/plan";
    }
  }, [returnTo]);
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [photos, setPhotos] = useState([]);
  // The day whose photos are open, or null.
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      // The exercise is fetched on its own so the title (and the TrueCoach
      // row) don't depend on there being any logs to read the name off —
      // a lift with no Kova history yet is exactly the case that row exists for.
      // The photos carry their own catch rather than sharing this Promise.all's
      // all-or-nothing failure: they're the newest thing here, and a screen
      // that has worked for months must not go blank because one added table
      // errored (or hasn't been migrated yet).
      const [data, ex, pics] = await Promise.all([
        listLogsForExercise(profile.id, exerciseId, before ?? null),
        getExercise(exerciseId).catch(() => null),
        // The SAME cutoff the logs use. Opened from a lift's history sheet
        // mid-session this is today's date, and without it that screen showed
        // today's photo with today's sets filtered out -- a card holding a
        // picture and nothing else.
        listLiftPhotos(profile.id, exerciseId, before ?? null).catch(() => []),
      ]);
      setLogs(data);
      setExercise(ex);
      setPhotos(pics);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile.id, exerciseId, before]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => (logs ? groupByDate(logs, photos) : []), [logs, photos]);

  return (
    <View className="flex-1 px-6 pb-8" style={{ backgroundColor: CANVAS, paddingTop: insets.top + 6 }}>
      {/* Opened mid-session, this pushes into the History tab's own stack, so
          router.back() surrenders to the tab navigator and lands on My Week —
          not where she actually came from. When we know the origin, navigate
          to it explicitly instead of trusting the stack. */}
      <Pressable
        onPress={() => {
          if (backToSession) router.push(backToSession);
          else if (router.canGoBack()) router.back();
          else router.push("/(member)/history");
        }}
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
          {backToSession ? "‹ My Fitness" : "‹ My History"}
        </Text>
      </Pressable>

      {loadError ? (
        <View className="flex-1 items-center justify-center">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Couldn't load history: {loadError}
          </Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      ) : !logs ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {exercise?.name ?? logs[0]?.exercises?.name ?? "History"}
          </Text>
          <TrueCoachLinkRow
            userId={profile.id}
            exerciseId={exerciseId}
            exerciseName={exercise?.name ?? logs[0]?.exercises?.name ?? "this lift"}
            onChanged={load}
          />
          <LiftProgressSection logs={logs} />
          <FlatList
        data={groups}
        keyExtractor={(group) => group.date}
        ListEmptyComponent={
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No logged results yet.
          </Text>
        }
        renderItem={({ item: group }) => (
          <View className="mb-2.5 rounded-2xl bg-white px-4 py-3.5" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
            <View className="mb-1.5" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c", flex: 1, minWidth: 0 }}>
                {formatDateMDY(group.date)}
              </Text>
              {/* Only on a day that actually has one, so the row stays quiet
                  otherwise. The count only appears past one — a "1" next to a
                  camera reads as a badge that means something. */}
              {group.photos?.length ? (
                <PressFade
                  onPress={() => setViewing(group.photos)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityLabel={`View the photo from ${formatDateMDY(group.date)}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 9,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#fdf6f2",
                    borderWidth: 1,
                    borderColor: "#f0ddd2",
                  }}
                >
                  <Ionicons name="camera" size={15} color={colors.primaryOnWhite} />
                  {group.photos.length > 1 ? (
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>
                      {group.photos.length}
                    </Text>
                  ) : null}
                </PressFade>
              ) : null}
            </View>
            {/* The label is DERIVED, never the stored set_number (0116). A
                ramp-up keeps its row position in the database, so printing
                the raw number here would have this screen call a set "Set 2"
                while her own logging card calls the same set "SET 1". */}
            {deriveSetLabels(group.sets).map((label, i) => {
              const s = group.sets[i];
              return (
                <Text
                  key={s.id}
                  style={{ fontFamily: fonts.sans, fontSize: 14, color: label.rampUp ? colors.muted : "#57534e", marginTop: 2 }}
                >
                  {label.rampUp ? `Ramp up ${label.index}` : `Set ${label.index}`}: {s.reps ?? "–"} reps
                  {s.weight != null ? ` @ ${s.weight} lb` : ""}
                </Text>
              );
            })}
            {group.notes ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 6, fontStyle: "italic" }}>
                {group.notes}
              </Text>
            ) : null}
          </View>
        )}
          />
        </>
      )}

      {/* Closed on delete rather than kept open on a shortened list: the
          array this was handed is a snapshot, and paging through it after a
          delete would ask for a file that is already gone. */}
      {viewing ? (
        <LiftPhotoViewer
          photos={viewing}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            setViewing(null);
            load();
          }}
        />
      ) : null}
    </View>
  );
}
