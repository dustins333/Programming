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

  return (
    <View>
      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
        Protein {baseline.protein.toFixed(0)}g ({baseline.proteinPct.toFixed(0)}%) · Carb {baseline.carb.toFixed(0)}g (
        {baseline.carbPct.toFixed(0)}%) · Fat {baseline.fat.toFixed(0)}g ({baseline.fatPct.toFixed(0)}%) · Fiber{" "}
        {baseline.fiber.toFixed(0)}g
      </Text>
      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
        Avg calories: {baseline.calories.toFixed(0)}
      </Text>
    </View>
  );
}
