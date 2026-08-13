import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { toastError } from "../../lib/toast";
import { createTarget, deriveCalories } from "../../lib/nutrition/targets";
import { colorForTarget } from "../../lib/nutrition/weekCycle";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// The Targets tab (coach web v2, screen 24). Current numbers big and
// editable, each carrying how the last seven days actually landed against
// it, with the reason for the change captured next to them.
//
// Targets are insert-only versioned rows (see createTarget), so "editing"
// here writes a NEW row — the boxes are prefilled from the current one so a
// coach changing carbs alone doesn't have to retype the rest, and nothing
// that already happened is ever rewritten.
//
// Supersedes NewTargetForm, which this replaces on the tab. It also keeps
// the three fields the mock doesn't draw (fiber, steps, sleep) rather than
// dropping them — they're real target columns a coach sets, and losing them
// to a redesign that simply didn't picture them would be a regression.

const OK = "#4d6142";
const OFF = "#b23a22";

function nextMonday() {
  const today = todayInBoise();
  const dow = dayOfWeekInBoise(today); // 0=Sun..6=Sat
  return addDays(today, dow === 0 ? 1 : 8 - dow);
}

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

// How the last seven days landed against this number. Not an editorial
// judgement — just actual ÷ target, colored on the same ±10% band the Weeks
// table uses so the two can't disagree about what "on track" means.
function AdherenceBar({ actual, target }) {
  if (actual === null || actual === undefined || !target) {
    return (
      <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#c9c4bd", marginTop: 6 }}>
        no 7-day average yet
      </Text>
    );
  }
  const pct = Math.round((actual / target) * 100);
  const tone = colorForTarget(actual, target) === "green" ? OK : OFF;
  return (
    <View style={{ marginTop: 6 }}>
      <View className="flex-row items-baseline justify-between">
        <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>7-day avg</Text>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: tone }}>{pct}%</Text>
      </View>
      <View style={{ height: 4, borderRadius: 3, backgroundColor: "#f0ece6", marginTop: 3, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: 4, borderRadius: 3, backgroundColor: tone }} />
      </View>
    </View>
  );
}

function BigField({ label, unit, value, onChangeText, actual, target, readOnly, caption }) {
  return (
    <View style={{ flex: 1, minWidth: 132 }}>
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}
      >
        {label}
      </Text>
      <View
        className="flex-row items-center justify-between rounded-xl px-3.5"
        style={{ borderWidth: 1, borderColor: readOnly ? "#f0ece6" : "#ddd6cd", backgroundColor: readOnly ? "#faf8f6" : "white", height: 54 }}
      >
        {readOnly ? (
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 21, color: "#57534e" }}>
            {value}
          </Text>
        ) : (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor="#c9c4bd"
            maxFontSizeMultiplier={1.1}
            // minWidth:0 is load-bearing: react-native-web won't let an
            // <input> shrink below its intrinsic content width without it,
            // which shoves the unit out past the box's right edge. Same
            // failure the member v5 pass hit on the sleep tile's "hrs".
            style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 21, color: "#2a211c" }}
          />
        )}
        {unit ? <Text style={{ flexShrink: 0, marginLeft: 6, fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>{unit}</Text> : null}
      </View>
      {caption ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#c9c4bd", marginTop: 6 }}>{caption}</Text>
      ) : (
        <AdherenceBar actual={actual} target={target} />
      )}
    </View>
  );
}

export function TargetsEditor({ userId, setBy, currentTarget, recentAverages, setByName, unchangedWeeks, onSaved }) {
  const [form, setForm] = useState(() => formFromTarget(currentTarget));
  const [saving, setSaving] = useState(false);
  const [startNextWeek, setStartNextWeek] = useState(false);

  useEffect(() => {
    setForm(formFromTarget(currentTarget));
    setStartNextWeek(false);
  }, [currentTarget?.id]);

  const num = (key) => (form[key] === "" ? null : Number(form[key]));
  const calories = Math.round(deriveCalories({ protein_g: num("protein_g") ?? 0, carb_g: num("carb_g") ?? 0, fat_g: num("fat_g") ?? 0 }));
  const currentCalories = currentTarget ? Math.round(deriveCalories(currentTarget)) : null;

  const dirty =
    JSON.stringify({ ...formFromTarget(currentTarget), note: "" }) !== JSON.stringify({ ...form, note: "" }) || form.note.trim() !== "";

  const handleSave = async () => {
    if (num("protein_g") === null || num("carb_g") === null || num("fat_g") === null) {
      toastError("Protein, carbs and fat are all required", new Error("A blank macro would save as zero."));
      return;
    }
    setSaving(true);
    try {
      await createTarget({
        userId,
        setBy,
        proteinG: num("protein_g"),
        carbG: num("carb_g"),
        fatG: num("fat_g"),
        fiberG: num("fiber_g"),
        stepGoal: num("step_goal"),
        sleepHoursGoal: num("sleep_hours_goal"),
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
      <View className="mb-4 flex-row flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
        <Text
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Current targets
        </Text>
        {currentTarget ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
            Set {formatDateMDY(currentTarget.effective_date)}
            {setByName ? ` by ${setByName}` : ""}
            {unchangedWeeks !== null && unchangedWeeks !== undefined
              ? ` · unchanged for ${unchangedWeeks} week${unchangedWeeks === 1 ? "" : "s"}`
              : ""}
          </Text>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5a2e" }}>No target set yet — these will be her first.</Text>
        )}
      </View>

      <View className="mb-4 flex-row flex-wrap" style={{ gap: 14 }}>
        <BigField
          label="Protein"
          unit="g"
          value={form.protein_g}
          onChangeText={(t) => setForm((f) => ({ ...f, protein_g: t }))}
          actual={recentAverages?.protein_g ?? null}
          target={currentTarget?.protein_g ?? null}
        />
        <BigField
          label="Carbs"
          unit="g"
          value={form.carb_g}
          onChangeText={(t) => setForm((f) => ({ ...f, carb_g: t }))}
          actual={recentAverages?.carb_g ?? null}
          target={currentTarget?.carb_g ?? null}
        />
        <BigField
          label="Fat"
          unit="g"
          value={form.fat_g}
          onChangeText={(t) => setForm((f) => ({ ...f, fat_g: t }))}
          actual={recentAverages?.fat_g ?? null}
          target={currentTarget?.fat_g ?? null}
        />
        {/* Calories are never a stored column — always Atwater factors over
            the three macros above (see deriveCalories), so a coach can't
            enter a figure that contradicts the macros next to it. That also
            means the mock's "Recalculate calories from macros" button has no
            job here: this box already recalculates as you type. */}
        <BigField
          label="Calories"
          unit="kcal"
          value={calories >= 1000 ? calories.toLocaleString() : String(calories)}
          readOnly
          caption={
            currentCalories !== null && currentCalories !== calories
              ? `derived · was ${currentCalories >= 1000 ? currentCalories.toLocaleString() : currentCalories}`
              : "derived from the macros"
          }
        />
      </View>

      <View className="mb-4 flex-row flex-wrap" style={{ gap: 14 }}>
        <BigField
          label="Fiber"
          unit="g"
          value={form.fiber_g}
          onChangeText={(t) => setForm((f) => ({ ...f, fiber_g: t }))}
          actual={recentAverages?.fiber_g ?? null}
          target={currentTarget?.fiber_g ?? null}
        />
        <BigField
          label="Steps"
          unit=""
          value={form.step_goal}
          onChangeText={(t) => setForm((f) => ({ ...f, step_goal: t }))}
          actual={recentAverages?.steps ?? null}
          target={currentTarget?.step_goal ?? null}
        />
        <BigField
          label="Sleep"
          unit="h"
          value={form.sleep_hours_goal}
          onChangeText={(t) => setForm((f) => ({ ...f, sleep_hours_goal: t }))}
          actual={recentAverages?.sleep_hours ?? null}
          target={currentTarget?.sleep_hours_goal ?? null}
        />
        {/* An empty fourth slot. Both rows are four flex columns wide, so a
            field down here is exactly the width of one up there — three
            fields splitting the space four had made them visibly bigger than
            the macros, which are the more important numbers. */}
        <View style={{ flex: 1, minWidth: 132 }} />
      </View>

      <View className="mb-3">
        <Text
          className="mb-2"
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Why this change
        </Text>
        <TextInput
          value={form.note}
          onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
          placeholder="What changed and why"
          placeholderTextColor="#c9c4bd"
          multiline
          className="rounded-xl px-3.5 py-3"
          style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white", fontFamily: fonts.sans, fontSize: 13.5, minHeight: 74 }}
        />
      </View>

      <View className="mb-4 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>Starts</Text>
        {[
          { key: false, label: "Today" },
          { key: true, label: `Next Monday (${formatDateMDY(nextMonday())})` },
        ].map((opt) => (
          <Pressable
            key={String(opt.key)}
            onPress={() => setStartNextWeek(opt.key)}
            className="rounded-full border px-3 py-1.5"
            style={{ borderColor: startNextWeek === opt.key ? colors.primary : "#d6d3d1", backgroundColor: startNextWeek === opt.key ? "#fdf6f2" : "white" }}
          >
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: startNextWeek === opt.key ? colors.primaryOnWhite : "#57534e" }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row justify-end" style={{ gap: 10 }}>
        <Pressable
          onPress={() => {
            setForm(formFromTarget(currentTarget));
            setStartNextWeek(false);
          }}
          disabled={!dirty}
          className="rounded-lg border px-4 py-3"
          style={{ borderColor: "#d6d3d1", opacity: dirty ? 1 : 0.4 }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg px-5 py-3"
          style={{ backgroundColor: colors.primary, opacity: saving || !dirty ? 0.5 : 1 }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {saving ? "Saving…" : "Save targets"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
