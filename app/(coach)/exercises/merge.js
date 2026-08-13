import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, listExerciseUsageCounts } from "../../../lib/programming/exercises";
import {
  findDuplicateCandidates,
  listMergeDismissals,
  dismissPair,
  undoDismissal,
  mergeExercises,
  pairKey,
} from "../../../lib/programming/exerciseMerge";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { confirmMergeExercises } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { formatDateMD } from "../../../lib/formatDate";
import { dateInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

// Merge exercises (design_handoff_coach_web_v2, 1o).
//
// Its own page rather than a banner on the library, because the detector's
// guesses shouldn't be the only way in: the picker at the top merges any
// two entries you name, flagged or not — which is the case a
// suggestions-only flow can't handle, two names that look nothing alike
// but are the same lift.
//
// Direction matters and is never guessed. The entry with the history is
// the one that survives; the page states which is which before you commit.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function describeExercise(exercise, uses) {
  const bits = [uses === 0 ? "never used" : `${uses} use${uses === 1 ? "" : "s"}`];
  bits.push(exercise.video_url ? "video linked" : "no video");
  return bits.join(" · ");
}

function Eyebrow({ children, style }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: "#a8a29e" }, style]}>{children}</Text>;
}

// Typeahead over the whole library. A plain <select> of 240 names is
// unusable mid-thought, which is the moment this page gets opened.
function ExercisePicker({ label, value, onChange, exercises, usage, exclude }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return exercises
      .filter((e) => e.id !== exclude && e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, exercises, exclude]);

  return (
    <View style={{ flex: 1, minWidth: 230 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginBottom: 6 }}>{label}</Text>
      {value ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 10,
            paddingVertical: 11,
            paddingHorizontal: 13,
          }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={1}>
            {value.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{usage[value.id] ?? 0} uses</Text>
          <Pressable
            onPress={() => {
              onChange(null);
              setQuery("");
            }}
            hitSlop={8}
          >
            <Text style={{ color: "#c9c4bd", fontSize: 13 }}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type a name…"
            style={{
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 10,
              paddingVertical: 11,
              paddingHorizontal: 13,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: "#2a211c",
            }}
          />
          {open && matches.length > 0 ? (
            <View
              style={{
                marginTop: 4,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {matches.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => {
                    onChange(e);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 9, paddingHorizontal: 12 }}
                >
                  <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: "#2a211c" }} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{usage[e.id] ?? 0}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SuggestionRow({ pair, usage, onMerge, onDismiss, busy, first }) {
  // Whichever entry carries more history survives — direction isn't a
  // choice a coach should have to think about when one has 156 uses and
  // the other has 3.
  const usesA = usage[pair.a.id] ?? 0;
  const usesB = usage[pair.b.id] ?? 0;
  const keep = usesA >= usesB ? pair.a : pair.b;
  const retire = keep === pair.a ? pair.b : pair.a;

  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: "#f4f1ec", paddingVertical: 14, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>{retire.name}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>
            {describeExercise(retire, usage[retire.id] ?? 0)}
          </Text>
        </View>
        <Text style={{ color: "#c9c4bd", fontSize: 14 }}>→</Text>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>{keep.name}</Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#4d6142", marginTop: 2 }}>
            {describeExercise(keep, usage[keep.id] ?? 0)} · kept
          </Text>
        </View>
        <PressFade
          onPress={() => onDismiss(pair)}
          style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: "#fff" }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c" }}>Not duplicates</Text>
        </PressFade>
        <Pressable
          onPress={busy ? undefined : () => onMerge(retire, keep)}
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 15, opacity: busy ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#fff" }}>Merge</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function MergeExercises() {
  const { profile } = useAuth();
  const router = useRouter();

  const [exercises, setExercises] = useState(null);
  const [usage, setUsage] = useState({});
  const [dismissals, setDismissals] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [retire, setRetire] = useState(null);
  const [keep, setKeep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rows, counts] = await Promise.all([listExercises(), listExerciseUsageCounts()]);
      setExercises(rows);
      setUsage(counts);
    } catch (err) {
      setLoadError(err.message ?? String(err));
      return;
    }
    // Isolated: an unrun 0053 leaves the page fully usable, it just can't
    // remember which pairs were already rejected.
    try {
      setDismissals(await listMergeDismissals());
    } catch {
      setDismissals([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dismissedKeys = useMemo(
    () => new Set(dismissals.map((d) => pairKey(d.exercise_a_id, d.exercise_b_id))),
    [dismissals]
  );

  const suggestions = useMemo(
    () => (exercises ? findDuplicateCandidates(exercises, dismissedKeys) : []),
    [exercises, dismissedKeys]
  );

  const byId = useMemo(() => Object.fromEntries((exercises ?? []).map((e) => [e.id, e])), [exercises]);

  const runMerge = async (retireExercise, keepExercise) => {
    const proceed = await confirmMergeExercises(retireExercise.name, keepExercise.name, usage[retireExercise.id] ?? 0);
    if (!proceed) return;
    setBusy(true);
    try {
      await mergeExercises(retireExercise.id, keepExercise.id);
      await load();
      setRetire(null);
      setKeep(null);
      toastSuccess(`Merged into ${keepExercise.name}`);
    } catch (err) {
      toastError("Couldn't merge", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async (pair) => {
    try {
      await dismissPair(pair.a.id, pair.b.id, profile?.id);
      await load();
    } catch (err) {
      toastError("Couldn't save that decision", err);
    }
  };

  const handleUndo = async (id) => {
    try {
      await undoDismissal(id);
      await load();
    } catch (err) {
      toastError("Couldn't undo", err);
    }
  };

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

  if (!exercises) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 5);

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 36, paddingVertical: 26 }}>
        <View style={{ maxWidth: 1100, width: "100%" }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/exercises"))}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite, marginBottom: 10 }}>
              ‹ Exercise Library
            </Text>
          </Pressable>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>Merge exercises</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 6, marginBottom: 20 }}>
            Merging moves every logged set and every programmed reference onto the entry you keep. Nothing is deleted.
          </Text>

          {/* Merge any two — the case the detector can't reach. */}
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 18, marginBottom: 24 }}>
            <Eyebrow style={{ marginBottom: 12 }}>MERGE ANY TWO</Eyebrow>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
              <ExercisePicker
                label="Retire this one"
                value={retire}
                onChange={setRetire}
                exercises={exercises}
                usage={usage}
                exclude={keep?.id}
              />
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e", paddingBottom: 13 }}>into</Text>
              <ExercisePicker
                label="Keep this one"
                value={keep}
                onChange={setKeep}
                exercises={exercises}
                usage={usage}
                exclude={retire?.id}
              />
              <Pressable
                onPress={retire && keep && !busy ? () => runMerge(retire, keep) : undefined}
                style={{
                  backgroundColor: retire && keep ? colors.primary : "#d6d1ca",
                  borderRadius: 9,
                  paddingVertical: 12,
                  paddingHorizontal: 22,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Merge</Text>
              </Pressable>
            </View>
            {retire && keep && (usage[retire.id] ?? 0) > (usage[keep.id] ?? 0) ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5a2e", marginTop: 10 }}>
                Heads up — {retire.name} has more history than {keep.name}. Merging this way moves the bigger history onto
                the smaller entry.
              </Text>
            ) : null}
          </View>

          {/* Suggestions */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <Eyebrow>SUGGESTED</Eyebrow>
              <View style={{ backgroundColor: "#f1efed", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#78716c" }}>{suggestions.length}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>Matched on name similarity only</Text>
          </View>

          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
            {suggestions.length === 0 ? (
              <View style={{ padding: 22 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>Nothing looks duplicated.</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
                  You can still merge any two entries with the picker above.
                </Text>
              </View>
            ) : (
              <>
                {visibleSuggestions.map((pair, i) => (
                  <SuggestionRow
                    key={pairKey(pair.a.id, pair.b.id)}
                    pair={pair}
                    usage={usage}
                    onMerge={runMerge}
                    onDismiss={handleDismiss}
                    busy={busy}
                    first={i === 0}
                  />
                ))}
                {suggestions.length > visibleSuggestions.length ? (
                  <Pressable onPress={() => setShowAllSuggestions(true)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
                    <Text style={{ textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                      {suggestions.length - visibleSuggestions.length} more suggestion
                      {suggestions.length - visibleSuggestions.length === 1 ? "" : "s"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          {/* Kept separate — a visible decision, not a silent disappearance. */}
          {dismissals.length > 0 ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <Eyebrow>KEPT SEPARATE</Eyebrow>
                  <View style={{ backgroundColor: "#f1efed", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#78716c" }}>{dismissals.length}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>Never suggested again unless you undo</Text>
              </View>
              <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, overflow: "hidden" }}>
                {dismissals.map((d, i) => {
                  const a = byId[d.exercise_a_id];
                  const b = byId[d.exercise_b_id];
                  return (
                    <View
                      key={d.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: "#f4f1ec",
                      }}
                    >
                      <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: "#44403c" }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#2a211c" }}>{a?.name ?? "Removed exercise"}</Text>
                        {" and "}
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#2a211c" }}>{b?.name ?? "Removed exercise"}</Text>
                      </Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                        kept {d.dismissed_at ? formatDateMD(dateInBoise(new Date(d.dismissed_at))) : "—"}
                      </Text>
                      <Pressable onPress={() => handleUndo(d.id)}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>Undo</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </CoachShell>
  );
}
