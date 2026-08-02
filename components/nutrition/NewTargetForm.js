import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { createTarget } from "../../lib/nutrition/targets";
import { todayInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

const EMPTY_FORM = { protein_g: "", carb_g: "", fat_g: "", fiber_g: "", step_goal: "", sleep_hours_goal: "", note: "" };

export function NewTargetForm({ userId, setBy, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
      Alert.alert("Failed to save target", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View className="mb-2 flex-row gap-3">
        <Field label="Protein (g)" value={form.protein_g} onChangeText={(t) => setForm((f) => ({ ...f, protein_g: t }))} />
        <Field label="Carb (g)" value={form.carb_g} onChangeText={(t) => setForm((f) => ({ ...f, carb_g: t }))} />
      </View>
      <View className="mb-2 flex-row gap-3">
        <Field label="Fat (g)" value={form.fat_g} onChangeText={(t) => setForm((f) => ({ ...f, fat_g: t }))} />
        <Field label="Fiber (g)" value={form.fiber_g} onChangeText={(t) => setForm((f) => ({ ...f, fiber_g: t }))} />
      </View>
      <View className="mb-2 flex-row gap-3">
        <Field label="Step goal" value={form.step_goal} onChangeText={(t) => setForm((f) => ({ ...f, step_goal: t }))} />
        <Field label="Sleep goal (hrs)" value={form.sleep_hours_goal} onChangeText={(t) => setForm((f) => ({ ...f, sleep_hours_goal: t }))} />
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

function Field({ label, value, onChangeText }) {
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
