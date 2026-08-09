import { View, Text, useWindowDimensions } from "react-native";
import { TrendChart } from "./TrendChart";
import { formatDateMDY } from "../lib/formatDate";
import { fonts } from "../lib/theme";

// Turns a lift's raw per-set log rows (listLogsForExercise's shape:
// date_performed, set_number, reps, weight) into the "am I getting
// stronger" answer: top-set weight per date for the trend line, plus the
// single best set ever (heaviest weight; most reps breaks a tie).
export function computeLiftProgress(logs) {
  const topByDate = new Map();
  let best = null;
  for (const row of logs ?? []) {
    if (row.weight == null) continue;
    const current = topByDate.get(row.date_performed);
    if (current == null || row.weight > current) topByDate.set(row.date_performed, row.weight);
    if (
      !best ||
      row.weight > best.weight ||
      (row.weight === best.weight && (row.reps ?? 0) > (best.reps ?? 0))
    ) {
      best = { weight: row.weight, reps: row.reps, date: row.date_performed };
    }
  }
  const points = [...topByDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
  return { points, best };
}

// Chart + best-set line for one lift — shared by the History + chart modal
// (ExerciseHistoryModal) and My History's per-exercise screen. Renders
// nothing chart-wise until there are 2+ dates with a logged weight; the
// best-set line shows from the first weighted set.
export function LiftProgressSection({ logs }) {
  const { width: windowWidth } = useWindowDimensions();
  const { points, best } = computeLiftProgress(logs);
  if (!best) return null;

  const chartWidth = Math.min(windowWidth - 40, 560);

  return (
    <View className="mb-3">
      {best ? (
        <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#4d6142" }}>
          Best: {best.reps ?? "–"} reps @ {best.weight} ({formatDateMDY(best.date)})
        </Text>
      ) : null}
      {points.length >= 2 ? <TrendChart points={points} width={chartWidth} /> : null}
    </View>
  );
}
