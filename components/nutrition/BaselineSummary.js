import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

export function BaselineSummary({ baseline }) {
  if (!baseline) {
    return (
      <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        No Objective Tracking days logged yet.
      </Text>
    );
  }

  // computeBaseline returns null percentages when the tracked days average
  // to zero calories (nothing to take a percentage of) — rendering them at
  // all would be inventing a number, so the grams stand alone in that case.
  const pct = (value) => (value == null ? "" : ` (${value.toFixed(0)}%)`);

  return (
    <View>
      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
        Protein {baseline.protein.toFixed(0)}g{pct(baseline.proteinPct)} · Carb {baseline.carb.toFixed(0)}g
        {pct(baseline.carbPct)} · Fat {baseline.fat.toFixed(0)}g{pct(baseline.fatPct)} · Fiber{" "}
        {baseline.fiber.toFixed(0)}g
      </Text>
      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
        Avg calories: {baseline.calories.toFixed(0)}
      </Text>
    </View>
  );
}
