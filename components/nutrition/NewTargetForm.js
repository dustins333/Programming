import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { toastError } from "../../lib/toast";
import { createTarget, deriveCalories } from "../../lib/nutrition/targets";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { TargetField } from "./TargetField";
import { fonts } from "../../lib/theme";

// Next Monday (the start of the next check-in cycle) — getCurrentTarget
// fully supports future-dated rows, there was just never a way to pick one.
function nextMonday() {
  const today = todayInBoise();
  const dow = dayOfWeekInBoise(today); // 0=Sun..6=Sat
  return addDays(today, dow === 0 ? 1 : 8 - dow);
}

// Prefilled from the current target, not blank — targets are insert-only
// versioned rows, so "change only protein" used to require retyping every
// field, and a macro left blank silently saved as 0.
function formFromTarget(t) {
  const s = (v) => (v == null ? "" : String(v));
  return {
    protein_g: s(t?.protein_g),
    carb_g: s(t?.carb_g),
    fat_g: s(t?.fat_g),
    fiber_g: s(t?.fiber_g),
    step_goal: s(t?.step_goal),
    sleep_hours_goal: s(t?.sleep_hours_goal),
    note: "",
  };
}

export function NewTargetForm({ userId, setBy, currentTarget, recentAverages, onSaved }) {
  const [form, setForm] = useState(() => formFromTarget(currentTarget));
  const [saving, setSaving] = useState(false);
  const [startNextWeek, setStartNextWeek] = useState(false);

  // Re-prefill when the current target changes identity — covers a late
  // async load and the post-save reload (the freshly-saved target becomes
  // the new baseline).
  useEffect(() => {
    setForm(formFromTarget(currentTarget));
  }, [currentTarget?.id]);

  const protein = Number(form.protein_g) || 0;
  const carb = Number(form.carb_g) || 0;
  const fat = Number(form.fat_g) || 0;
  const calories = deriveCalories({ protein_g: protein, carb_g: carb, fat_g: fat });
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
        effectiveDate: startNextWeek ? nextMonday() : todayInBoise(),
        note: form.note,
      });
      await onSaved();
    } catch (err) {
      toastError("Failed to save target", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      {recentAverages ? (
        <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Actual this week — P {recentAverages.protein_g != null ? Math.round(recentAverages.protein_g) : "—"} · C{" "}
          {recentAverages.carb_g != null ? Math.round(recentAverages.carb_g) : "—"} · F{" "}
          {recentAverages.fat_g != null ? Math.round(recentAverages.fat_g) : "—"} · Fiber{" "}
          {recentAverages.fiber_g != null ? Math.round(recentAverages.fiber_g) : "—"}
        </Text>
      ) : null}
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
      <View className="mb-3 flex-row items-center gap-2">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          Starts:
        </Text>
        {[
          { key: false, label: "Today" },
          { key: true, label: `Next week (${formatDateMDY(nextMonday())})` },
        ].map((opt) => (
          <Pressable
            key={String(opt.key)}
            onPress={() => setStartNextWeek(opt.key)}
            className="rounded-full border px-3 py-1.5"
            style={{ borderColor: startNextWeek === opt.key ? "#a46a57" : "#d6d3d1", backgroundColor: startNextWeek === opt.key ? "#fdf6f2" : "white" }}
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: startNextWeek === opt.key ? "#8a5140" : "#57534e" }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={handleSave} disabled={saving} className="items-center rounded-lg bg-primary py-3.5 disabled:opacity-50">
        <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {saving ? "Saving…" : "Save New Target"}
        </Text>
      </Pressable>
    </View>
  );
}
