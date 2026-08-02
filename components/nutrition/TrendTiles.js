import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

function fmt(n, digits = 0) {
  return n === null || n === undefined ? "—" : n.toFixed(digits);
}

export function TrendTiles({ thisWeek, lastWeek }) {
  const weightChange =
    thisWeek.averages.weight != null && lastWeek.averages.weight != null
      ? thisWeek.averages.weight - lastWeek.averages.weight
      : null;

  const tiles = [
    { label: "Weight change/week", value: weightChange == null ? "—" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)}` },
    { label: "Adherence", value: `${Math.round(thisWeek.adherence * 100)}%` },
    { label: "Avg steps", value: fmt(thisWeek.averages.steps) },
    { label: "Avg sleep", value: thisWeek.averages.sleep_hours != null ? `${thisWeek.averages.sleep_hours.toFixed(1)}h` : "—" },
    { label: "Avg hunger", value: fmt(thisWeek.averages.hunger, 1) },
    { label: "Avg energy", value: fmt(thisWeek.averages.energy, 1) },
  ];

  return (
    <View className="flex-row flex-wrap gap-2.5">
      {tiles.map((t) => (
        <View key={t.label} className="rounded-lg border border-stone-200 p-3" style={{ minWidth: 130, flexGrow: 1 }}>
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {t.label}
          </Text>
          <Text className="text-lg" style={{ fontFamily: fonts.sansSemiBold }}>
            {t.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
