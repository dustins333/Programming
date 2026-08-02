import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { approveAndSetTargets } from "../../lib/nutrition/onboarding";
import { fonts, colors } from "../../lib/theme";

export function ApproveTargetsForm({ userId, coachId, baseline, onApproved }) {
  const [form, setForm] = useState({
    protein_g: baseline ? Math.round(baseline.protein).toString() : "",
    carb_g: baseline ? Math.round(baseline.carb).toString() : "",
    fat_g: baseline ? Math.round(baseline.fat).toString() : "",
    fiber_g: baseline ? Math.round(baseline.fiber).toString() : "",
    step_goal: "",
    sleep_hours_goal: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const protein = Number(form.protein_g) || 0;
  const carb = Number(form.carb_g) || 0;
  const fat = Number(form.fat_g) || 0;
  const calories = 4 * protein + 4 * carb + 9 * fat;
  const pct = (macroCalories) => (calories > 0 ? `${Math.round((macroCalories / calories) * 100)}%` : "—");

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const proteinG = Number(form.protein_g);
      const carbG = Number(form.carb_g);
      const fatG = Number(form.fat_g);
      const fiberG = Number(form.fiber_g);
      if ([proteinG, carbG, fatG, fiberG].some((n) => Number.isNaN(n) || n < 0)) {
        setError("Protein, carb, fat, and fiber must be valid numbers");
        return;
      }
      await approveAndSetTargets({
        userId,
        coachId,
        proteinG,
        carbG,
        fatG,
        fiberG,
        stepGoal: form.step_goal ? Number(form.step_goal) : null,
        sleepHoursGoal: form.sleep_hours_goal ? Number(form.sleep_hours_goal) : null,
        note: form.note,
      });
      await onApproved();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="rounded-lg border border-stone-200 p-4">
      <Text className="mb-3" style={{ fontFamily: fonts.sansBold }}>
        Approve & Set Targets
      </Text>
      <View className="mb-2 flex-row gap-3">
        <MacroField label="Protein (g)" value={form.protein_g} onChangeText={(t) => update("protein_g", t)} pct={pct(4 * protein)} />
        <MacroField label="Carb (g)" value={form.carb_g} onChangeText={(t) => update("carb_g", t)} pct={pct(4 * carb)} />
      </View>
      <View className="mb-2 flex-row gap-3">
        <MacroField label="Fat (g)" value={form.fat_g} onChangeText={(t) => update("fat_g", t)} pct={pct(9 * fat)} />
        <Field label="Fiber (g)" value={form.fiber_g} onChangeText={(t) => update("fiber_g", t)} />
      </View>
      <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Calories (derived): <Text style={{ fontFamily: fonts.sansMedium }}>{calories.toFixed(0)}</Text>
      </Text>

      <View className="mb-2 flex-row gap-3">
        <Field label="Step goal" value={form.step_goal} onChangeText={(t) => update("step_goal", t)} />
        <Field label="Sleep hours goal" value={form.sleep_hours_goal} onChangeText={(t) => update("sleep_hours_goal", t)} />
      </View>

      <TextInput
        value={form.note}
        onChangeText={(t) => update("note", t)}
        placeholder="e.g. 125/100/50 = 1450 to start, off baseline"
        className="mb-3 rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans }}
      />

      <Pressable onPress={handleSubmit} disabled={submitting} className="self-start rounded-lg px-4 py-2.5 disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
        <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {submitting ? "Approving…" : "Approve & Set Targets"}
        </Text>
      </Pressable>
      {error ? (
        <Text className="mt-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChangeText }) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        className="rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans }}
      />
    </View>
  );
}

function MacroField({ label, value, onChangeText, pct }) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <View className="flex-row items-center rounded border border-stone-300 px-3">
        <TextInput value={value} onChangeText={onChangeText} keyboardType="numeric" className="flex-1 py-2 text-sm" style={{ fontFamily: fonts.sans }} />
        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {pct}
        </Text>
      </View>
    </View>
  );
}
