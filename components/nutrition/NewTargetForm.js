import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { toastError } from "../../lib/toast";
import { createTarget } from "../../lib/nutrition/targets";
import { todayInBoise } from "../../lib/boiseDate";
import { TargetField } from "./TargetField";
import { fonts, colors } from "../../lib/theme";

const EMPTY_FORM = { protein_g: "", carb_g: "", fat_g: "", fiber_g: "", step_goal: "", sleep_hours_goal: "", note: "" };

export function NewTargetForm({ userId, setBy, currentTarget, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const protein = Number(form.protein_g) || 0;
  const carb = Number(form.carb_g) || 0;
  const fat = Number(form.fat_g) || 0;
  const calories = 4 * protein + 4 * carb + 9 * fat;
  const pct = (macroCalories) => (calories > 0 ? `${Math.round((macroCalories / calories) * 100)}%` : "—");

  const handleSave = async () => {
    setSaving(true);
    try {
      await createTarget({
        userId,
        setBy,
        proteinG: Number(form.protein_g),
        carbG: Number(form.carb_g),
        fatG: Number(form.fat_g),
        fiberG: Number(form.fiber_g),
        stepGoal: form.step_goal ? Number(form.step_goal) : null,
        sleepHoursGoal: form.sleep_hours_goal ? Number(form.sleep_hours_goal) : null,
        effectiveDate: todayInBoise(),
        note: form.note,
      });
      setForm(EMPTY_FORM);
      await onSaved();
    } catch (err) {
      toastError("Failed to save target", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View className="mb-2 flex-row gap-3">
        <TargetField label="Protein (g)" styleKey="protein" pillLabel="now" flex current={currentTarget?.protein_g} value={form.protein_g} onChangeText={(t) => setForm((f) => ({ ...f, protein_g: t }))} pct={pct(4 * protein)} />
        <TargetField label="Carb (g)" styleKey="carb" pillLabel="now" flex current={currentTarget?.carb_g} value={form.carb_g} onChangeText={(t) => setForm((f) => ({ ...f, carb_g: t }))} pct={pct(4 * carb)} />
      </View>
      <View className="mb-2 flex-row gap-3">
        <TargetField label="Fat (g)" styleKey="fat" pillLabel="now" flex current={currentTarget?.fat_g} value={form.fat_g} onChangeText={(t) => setForm((f) => ({ ...f, fat_g: t }))} pct={pct(9 * fat)} />
        <TargetField label="Fiber (g)" styleKey="fiber" pillLabel="now" flex current={currentTarget?.fiber_g} value={form.fiber_g} onChangeText={(t) => setForm((f) => ({ ...f, fiber_g: t }))} />
      </View>
      <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Calories (derived): <Text style={{ fontFamily: fonts.sansMedium }}>{calories.toFixed(0)}</Text>
      </Text>
      <View className="mb-2 flex-row gap-3">
        <TargetField label="Step goal" styleKey="steps" pillLabel="now" flex current={currentTarget?.step_goal} value={form.step_goal} onChangeText={(t) => setForm((f) => ({ ...f, step_goal: t }))} />
        <TargetField label="Sleep goal (hrs)" styleKey="sleep" pillLabel="now" flex current={currentTarget?.sleep_hours_goal} value={form.sleep_hours_goal} onChangeText={(t) => setForm((f) => ({ ...f, sleep_hours_goal: t }))} />
      </View>
      <TextInput
        value={form.note}
        onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
        placeholder="Note (what changed and why)…"
        className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      <Pressable onPress={handleSave} disabled={saving} className="items-center rounded-lg bg-primary py-3.5 disabled:opacity-50">
        <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {saving ? "Saving…" : "Save New Target"}
        </Text>
      </Pressable>
    </View>
  );
}
