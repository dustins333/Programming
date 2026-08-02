import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

// Port of the standalone app's MacroBubbles.js — color is fixed per macro
// type (always the same regardless of on-track/off-track), not a
// target-vs-actual comparison. Any value that's null/undefined is skipped.
const STYLES = {
  protein: { bg: "#eff6ff", text: "#1d4ed8" },
  carb: { bg: "#fffbeb", text: "#b45309" },
  fat: { bg: "#fff1f2", text: "#be123c" },
  fiber: { bg: "#ecfdf5", text: "#047857" },
  calories: { bg: "#f5f5f4", text: "#44403c" },
  steps: { bg: "#ecfeff", text: "#0e7490" },
  sleep: { bg: "#eef2ff", text: "#4338ca" },
};

function Pill({ styleKey, label, value, unit }) {
  if (value === null || value === undefined || value === "") return null;
  const s = STYLES[styleKey];
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: s.bg }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: s.text }}>{label}</Text>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: s.text }}>
        {value}
        {unit}
      </Text>
    </View>
  );
}

export function MacroPills({ protein, carb, fat, fiber, calories, steps, sleepHours }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <Pill styleKey="calories" label="Cal" value={calories} unit="" />
      <Pill styleKey="protein" label="P" value={protein} unit="g" />
      <Pill styleKey="carb" label="C" value={carb} unit="g" />
      <Pill styleKey="fat" label="F" value={fat} unit="g" />
      <Pill styleKey="fiber" label="Fiber" value={fiber} unit="g" />
      <Pill styleKey="steps" label="Steps" value={steps} unit="" />
      <Pill styleKey="sleep" label="Sleep" value={sleepHours} unit="h" />
    </View>
  );
}
