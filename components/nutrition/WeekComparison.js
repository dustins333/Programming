import { View, Text } from "react-native";
import { colorForTarget, colorForStepsTarget } from "../../lib/nutrition/weekCycle";
import { fonts } from "../../lib/theme";

const METRIC_ROWS = [
  { key: "protein_g", label: "Protein (g)", targetKey: "protein_g" },
  { key: "carb_g", label: "Carb (g)", targetKey: "carb_g" },
  { key: "fat_g", label: "Fat (g)", targetKey: "fat_g" },
  { key: "fiber_g", label: "Fiber (g)", targetKey: "fiber_g" },
  { key: "steps", label: "Steps", targetKey: "step_goal", oneSided: true },
  { key: "sleep_hours", label: "Sleep (hrs)", targetKey: "sleep_hours_goal" },
  { key: "weight", label: "Weight", targetKey: null },
];

const COLOR = { green: "#4d6142", red: "#b23a22" };

export function WeekComparison({ thisWeek, lastWeek, target }) {
  return (
    <View>
      {METRIC_ROWS.map((m) => {
        const actual = thisWeek.averages[m.key];
        const prior = lastWeek.averages[m.key];
        const targetValue = m.targetKey ? target?.[m.targetKey] : null;
        const color = m.oneSided ? colorForStepsTarget(actual, targetValue) : colorForTarget(actual, targetValue);
        return (
          <View key={m.key} className="flex-row items-center justify-between border-b border-stone-100 py-2">
            <Text style={{ fontFamily: fonts.sansMedium }}>{m.label}</Text>
            <View className="flex-row items-center gap-3">
              <Text style={{ fontFamily: fonts.sansMedium, color: color ? COLOR[color] : "#44403c" }}>
                {actual !== null && actual !== undefined ? actual.toFixed(1) : "–"}
              </Text>
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                (last week: {prior !== null && prior !== undefined ? prior.toFixed(1) : "–"})
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
