import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  listExercises,
  listPendingExercises,
  listExerciseUsageCounts,
  approveExercise,
  updateExercise,
  setExerciseActive,
  isLibraryReviewer,
  muscleGroupLabel,
} from "../../../lib/programming/exercises";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { ExerciseTypePill } from "../../../components/ExerciseTypePill";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { confirmArchiveExercise } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { formatDateMDY } from "../../../lib/formatDate";
import { dateInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

// The library review queue (0094).
//
// Every coach can add an exercise and use it in a program the same minute
// — that half is deliberately unrestricted, because the alternative was a
// coach stuck mid-build waiting on someone else. This screen is the other
// half: whoever holds can_view_exercise_library sees what came in, fixes
// the naming and tagging, and signs it off.
//
// Nothing here gates a member's view. A pending entry is already live in
// whatever session it was added to; approving is about keeping the library
// itself consistent, not about releasing anything.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function Eyebrow({ children, style }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>{children}</Text>;
}

// The tags a reviewer is actually checking. Anything unset shows as "not
// set" rather than being omitted — a missing muscle group is the most
// common thing to fix here, and a line that simply isn't there doesn't
// prompt anyone to fix it.
function TagLine({ label, value, missing }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
      <Text style={{ width: 96, fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: missing ? fonts.sans : fonts.sansSemiBold, fontSize: 11.5, color: missing ? "#c08a72" : "#44403c" }}>
        {missing ? "not set" : value}
      </Text>
    </View>
  );
}

// Exported so a harness route can render it with fixed data — this screen
// itself needs a real signed-in reviewer.
export function PendingCard({ exercise, uses, busy, onEdit, onApprove, onArchive }) {
  const isWarmup = (exercise.type ?? "lift") === "warmup";
  const muscles = (exercise.muscle_group ?? []).map(muscleGroupLabel).join(", ");
  const patterns = (exercise.movement_pattern ?? []).map((p) => p.replace(/_/g, " ")).join(", ");
  const added = exercise.created_at ? formatDateMDY(dateInBoise(new Date(exercise.created_at))) : null;

  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 18, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#2a211c" }}>{exercise.name}</Text>
            <ExerciseTypePill type={exercise.type} always />
          </View>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 3 }}>
            Added by {exercise.created_by_name ?? "an unknown coach"}
            {added ? ` | ${added}` : ""}
            {/* Already in use is the thing that changes how carefully you
                rename it — a rename is free, but it's the name a member is
                looking at in a live session. */}
            {uses > 0 ? ` | already used ${uses}×` : ""}
          </Text>

          <View style={{ marginTop: 10 }}>
            {isWarmup ? null : <TagLine label="Muscle group" value={muscles} missing={!muscles} />}
            {isWarmup ? null : <TagLine label="Pattern" value={patterns} missing={!patterns} />}
            <TagLine
              label="Default"
              value={`${exercise.default_sets ?? "—"} × ${exercise.default_reps ?? "—"}`}
              missing={!exercise.default_sets && !exercise.default_reps}
            />
            {isWarmup ? null : (
              <TagLine label="Logs" value={exercise.tracks_weight === false ? "reps only, no weight" : `weight + ${exercise.rep_unit ?? "reps"}`} />
            )}
            <TagLine label="Cues" value={exercise.cues} missing={!exercise.cues} />
          </View>

          {exercise.video_url ? (
            <Pressable onPress={() => Linking.openURL(exercise.video_url)} style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#4d6142" }}>Watch video →</Text>
            </Pressable>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c08a72", marginTop: 8 }}>No video linked</Text>
          )}
        </View>

        <View style={{ gap: 8, minWidth: 132 }}>
          <PressFade
            onPress={busy ? undefined : () => onApprove(exercise)}
            style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, opacity: busy ? 0.5 : 1 }}
          >
            <Text style={{ textAlign: "center", fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Approve</Text>
          </PressFade>
          <PressFade
            onPress={() => onEdit(exercise)}
            style={{ borderWidth: 1, borderColor: "#d9d4cd", backgroundColor: "#fff", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16 }}
          >
            <Text style={{ textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Edit</Text>
          </PressFade>
          <Pressable onPress={busy ? undefined : () => onArchive(exercise)} style={{ paddingVertical: 6 }}>
            <Text style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Archive</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function LibraryReview() {
  const { profile } = useAuth();
  const router = useRouter();
  const reviewer = isLibraryReviewer(profile);

  const [pending, setPending] = useState(null);
  const [library, setLibrary] = useState([]);
  const [usage, setUsage] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!reviewer) return;
    setLoadError(null);
    try {
      setPending(await listPendingExercises());
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Both of these are context, not gates — a failure leaves the queue
    // fully workable, it just can't say "already used 4×" or warn that the
    // name matches something already in the library.
    try {
      const [counts, rows] = await Promise.all([listExerciseUsageCounts(), listExercises({ includeArchived: true })]);
      setUsage(counts);
      setLibrary(rows);
    } catch {
      setUsage({});
      setLibrary([]);
    }
  }, [reviewer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleApprove = async (exercise) => {
    setBusyId(exercise.id);
    try {
      await approveExercise(exercise.id, profile.id);
      setPending((prev) => (prev ?? []).filter((e) => e.id !== exercise.id));
      toastSuccess(`${exercise.name} approved`);
    } catch (err) {
      toastError("Couldn't approve", err);
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (exercise) => {
    const uses = usage[exercise.id] ?? 0;
    const note =
      uses > 0
        ? `It's already used in ${uses} place${uses === 1 ? "" : "s"} across your programming — archiving will blank its name out of any live session that still references it. If it's the wrong name rather than the wrong exercise, edit it instead.`
        : undefined;
    if (!(await confirmArchiveExercise(exercise.name, note))) return;
    setBusyId(exercise.id);
    try {
      await setExerciseActive(exercise.id, false);
      setPending((prev) => (prev ?? []).filter((e) => e.id !== exercise.id));
    } catch (err) {
      toastError("Couldn't archive", err);
    } finally {
      setBusyId(null);
    }
  };

  // Editing does NOT approve — tidying an entry and signing it off are two
  // decisions, so the card stays in the queue with its new values showing.
  const handleSubmitEdit = async (form) => {
    try {
      await updateExercise(editing.id, form);
      await load();
    } catch (err) {
      toastError("Couldn't save", err);
      throw err;
    }
  };

  if (!reviewer) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, padding: 28 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c", textAlign: "center" }}>
            You're not a library reviewer.
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", textAlign: "center", marginTop: 6, maxWidth: 380 }}>
            You can still add exercises and use them in your programs right away — an admin can turn reviewing on for you
            in Settings → Team.
          </Text>
          <Pressable onPress={() => router.push("/(coach)/exercises")} style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Go to the Exercise Library</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

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

  if (!pending) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }}>
        <View style={{ maxWidth: 900, width: "100%" }}>
          <Pressable onPress={() => router.push("/(coach)/exercises")}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite, marginBottom: 10 }}>
              ‹ Exercise Library
            </Text>
          </Pressable>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Library review</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 6, marginBottom: 20, maxWidth: 620 }}>
            Exercises other coaches added. They're already live in whatever program they were built into — approving is
            about keeping the library's naming and tagging consistent, so take your time.
          </Text>

          {pending.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 26 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>Nothing waiting.</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 4 }}>
                Anything a coach adds to the library shows up here for you to tidy up and sign off.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <Eyebrow>WAITING ON YOU</Eyebrow>
                <View style={{ backgroundColor: "#f1efed", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#78716c" }}>{pending.length}</Text>
                </View>
              </View>
              {pending.map((ex) => (
                <PendingCard
                  key={ex.id}
                  exercise={ex}
                  uses={usage[ex.id] ?? 0}
                  busy={busyId === ex.id}
                  onEdit={setEditing}
                  onApprove={handleApprove}
                  onArchive={handleArchive}
                />
              ))}
            </>
          )}
        </View>

        <ExerciseFormModal
          visible={Boolean(editing)}
          initialExercise={editing}
          // The whole library, not just the queue — the modal's duplicate
          // warning is comparing against everything that already exists.
          allExercises={library}
          usage={usage}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmitEdit}
        />
      </ScrollView>
    </CoachShell>
  );
}
