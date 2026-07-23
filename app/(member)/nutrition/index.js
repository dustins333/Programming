import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise } from "../../../lib/boiseDate";
import { getCurrentTarget, deriveCalories } from "../../../lib/nutrition/targets";
import { getLogForDate, saveDraftLog, finalizeLog } from "../../../lib/nutrition/dailyLog";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_SEGMENTS = [
  { key: "today", label: "Today", href: "/(member)/nutrition" },
  { key: "checkin", label: "Check-in", href: "/(member)/nutrition/checkin" },
  { key: "history", label: "History", href: "/(member)/nutrition/history" },
];

const AUTOSAVE_DELAY_MS = 900;

const EMPTY_VALUES = {
  weight: "",
  protein_g: "",
  carb_g: "",
  fat_g: "",
  fiber_g: "",
  steps: "",
  sleep_hours: "",
  sleep_quality: "",
  hunger: "",
  energy: "",
  client_note: "",
};

function toRowValues(log) {
  if (!log) return EMPTY_VALUES;
  const values = {};
  for (const key of Object.keys(EMPTY_VALUES)) {
    values[key] = log[key] === null || log[key] === undefined ? "" : String(log[key]);
  }
  return values;
}

export default function NutritionToday() {
  const { profile } = useAuth();
  const router = useRouter();
  const today = todayInBoise();
  const [target, setTarget] = useState(null);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [finalizedAt, setFinalizedAt] = useState(null);
  const [finalizeError, setFinalizeError] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const debounceRef = useRef(null);
  // The load effect below sets `values` from the server, which would
  // otherwise immediately re-trigger the autosave effect on first render —
  // this skips exactly that one load-triggered run, not any real edit.
  const skipAutosaveRef = useRef(true);

  useEffect(() => {
    (async () => {
      try {
        const [targetRow, log] = await Promise.all([
          getCurrentTarget(profile.id, today),
          getLogForDate(profile.id, today),
        ]);
        setTarget(targetRow);
        skipAutosaveRef.current = true;
        setValues(toRowValues(log));
        setFinalizedAt(log?.finalized_at ?? null);
        setReady(true);
      } catch (err) {
        setLoadError(err.message ?? String(err));
      }
    })();
  }, [profile.id, today]);

  useEffect(() => {
    if (!ready) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("pending");
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveDraftLog(profile.id, today, values);
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, ready]);

  const update = (field, text) => setValues((v) => ({ ...v, [field]: text }));

  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const result = await finalizeLog(profile.id, today, values);
      if (result.error) {
        setFinalizeError(result.error);
      } else {
        setFinalizedAt(result.data.finalized_at);
      }
    } catch (err) {
      Alert.alert("Failed to finalize", err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your nutrition data: {loadError}
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const calorieTarget = target ? Math.round(deriveCalories(target)) : null;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My Nutrition
      </Text>
      <Text className="mb-4 text-base text-stone-500" style={{ fontFamily: fonts.sans }}>
        {today}
      </Text>

      <SegmentedControl
        segments={NUTRITION_SEGMENTS}
        activeKey="today"
        onSelect={(key) => {
          const seg = NUTRITION_SEGMENTS.find((s) => s.key === key);
          if (seg && seg.key !== "today") router.push(seg.href);
        }}
      />

      {target ? (
        <View className="mb-6 rounded-lg border border-stone-200 px-4 py-3">
          <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold }}>
            Today's target
          </Text>
          <Text style={{ fontFamily: fonts.sans }}>
            {calorieTarget} cal — P {target.protein_g}g / C {target.carb_g}g / F {target.fat_g}g / Fiber{" "}
            {target.fiber_g}g
          </Text>
          {target.step_goal ? <Text style={{ fontFamily: fonts.sans }}>Steps: {target.step_goal}</Text> : null}
        </View>
      ) : (
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No target set yet — check with your coach.
        </Text>
      )}

      <FormField label="Weight" value={values.weight} onChangeText={(t) => update("weight", t)} />
      <View className="mb-2 flex-row gap-3">
        <FormField label="Protein (g)" value={values.protein_g} onChangeText={(t) => update("protein_g", t)} flex />
        <FormField label="Carb (g)" value={values.carb_g} onChangeText={(t) => update("carb_g", t)} flex />
      </View>
      <View className="mb-2 flex-row gap-3">
        <FormField label="Fat (g)" value={values.fat_g} onChangeText={(t) => update("fat_g", t)} flex />
        <FormField label="Fiber (g)" value={values.fiber_g} onChangeText={(t) => update("fiber_g", t)} flex />
      </View>
      <View className="mb-2 flex-row gap-3">
        <FormField label="Steps" value={values.steps} onChangeText={(t) => update("steps", t)} flex />
        <FormField
          label="Sleep (hrs)"
          value={values.sleep_hours}
          onChangeText={(t) => update("sleep_hours", t)}
          flex
        />
      </View>
      <View className="mb-2 flex-row gap-3">
        <FormField
          label="Sleep quality (1-5)"
          value={values.sleep_quality}
          onChangeText={(t) => update("sleep_quality", t)}
          flex
        />
        <FormField label="Hunger (1-5)" value={values.hunger} onChangeText={(t) => update("hunger", t)} flex />
        <FormField label="Energy (1-5)" value={values.energy} onChangeText={(t) => update("energy", t)} flex />
      </View>

      <Text className="mb-1 mt-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        Notes
      </Text>
      <TextInput
        value={values.client_note}
        onChangeText={(t) => update("client_note", t)}
        multiline
        className="mb-2 min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
        style={{ fontFamily: fonts.sans }}
      />

      <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        {saveState === "pending" && "Unsaved changes…"}
        {saveState === "saving" && "Saving…"}
        {saveState === "saved" && "All changes saved automatically."}
        {saveState === "error" && "Couldn't save — check your connection."}
      </Text>

      {finalizeError ? (
        <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
          {finalizeError}
        </Text>
      ) : null}

      <Pressable
        onPress={handleFinalize}
        disabled={finalizing}
        className="mb-6 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
      >
        <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {finalizing ? "Saving…" : finalizedAt ? "Day finalized ✓ (tap to re-finalize)" : "Finalize Day"}
        </Text>
      </Pressable>

    </ScrollView>
  );
}

function FormField({ label, value, onChangeText, flex }) {
  return (
    <View className={flex ? "mb-2 flex-1" : "mb-2"}>
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        className="rounded-lg border border-stone-300 px-4 py-3 text-base"
        style={{ fontFamily: fonts.sans }}
      />
    </View>
  );
}
