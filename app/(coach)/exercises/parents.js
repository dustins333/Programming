import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, isLibraryReviewer } from "../../../lib/programming/exercises";
import {
  listExerciseParents,
  createExerciseParent,
  renameExerciseParent,
  deleteExerciseParent,
  setExerciseParent,
  countMembersByParent,
} from "../../../lib/programming/exerciseParents";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { confirmDeleteExerciseParent } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";

// Managing the parent records added in 0095 — the movements a variation
// hangs under in the builder sidebar. Reviewer-only, matching the RLS:
// adding a parent is open to every coach (that's "+ New parent" on the
// exercise form, so nobody is blocked mid-build), while renaming and
// removing are the reviewer's job and live here.
//
// Its own screen rather than a block on the review queue: that queue is a
// list that empties out, and a permanent management list sitting under it
// makes "nothing waiting" stop being true at a glance. This sits beside
// Merge on the library page, which is the same kind of thing.
//
// Nothing here can lose data. Removing a parent sets its members'
// parent_id to null (ON DELETE SET NULL) and taking an exercise out of a
// parent does the same for one row — in both cases the exercise, its logs,
// its history and every session it appears in are untouched.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function Eyebrow({ children, style }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>{children}</Text>;
}

// Exported so a harness route can render it with fixed data — this screen
// itself needs a real signed-in reviewer. Same reason review.js exports
// its own card.
export function ParentCard({ parent, members, expanded, onToggle, onRename, onDelete, onRemoveMember, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(parent.name);
  // Pressing Enter fires onSubmitEditing AND then onBlur as the field
  // unmounts, which saves twice. A ref, not state: both handlers run
  // before a setState would apply.
  const savedRef = useRef(false);

  const commit = () => {
    if (savedRef.current) return;
    savedRef.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next && next !== parent.name) onRename(parent, next);
    else setDraft(parent.name);
  };

  const active = members.filter((m) => m.is_active !== false);
  const archived = members.length - active.length;

  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
        <Pressable onPress={onToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={expanded ? "Collapse" : "Expand"}>
          <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={18} color="#78716c" />
        </Pressable>

        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            onFocus={() => {
              savedRef.current = false;
            }}
            onSubmitEditing={commit}
            onBlur={commit}
            style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c", borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
          />
        ) : (
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              savedRef.current = false;
              setDraft(parent.name);
              setEditing(true);
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#2a211c" }}>{parent.name}</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>
              {active.length === 0
                ? "Nothing filed under this — it won't show in the builder"
                : `${active.length} exercise${active.length === 1 ? "" : "s"}`}
              {archived > 0 ? ` | ${archived} archived` : ""}
            </Text>
          </Pressable>
        )}

        <Pressable onPress={busy ? undefined : () => onDelete(parent, active.length)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ opacity: busy ? 0.5 : 1 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#b23a22" }}>Remove</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: "#f4f1ec", paddingHorizontal: 16, paddingVertical: 10 }}>
          {members.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", paddingVertical: 6 }}>
              Nothing here. Put an exercise in this parent from its own entry in the Exercise Library.
            </Text>
          ) : (
            members.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7 }}>
                <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: m.is_active === false ? "#a8a29e" : "#44403c" }}>
                  {m.name}
                  {m.is_active === false ? " (archived)" : ""}
                </Text>
                <Pressable onPress={() => onRemoveMember(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#a8a29e" }}>Take out</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function ExerciseParents() {
  const { profile } = useAuth();
  const router = useRouter();
  const reviewer = isLibraryReviewer(profile);

  const [parents, setParents] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!reviewer) return;
    setLoadError(null);
    try {
      const [parentRows, exerciseRows] = await Promise.all([
        listExerciseParents(),
        listExercises({ includeArchived: true }),
      ]);
      setParents(parentRows);
      setExercises(exerciseRows);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [reviewer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const membersByParent = useMemo(() => {
    const map = new Map();
    for (const ex of exercises) {
      if (!ex.parent_id) continue;
      if (!map.has(ex.parent_id)) map.set(ex.parent_id, []);
      map.get(ex.parent_id).push(ex);
    }
    return map;
  }, [exercises]);

  const counts = useMemo(() => countMembersByParent(exercises), [exercises]);
  const emptyCount = useMemo(
    () => (parents ?? []).filter((p) => (counts.get(p.id)?.active ?? 0) === 0).length,
    [parents, counts]
  );

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const created = await createExerciseParent({ name, createdBy: profile?.id });
      setParents((prev) => [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      toastSuccess(`"${created.name}" added`);
    } catch (err) {
      toastError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (parent, name) => {
    // Optimistic: the field has already closed by the time this runs, so
    // leaving the old name on screen until a round trip finishes reads as
    // the rename not having taken.
    setParents((prev) => (prev ?? []).map((p) => (p.id === parent.id ? { ...p, name } : p)).sort((a, b) => a.name.localeCompare(b.name)));
    try {
      await renameExerciseParent(parent.id, name);
    } catch (err) {
      setParents((prev) => (prev ?? []).map((p) => (p.id === parent.id ? { ...p, name: parent.name } : p)));
      toastError(err.message ?? String(err));
    }
  };

  const handleDelete = async (parent, memberCount) => {
    if (!(await confirmDeleteExerciseParent(parent.name, memberCount))) return;
    setBusy(true);
    try {
      await deleteExerciseParent(parent.id);
      setParents((prev) => (prev ?? []).filter((p) => p.id !== parent.id));
      setExercises((prev) => prev.map((e) => (e.parent_id === parent.id ? { ...e, parent_id: null } : e)));
      toastSuccess(`"${parent.name}" removed`);
    } catch (err) {
      toastError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (exercise) => {
    const previous = exercise.parent_id;
    setExercises((prev) => prev.map((e) => (e.id === exercise.id ? { ...e, parent_id: null } : e)));
    try {
      await setExerciseParent(exercise.id, null);
    } catch (err) {
      setExercises((prev) => prev.map((e) => (e.id === exercise.id ? { ...e, parent_id: previous } : e)));
      toastError(err.message ?? String(err));
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
            You can still add a parent while adding an exercise — an admin can turn reviewing on for you in Settings →
            Team.
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

  if (!parents) {
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
        <View style={{ maxWidth: 760, width: "100%" }}>
          <Pressable onPress={() => router.push("/(coach)/exercises")}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite, marginBottom: 10 }}>
              ‹ Exercise Library
            </Text>
          </Pressable>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Parents</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 6, marginBottom: 20, maxWidth: 620 }}>
            The movements a variation files under in the builder sidebar. A parent isn't an exercise — it can't be put
            in a program or logged against, it only opens to show what's underneath. Removing one keeps every exercise
            inside it.
          </Text>

          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <Eyebrow style={{ marginBottom: 8 }}>NEW PARENT</Eyebrow>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Hip Thrust"
                onSubmitEditing={handleCreate}
                style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13.5, borderWidth: 1, borderColor: "#d6d3d1", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }}
              />
              <PressFade
                onPress={handleCreate}
                style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 18, opacity: busy || !newName.trim() ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Add</Text>
              </PressFade>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <Eyebrow>{parents.length} PARENT{parents.length === 1 ? "" : "S"}</Eyebrow>
            {emptyCount > 0 ? (
              <View style={{ backgroundColor: "#f5ede4", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#8a5140" }}>{emptyCount} empty</Text>
              </View>
            ) : null}
          </View>

          {parents.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 26 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>No parents yet.</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 4 }}>
                Add one above, then pick it in the Parent field on any exercise.
              </Text>
            </View>
          ) : (
            parents.map((parent) => (
              <ParentCard
                key={parent.id}
                parent={parent}
                members={membersByParent.get(parent.id) ?? []}
                expanded={expanded.has(parent.id)}
                onToggle={() => toggle(parent.id)}
                onRename={handleRename}
                onDelete={handleDelete}
                onRemoveMember={handleRemoveMember}
                busy={busy}
              />
            ))
          )}
        </View>
      </ScrollView>
    </CoachShell>
  );
}
