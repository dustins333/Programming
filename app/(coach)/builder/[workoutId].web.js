import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listExercises, createExercise, summarizeRepScheme } from "../../../lib/programming/exercises";
import {
  getWorkout,
  listWarmups,
  addWarmup,
  updateWarmup,
  removeWarmup,
  listWorkoutExercises,
  addWorkoutExercise,
  updateWorkoutExercise,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  getSiblingLifts,
  getSameSessionLastWeek,
  copyWorkoutContent,
  setWorkoutStatus,
  setWorkoutTitle,
} from "../../../lib/programming/workouts";
import { listWorkoutsForBlock } from "../../../lib/programming/blocks";
import { ExerciseFormModal } from "../../../components/ExerciseFormModal";
import { ExercisePickerModal } from "../../../components/ExercisePickerModal";
import { ExerciseLibrarySidebar } from "../../../components/ExerciseLibrarySidebar";
import { SessionPreviewModal } from "../../../components/SessionPreviewModal";
import { CommentThread } from "../../../components/CommentThread";
import { PressFade } from "../../../components/PressFade";
import { confirmOverwrite } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";

// Session builder, coach web (design_handoff_coach_web_v2, 1e).
//
// The whole session reads as one dense line per lift and only the lift
// you're touching expands — so the shape of the session stays visible
// while you edit a detail of it. That replaces the previous layout, where
// every lift was permanently expanded into a card of inputs and six lifts
// meant scrolling past forty form fields to see what you'd written.
//
// Rest is chips backed by plain seconds. The column stays `text` (it is on
// all four exercise tables, and a type change would have to reinterpret
// years of free-text values like "60-90s"), but everything this screen
// writes is now a canonical seconds string — which is exactly what the
// member app's rest timer parses. Legacy values keep working because
// parseRestSeconds already handles them.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const REST_CHIPS = [60, 90, 120, 180];

function formatRest(seconds) {
  if (seconds == null || seconds === "") return "—";
  const n = Number(String(seconds).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(seconds);
  // Coaches say "sixty" and "ninety", not "one minute" and "one thirty" —
  // so anything under two minutes stays in seconds, and only whole minutes
  // from 2:00 up get clock notation.
  if (n < 120 || n % 60 !== 0) return `${n}s`;
  return `${n / 60}:00`;
}

// "4 × 8,8,6,6" when the sets differ, "3 × 12" when they don't — the same
// summary the grid tiles and the member app show.
function schemeLabel(item) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? unique[0] || "—" : scheme.join(",")}`;
  }
  return `${item.sets ?? 0} × ${item.reps || "—"}`;
}

function Eyebrow({ children, style }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: "#a8a29e" }, style]}>{children}</Text>;
}

/* ------------------------------------------------------------- warm-up */

// A fixed 2×3 grid of six slots rather than a growing list — the coaching
// convention here is five or six movements, so the empty slots are the
// prompt and there's nothing to "add a row" to.
function WarmupGrid({ warmups, onChange, onRemove, onAdd }) {
  const slots = [...warmups];
  while (slots.length < 6) slots.push(null);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Eyebrow>WARM-UP · {warmups.length} OF 6</Eyebrow>
        {warmups.length < 6 ? (
          <Pressable onPress={onAdd}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {slots.slice(0, 6).map((w, i) =>
          w ? (
            <View
              key={w.id}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                minWidth: 240,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#c9c4bd", width: 12 }}>{i + 1}</Text>
              <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }} numberOfLines={1}>
                {w.exercises?.name ?? w.label ?? "Warm-up"}
              </Text>
              <TextInput
                value={w.sets ?? ""}
                onChangeText={(v) => onChange(w.id, { sets: v })}
                placeholder="2"
                style={{ width: 30, fontFamily: fonts.sans, fontSize: 12, color: "#57534e", textAlign: "right" }}
              />
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>×</Text>
              <TextInput
                value={w.reps ?? ""}
                onChangeText={(v) => onChange(w.id, { reps: v })}
                placeholder="10/side"
                style={{ width: 68, fontFamily: fonts.sans, fontSize: 12, color: "#57534e" }}
              />
              <Pressable onPress={() => onRemove(w.id)} hitSlop={8} accessibilityLabel={`Remove ${w.exercises?.name ?? "warm-up"}`}>
                <Text style={{ color: "#c9c4bd", fontSize: 13 }}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              key={`slot-${i}`}
              onPress={onAdd}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                minWidth: 240,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: "#ddd8d1",
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#d6d1ca", width: 12 }}>{i + 1}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#a8a29e" }}>+ Insert warm-up</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- lifts */

function SetTable({ item, onChange }) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : [item.reps ?? ""];
  const commit = (next) => onChange(item.id, { rep_scheme: next, sets: next.length, reps: summarizeRepScheme(next) });

  return (
    <View style={{ borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, overflow: "hidden", minWidth: 210 }}>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#faf8f6", paddingVertical: 7, paddingHorizontal: 11 }}>
        <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e" }}>SET</Text>
        <Text style={{ flex: 1.4, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e" }}>REPS</Text>
        <Pressable
          onPress={() => commit([...scheme, scheme[scheme.length - 1] ?? ""])}
          hitSlop={8}
          accessibilityLabel="Add a set"
          style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#fff", fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 15 }}>+</Text>
        </Pressable>
      </View>
      {scheme.map((reps, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>Set {i + 1}</Text>
          <TextInput
            value={reps ?? ""}
            onChangeText={(v) => commit(scheme.map((r, idx) => (idx === i ? v : r)))}
            placeholder="10"
            style={{ flex: 1.4, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c", paddingVertical: 9 }}
          />
          {scheme.length > 1 ? (
            <Pressable onPress={() => commit(scheme.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Remove set ${i + 1}`} style={{ width: 20 }}>
              <Text style={{ color: "#c9c4bd", fontSize: 12 }}>✕</Text>
            </Pressable>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>
      ))}
    </View>
  );
}

// Four digits, not a free string — a tempo is always four numbers and the
// old text field let "3-1-1-0", "3110" and "3/1/1/0" all mean the same thing.
function TempoDigits({ value, onChange }) {
  const digits = String(value ?? "").replace(/[^0-9xX]/g, "").padEnd(4, " ").slice(0, 4).split("");
  const set = (i, v) => {
    const next = [...digits];
    next[i] = (v.replace(/[^0-9xX]/g, "").slice(-1) || " ").toUpperCase();
    const joined = next.join("").trim();
    onChange(joined ? next.map((d) => (d === " " ? "0" : d)).join("-") : null);
  };
  return (
    <View style={{ flexDirection: "row", gap: 5 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          value={d.trim()}
          onChangeText={(v) => set(i, v)}
          maxLength={1}
          placeholder="–"
          style={{
            width: 30,
            height: 34,
            textAlign: "center",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 8,
            fontFamily: fonts.sansSemiBold,
            fontSize: 13,
            color: "#2a211c",
            backgroundColor: "#fff",
          }}
        />
      ))}
    </View>
  );
}

function RestChips({ value, onChange }) {
  const current = value == null || value === "" ? null : Number(String(value).replace(/[^0-9]/g, ""));
  const isCustom = current != null && !REST_CHIPS.includes(current);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {REST_CHIPS.map((n) => {
        const active = current === n;
        return (
          <Pressable
            key={n}
            onPress={() => {
              setCustomOpen(false);
              onChange(active ? null : String(n));
            }}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 13,
              borderRadius: 8,
              backgroundColor: active ? "#33251f" : "#fff",
              borderWidth: 1,
              borderColor: active ? "#33251f" : CARD_BORDER,
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "#f7f3ee" : "#57534e" }}>{formatRest(n)}</Text>
          </Pressable>
        );
      })}
      {customOpen || isCustom ? (
        <TextInput
          value={current != null && isCustom ? String(current) : ""}
          onChangeText={(v) => {
            const digits = v.replace(/[^0-9]/g, "");
            onChange(digits || null);
          }}
          placeholder="secs"
          keyboardType="number-pad"
          autoFocus={customOpen && !isCustom}
          style={{
            width: 66,
            paddingVertical: 7,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: "#fff",
            fontFamily: fonts.sansSemiBold,
            fontSize: 12,
            color: "#2a211c",
          }}
        />
      ) : (
        <Pressable
          onPress={() => setCustomOpen(true)}
          style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "#ddd8d1" }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>custom</Text>
        </Pressable>
      )}
    </View>
  );
}

function SortableLift({ item, index, expanded, onExpand, onChange, onRemove, onToggleSuperset, supersetLetter, linkedToNext }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const inSuperset = Boolean(item.superset_group_id);

  return (
    <div ref={setNodeRef} style={style}>
      <View
        style={{
          backgroundColor: inSuperset ? "#fdf6f2" : "#fff",
          borderWidth: expanded ? 0 : 1,
          borderColor: CARD_BORDER,
          borderTopWidth: index === 0 || expanded ? (expanded ? 0 : 1) : 0,
          borderRadius: expanded ? 12 : 0,
          borderLeftWidth: expanded ? 3 : inSuperset ? 3 : 1,
          borderLeftColor: expanded || inSuperset ? colors.primary : CARD_BORDER,
          marginBottom: expanded ? 8 : 0,
          overflow: "hidden",
          ...(expanded
            ? { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, borderWidth: 1, borderColor: CARD_BORDER }
            : null),
        }}
      >
        {/* The collapsed line. Everything about the lift, in one row. */}
        <Pressable
          onPress={() => onExpand(expanded ? null : item.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 }}
        >
          <div {...attributes} {...listeners} style={{ cursor: "grab", padding: 2, color: "#c9c4bd", fontSize: 13 }}>
            ⠿
          </div>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 99,
              backgroundColor: expanded ? colors.primary : "#f4f1ec",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: expanded ? "#fff" : "#a8a29e" }}>{index + 1}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }} numberOfLines={1}>
            {item.exercises?.name ?? "Unknown exercise"}
          </Text>

          {supersetLetter ? (
            <View style={{ backgroundColor: "#fdece5", borderRadius: 5, paddingVertical: 3, paddingHorizontal: 7 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.5, color: "#b23a22" }}>SS {supersetLetter}</Text>
            </View>
          ) : null}

          {expanded ? null : (
            <>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e", width: 130, textAlign: "right" }} numberOfLines={1}>
                {schemeLabel(item)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", width: 52, textAlign: "right" }}>
                {formatRest(item.rest)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", width: 62, textAlign: "right" }}>
                {item.tempo || "—"}
              </Text>
            </>
          )}

          {expanded && item.exercises?.video_url ? (
            <Pressable onPress={() => Linking.openURL(item.exercises.video_url)} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>▶ video</Text>
            </Pressable>
          ) : null}

          <Text style={{ color: "#c9c4bd", fontSize: 12, width: 14, textAlign: "center" }}>{expanded ? "⌃" : "⌄"}</Text>
        </Pressable>

        {expanded ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
            <View>
              <Eyebrow style={{ marginBottom: 7 }}>SETS</Eyebrow>
              <SetTable item={item} onChange={onChange} />
            </View>

            <View style={{ flex: 1, minWidth: 280 }}>
              <Eyebrow style={{ marginBottom: 7 }}>REST</Eyebrow>
              <RestChips value={item.rest} onChange={(v) => onChange(item.id, { rest: v })} />

              <View style={{ flexDirection: "row", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
                <View>
                  <Eyebrow style={{ marginBottom: 7 }}>TEMPO</Eyebrow>
                  <TempoDigits value={item.tempo} onChange={(v) => onChange(item.id, { tempo: v })} />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Eyebrow style={{ marginBottom: 7 }}>NOTE TO MEMBER</Eyebrow>
                  <TextInput
                    value={item.notes ?? ""}
                    onChangeText={(v) => onChange(item.id, { notes: v })}
                    placeholder="A cue she'll see under this lift…"
                    style={{
                      height: 34,
                      borderWidth: 1,
                      borderColor: CARD_BORDER,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      backgroundColor: "#fff",
                      fontFamily: fonts.sans,
                      fontSize: 12.5,
                      color: "#2a211c",
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14 }}>
                <Pressable onPress={() => onToggleSuperset(item)}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: inSuperset ? "#b23a22" : colors.primaryOnWhite }}>
                    {inSuperset ? "Break superset" : "Superset with the next lift"}
                  </Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => onRemove(item.id)}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22" }}>Remove lift</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </div>
  );
}

/* ----------------------------------------------------------- right rail */

function BalanceRail({ counts, note }) {
  const max = Math.max(1, ...Object.values(counts));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <View>
      <Eyebrow>BALANCE THIS WEEK</Eyebrow>
      <View style={{ marginTop: 10 }}>
        {entries.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Nothing tagged with a pattern yet.</Text>
        ) : (
          entries.map(([pattern, n]) => (
            <View key={pattern} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c", textTransform: "capitalize" }}>
                  {pattern.replace(/_/g, " ")}
                </Text>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#2a211c" }}>{n}</Text>
              </View>
              <View style={{ height: 5, borderRadius: 99, backgroundColor: "#ece7e1", overflow: "hidden" }}>
                <View style={{ width: `${(n / max) * 100}%`, height: 5, backgroundColor: n === max ? "#8a5140" : "#4d6142" }} />
              </View>
            </View>
          ))
        )}
      </View>
      {note ? (
        <View style={{ backgroundColor: "#fdf6f2", borderRadius: 10, padding: 12, marginTop: 4 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#8a5140", lineHeight: 17 }}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LastWeekRail({ lastWeek, onCopy, copying }) {
  if (!lastWeek) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <Eyebrow>SAME SESSION, LAST WEEK</Eyebrow>
      <View style={{ marginTop: 10, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 13, backgroundColor: "#fff" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c", marginBottom: 8 }}>
          Week {lastWeek.workout.week_number} · Session {lastWeek.workout.session_number}
        </Text>
        {lastWeek.lifts.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Nothing was written for it.</Text>
        ) : (
          lastWeek.lifts.map((l) => (
            <View key={l.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3 }}>
              <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, color: "#57534e" }} numberOfLines={1}>
                {l.exercises?.name ?? "Unknown"}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{schemeLabel(l)}</Text>
            </View>
          ))
        )}
        {lastWeek.lifts.length > 0 ? (
          <Pressable onPress={onCopy} disabled={copying} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
              {copying ? "Copying…" : "Copy into this session"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ page */

export default function WorkoutBuilderWeb() {
  const { workoutId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();

  const [workout, setWorkout] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [warmups, setWarmups] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [library, setLibrary] = useState([]);
  const [siblingLifts, setSiblingLifts] = useState([]);
  const [lastWeek, setLastWeek] = useState(null);
  const [blockWorkouts, setBlockWorkouts] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [newExerciseModalVisible, setNewExerciseModalVisible] = useState(false);
  const [warmupPickerVisible, setWarmupPickerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copyingLastWeek, setCopyingLastWeek] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const w = await getWorkout(workoutId);
      setWorkout(w);
      const [warmupRows, exerciseRows, libraryRows, siblings, allBlockWorkouts, previousWeek] = await Promise.all([
        listWarmups(workoutId),
        listWorkoutExercises(workoutId),
        listExercises(),
        getSiblingLifts(w.group_blocks.id, w.week_number, workoutId),
        listWorkoutsForBlock(w.group_blocks.id),
        getSameSessionLastWeek(w.group_blocks.id, w.week_number, w.session_number).catch(() => null),
      ]);
      setWarmups(warmupRows);
      setExercises(exerciseRows);
      setLibrary(libraryRows);
      setSiblingLifts(siblings);
      setBlockWorkouts(allBlockWorkouts);
      setLastWeek(previousWeek);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  // Every write on this screen is optimistic-then-persist, so the header's
  // "Saved" light is the only thing telling a coach the round trip landed.
  const track = (promise, message) => {
    setSaveState("saving");
    return promise
      .then(() => setSaveState("saved"))
      .catch((err) => {
        setSaveState("error");
        toastError(message, err);
      });
  };

  const handleInsertExercise = async (exercise) => {
    try {
      setSaveState("saving");
      const created = await addWorkoutExercise({ workoutId, exerciseId: exercise.id, position: exercises.length + 1 });
      setExercises((prev) => [...prev, created]);
      setExpandedId(created.id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add exercise", err);
    }
  };

  const handleExerciseChange = (id, fields) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    track(updateWorkoutExercise(id, fields), "Couldn't save change");
  };

  const handleRemoveExercise = async (id) => {
    const removed = exercises.find((e) => e.id === id);
    const removedIndex = exercises.findIndex((e) => e.id === id);
    setExercises((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      setSaveState("saving");
      await removeWorkoutExercise(id);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't remove exercise", err);
      if (removed) setExercises((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  // One tap now does both directions: link this lift to the next one, or
  // break whichever pairing it's already in. Single-owner semantics — no
  // triples, just clean re-pairing — same as before.
  const handleToggleSuperset = (item) => {
    if (item.superset_group_id) {
      const partner = exercises.find((e) => e.id !== item.id && e.superset_group_id === item.superset_group_id);
      setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === partner?.id ? { ...e, superset_group_id: null } : e)));
      track(
        Promise.all([
          updateWorkoutExercise(item.id, { superset_group_id: null }),
          partner ? updateWorkoutExercise(partner.id, { superset_group_id: null }) : Promise.resolve(),
        ]),
        "Couldn't unlink superset"
      );
      return;
    }
    const index = exercises.findIndex((e) => e.id === item.id);
    const next = exercises[index + 1];
    if (!next) {
      toastError("Nothing to superset with", "This is the last lift in the session");
      return;
    }
    const groupId = crypto.randomUUID();
    setExercises((prev) => prev.map((e) => (e.id === item.id || e.id === next.id ? { ...e, superset_group_id: groupId } : e)));
    track(
      Promise.all([
        updateWorkoutExercise(item.id, { superset_group_id: groupId }),
        updateWorkoutExercise(next.id, { superset_group_id: groupId }),
      ]),
      "Couldn't link superset"
    );
  };

  const handleNewExerciseCreated = async (form) => {
    try {
      const created = await createExercise({ ...form, createdBy: profile.id });
      setLibrary((prev) => [...prev, created]);
    } catch (err) {
      toastError("Failed to save exercise", err);
      throw err;
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(exercises, oldIndex, newIndex);
    setExercises(reordered);
    track(
      reorderWorkoutExercises(reordered.map((item, i) => ({ id: item.id, position: i + 1 }))),
      "Couldn't save reorder"
    );
  };

  const handleAddWarmup = async (exercise) => {
    try {
      setSaveState("saving");
      const created = await addWarmup({
        workoutId,
        exerciseId: exercise.id,
        position: warmups.length + 1,
        sets: exercise.default_sets != null ? String(exercise.default_sets) : undefined,
        reps: exercise.default_reps || undefined,
      });
      setWarmups((prev) => [...prev, created]);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toastError("Couldn't add warm-up", err);
    }
  };

  const handleWarmupChange = (id, fields) => {
    setWarmups((prev) => prev.map((w) => (w.id === id ? { ...w, ...fields } : w)));
    track(updateWarmup(id, fields), "Couldn't save change");
  };

  const handleRemoveWarmup = async (id) => {
    const removed = warmups.find((w) => w.id === id);
    const removedIndex = warmups.findIndex((w) => w.id === id);
    setWarmups((prev) => prev.filter((w) => w.id !== id));
    try {
      await removeWarmup(id);
    } catch (err) {
      toastError("Couldn't remove warm-up", err);
      if (removed) setWarmups((prev) => [...prev.slice(0, removedIndex), removed, ...prev.slice(removedIndex)]);
    }
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const next = workout.status === "published" ? "draft" : "published";
      await setWorkoutStatus(workoutId, next);
      setWorkout((w) => ({ ...w, status: next }));
      toastSuccess(next === "published" ? "Published — members can see it now" : "Unpublished");
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleTitleChange = (title) => {
    setWorkout((w) => ({ ...w, title }));
    track(setWorkoutTitle(workoutId, title), "Couldn't save title");
  };

  const handleCopyLastWeek = async () => {
    if (!lastWeek) return;
    if (exercises.length > 0 && !(await confirmOverwrite(1))) return;
    setCopyingLastWeek(true);
    try {
      await copyWorkoutContent(lastWeek.workout.id, workoutId);
      await load();
      toastSuccess("Copied last week's session in");
    } catch (err) {
      toastError("Couldn't copy last week", err);
    } finally {
      setCopyingLastWeek(false);
    }
  };

  // Superset pairs get a letter (A, B, …) in document order so the two
  // halves of a pairing are identifiable at a glance on the collapsed rows.
  const supersetLetters = useMemo(() => {
    const letters = {};
    let next = 0;
    for (const e of exercises) {
      if (!e.superset_group_id) continue;
      if (!(e.superset_group_id in letters)) {
        letters[e.superset_group_id] = String.fromCharCode(65 + next);
        next += 1;
      }
    }
    return letters;
  }, [exercises]);

  const patternCounts = useMemo(() => {
    const counts = {};
    const add = (patterns) => {
      for (const p of patterns ?? []) counts[p] = (counts[p] ?? 0) + 1;
    };
    for (const e of exercises) add(e.exercises?.movement_pattern);
    for (const s of siblingLifts) add(s.patterns);
    return counts;
  }, [exercises, siblingLifts]);

  const balanceNote = useMemo(() => {
    const entries = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
    if (entries.length < 2) return null;
    const [top, topCount] = entries[0];
    const rest = entries.slice(1).reduce((sum, [, n]) => sum + n, 0);
    if (topCount >= 4 && topCount > rest) {
      return `${top.replace(/_/g, " ")}-heavy this week — everything else adds up to ${rest}.`;
    }
    return null;
  }, [patternCounts]);

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
          Couldn't load this workout: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const idx = blockWorkouts.findIndex((w) => w.id === workout.id);
  const prev = idx > 0 ? blockWorkouts[idx - 1] : null;
  const next = idx >= 0 && idx < blockWorkouts.length - 1 ? blockWorkouts[idx + 1] : null;
  const published = workout.status === "published";

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: CANVAS }}>
        <ExerciseLibrarySidebar
          library={library}
          search={search}
          onSearchChange={setSearch}
          onNewExercise={() => setNewExerciseModalVisible(true)}
          onInsertLift={handleInsertExercise}
          onInsertWarmup={handleAddWarmup}
          onBack={() =>
            router.canGoBack() ? router.back() : router.push(`/(coach)/blocks?program=${workout.group_blocks.group_program_id}`)
          }
        />

        <View style={{ flex: 1 }}>
          {/* Header stays put while the session scrolls under it — the
              publish control and the where-am-I breadcrumb are needed at
              any scroll depth. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 26,
              paddingVertical: 14,
              backgroundColor: "#fff",
              borderBottomWidth: 1,
              borderBottomColor: CARD_BORDER,
            }}
          >
            <View style={{ minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                {workout.group_blocks.group_programs.name} · Block
              </Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>
                Week {workout.week_number}, Session {workout.session_number}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                [prev, "‹"],
                [next, "›"],
              ].map(([target, glyph]) => (
                <Pressable
                  key={glyph}
                  onPress={target ? () => router.push(`/(coach)/builder/${target.id}`) : undefined}
                  accessibilityLabel={glyph === "‹" ? "Previous session" : "Next session"}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: target ? 1 : 0.35,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#57534e" }}>{glyph}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  backgroundColor: saveState === "error" ? "#b23a22" : saveState === "saving" ? "#c58a3a" : "#4d6142",
                }}
              />
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                {saveState === "error" ? "Not saved" : saveState === "saving" ? "Saving…" : "Saved"}
              </Text>
            </View>

            <View style={{ backgroundColor: published ? "#e3ead9" : "#fdf6ec", borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: published ? "#4d6142" : "#8a6320" }}>
                {published ? "PUBLISHED" : "DRAFT"}
              </Text>
            </View>

            <PressFade
              onPress={() => setPreviewOpen(true)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: "#fff" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Preview</Text>
            </PressFade>
            <Pressable
              onPress={publishing ? undefined : handleTogglePublish}
              style={{ backgroundColor: published ? "#fff" : colors.primary, borderWidth: published ? 1 : 0, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 18, opacity: publishing ? 0.6 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: published ? "#44403c" : "#fff" }}>
                {published ? "Unpublish" : "Publish"}
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1, flexDirection: "row" }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingVertical: 22, paddingBottom: 60 }}>
              <TextInput
                value={workout.title ?? ""}
                onChangeText={handleTitleChange}
                placeholder="Name this session…"
                style={{
                  fontFamily: fonts.display,
                  fontSize: 26,
                  color: workout.title ? "#2a211c" : "#c9c4bd",
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#ece7e1",
                  marginBottom: 20,
                }}
              />

              <WarmupGrid
                warmups={warmups}
                onChange={handleWarmupChange}
                onRemove={handleRemoveWarmup}
                onAdd={() => setWarmupPickerVisible(true)}
              />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 9 }}>
                <Eyebrow>
                  MAIN SESSION · {exercises.length} LIFT{exercises.length === 1 ? "" : "S"}
                </Eyebrow>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9c4bd" }}>Click a lift to edit</Text>
              </View>

              <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, overflow: "hidden" }}>
                <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {exercises.length === 0 ? (
                    <View style={{ padding: 26 }}>
                      <Text style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
                        Click an exercise in the library to add it.
                      </Text>
                    </View>
                  ) : (
                    exercises.map((item, i) => (
                      <SortableLift
                        key={item.id}
                        item={item}
                        index={i}
                        expanded={expandedId === item.id}
                        onExpand={setExpandedId}
                        onChange={handleExerciseChange}
                        onRemove={handleRemoveExercise}
                        onToggleSuperset={handleToggleSuperset}
                        supersetLetter={item.superset_group_id ? supersetLetters[item.superset_group_id] : null}
                        linkedToNext={Boolean(
                          item.superset_group_id && item.superset_group_id === exercises[i + 1]?.superset_group_id
                        )}
                      />
                    ))
                  )}
                </SortableContext>
                <Pressable onPress={() => setExercisePickerVisible(true)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
                  <Text style={{ textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                    + Insert exercise
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

            <ScrollView
              style={{ width: 268, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: CARD_BORDER, backgroundColor: "#faf8f6" }}
              contentContainerStyle={{ padding: 18, flexGrow: 1 }}
            >
              <BalanceRail counts={patternCounts} note={balanceNote} />
              <LastWeekRail lastWeek={lastWeek} onCopy={handleCopyLastWeek} copying={copyingLastWeek} />
              {/* Not in the v2 mock, kept deliberately: block notes are
                  coach-to-coach and the native builder still shows them, so
                  dropping them here would mean a note written on a phone was
                  invisible on the platform the work actually happens on. */}
              <View style={{ marginTop: 26 }}>
                <CommentThread groupBlockId={workout.group_blocks.id} />
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      <ExerciseFormModal
        visible={newExerciseModalVisible}
        initialExercise={null}
        allExercises={library}
        onClose={() => setNewExerciseModalVisible(false)}
        onSubmit={handleNewExerciseCreated}
      />
      <ExercisePickerModal
        visible={warmupPickerVisible}
        library={library.filter((e) => e.type === "warmup")}
        onClose={() => setWarmupPickerVisible(false)}
        onPick={handleAddWarmup}
      />
      <ExercisePickerModal
        visible={exercisePickerVisible}
        library={library.filter((e) => e.type !== "warmup")}
        onClose={() => setExercisePickerVisible(false)}
        onPick={handleInsertExercise}
      />
      <SessionPreviewModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={workout.title || `Week ${workout.week_number}, Session ${workout.session_number}`}
        subtitle="Exactly what the member sees"
        warmups={warmups.map((w) => w.exercises?.name ?? w.label ?? "Warm-up")}
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.exercises?.name ?? "Exercise",
          detail: schemeLabel(e),
        }))}
      />
    </DndContext>
  );
}
