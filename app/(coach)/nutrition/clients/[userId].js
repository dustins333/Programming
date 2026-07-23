import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { todayInBoise } from "../../../../lib/boiseDate";
import { core } from "../../../../lib/supabase/client";
import { listTargets, createTarget, deriveCalories } from "../../../../lib/nutrition/targets";
import { listLogs } from "../../../../lib/nutrition/dailyLog";
import { getCheckinForWeek, finalizeCheckin, copyTemplateToClient } from "../../../../lib/nutrition/checkin";
import { computeWeekWindows, summarizeWeek, colorForTarget, colorForStepsTarget } from "../../../../lib/nutrition/weekCycle";
import { formatDateMDY } from "../../../../lib/formatDate";
import { fonts, colors } from "../../../../lib/theme";

const EMPTY_FORM = {
  protein_g: "",
  carb_g: "",
  fat_g: "",
  fiber_g: "",
  step_goal: "",
  sleep_hours_goal: "",
  note: "",
};

const METRIC_ROWS = [
  { key: "protein_g", label: "Protein (g)", targetKey: "protein_g" },
  { key: "carb_g", label: "Carb (g)", targetKey: "carb_g" },
  { key: "fat_g", label: "Fat (g)", targetKey: "fat_g" },
  { key: "fiber_g", label: "Fiber (g)", targetKey: "fiber_g" },
  { key: "steps", label: "Steps", targetKey: "step_goal", oneSided: true },
  { key: "sleep_hours", label: "Sleep (hrs)", targetKey: "sleep_hours_goal" },
  { key: "weight", label: "Weight", targetKey: null },
];

export default function NutritionClientDetail() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const today = todayInBoise();
  const { currentWeek, lastWeek } = computeWeekWindows(today);

  const [name, setName] = useState(null);
  const [targets, setTargets] = useState(null);
  const [logs, setLogs] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ data: user }, targetRows, logRows, checkinRow] = await Promise.all([
        core.from("users").select("name").eq("id", userId).single(),
        listTargets(userId),
        listLogs(userId),
        getCheckinForWeek(userId, currentWeek.start),
      ]);
      setName(user?.name ?? "Client");
      setTargets(targetRows);
      setLogs(logRows);
      setCheckin(checkinRow);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId, currentWeek.start]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateTarget = async () => {
    setSaving(true);
    try {
      await createTarget({
        userId,
        setBy: profile.id,
        proteinG: Number(form.protein_g),
        carbG: Number(form.carb_g),
        fatG: Number(form.fat_g),
        fiberG: Number(form.fiber_g),
        stepGoal: form.step_goal ? Number(form.step_goal) : null,
        sleepHoursGoal: form.sleep_hours_goal ? Number(form.sleep_hours_goal) : null,
        effectiveDate: today,
        note: form.note,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      Alert.alert("Failed to save target", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeCheckin = async () => {
    setFinalizing(true);
    try {
      await finalizeCheckin(userId, currentWeek.start);
      await load();
    } catch (err) {
      Alert.alert("Failed to finalize check-in", err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  const handleCopyQuestions = async () => {
    setCopying(true);
    try {
      await copyTemplateToClient(userId);
      Alert.alert("Done", "Check-in questions copied from the template.");
    } catch (err) {
      Alert.alert("Failed to copy questions", err.message ?? String(err));
    } finally {
      setCopying(false);
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading this client's nutrition data: {loadError}
        </Text>
      </View>
    );
  }

  if (!targets || !logs) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentTarget = targets[0] ?? null;
  const thisWeek = summarizeWeek(logs, currentWeek.start, currentWeek.end);
  const priorWeek = summarizeWeek(logs, lastWeek.start, lastWeek.end);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
        ‹ Back to Nutrition
      </Link>
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        {name}
      </Text>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Current target
      </Text>
      {currentTarget ? (
        <Text className="mb-6" style={{ fontFamily: fonts.sans }}>
          {Math.round(deriveCalories(currentTarget))} cal — P {currentTarget.protein_g}g / C {currentTarget.carb_g}g
          / F {currentTarget.fat_g}g / Fiber {currentTarget.fiber_g}g
          {currentTarget.step_goal ? ` · ${currentTarget.step_goal} steps` : ""}
        </Text>
      ) : (
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          No target set yet.
        </Text>
      )}

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Set new target
      </Text>
      <View className="mb-2 flex-row gap-3">
        <FormField
          label="Protein (g)"
          value={form.protein_g}
          onChangeText={(t) => setForm((f) => ({ ...f, protein_g: t }))}
        />
        <FormField
          label="Carb (g)"
          value={form.carb_g}
          onChangeText={(t) => setForm((f) => ({ ...f, carb_g: t }))}
        />
      </View>
      <View className="mb-2 flex-row gap-3">
        <FormField label="Fat (g)" value={form.fat_g} onChangeText={(t) => setForm((f) => ({ ...f, fat_g: t }))} />
        <FormField
          label="Fiber (g)"
          value={form.fiber_g}
          onChangeText={(t) => setForm((f) => ({ ...f, fiber_g: t }))}
        />
      </View>
      <View className="mb-2 flex-row gap-3">
        <FormField
          label="Step goal"
          value={form.step_goal}
          onChangeText={(t) => setForm((f) => ({ ...f, step_goal: t }))}
        />
        <FormField
          label="Sleep goal (hrs)"
          value={form.sleep_hours_goal}
          onChangeText={(t) => setForm((f) => ({ ...f, sleep_hours_goal: t }))}
        />
      </View>
      <TextInput
        value={form.note}
        onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
        placeholder="Note (what changed and why)…"
        className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      <Pressable
        onPress={handleCreateTarget}
        disabled={saving}
        className="mb-8 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
      >
        <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {saving ? "Saving…" : "Save New Target"}
        </Text>
      </Pressable>

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        This week vs. last week
      </Text>
      {METRIC_ROWS.map((m) => {
        const actual = thisWeek.averages[m.key];
        const prior = priorWeek.averages[m.key];
        const target = m.targetKey ? currentTarget?.[m.targetKey] : null;
        const color = m.oneSided ? colorForStepsTarget(actual, target) : colorForTarget(actual, target);
        return (
          <View key={m.key} className="mb-1 flex-row items-center justify-between border-b border-stone-100 py-2">
            <Text style={{ fontFamily: fonts.sansMedium }}>{m.label}</Text>
            <View className="flex-row items-center gap-3">
              <Text
                style={{ fontFamily: fonts.sansMedium }}
                className={color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : "text-stone-700"}
              >
                {actual !== null && actual !== undefined ? actual.toFixed(1) : "–"}
              </Text>
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                (last week: {prior !== null && prior !== undefined ? prior.toFixed(1) : "–"})
              </Text>
            </View>
          </View>
        );
      })}

      <View className="mb-2 mt-8 flex-row items-center justify-between">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
          This week's check-in
        </Text>
        <Pressable onPress={handleCopyQuestions} disabled={copying} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#8a5140" }}>
            {copying ? "Copying…" : "Copy questions from template"}
          </Text>
        </Pressable>
      </View>
      {checkin ? (
        <View>
          {checkin.answers.map((a, i) => (
            <View key={i} className="mb-3">
              <Text style={{ fontFamily: fonts.sansSemiBold }}>{a.question}</Text>
              <Text style={{ fontFamily: fonts.sans }}>{a.answer || "—"}</Text>
            </View>
          ))}
          <Pressable
            onPress={handleFinalizeCheckin}
            disabled={finalizing || !!checkin.finalized_at}
            className="mb-8 items-center rounded-lg border border-primary py-3 disabled:opacity-50"
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primary }}>
              {checkin.finalized_at ? "Finalized ✓" : finalizing ? "Finalizing…" : "Finalize Check-In"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text className="mb-8 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Not submitted yet this week.
        </Text>
      )}

      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Target history
      </Text>
      {targets.map((t) => (
        <View key={t.id} className="mb-2 rounded-lg border border-stone-200 px-4 py-3">
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Effective {formatDateMDY(t.effective_date)}
          </Text>
          <Text style={{ fontFamily: fonts.sans }}>
            P {t.protein_g} / C {t.carb_g} / F {t.fat_g} / Fiber {t.fiber_g}
          </Text>
          {t.note ? (
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              {t.note}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function FormField({ label, value, onChangeText }) {
  return (
    <View className="mb-2 flex-1">
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
