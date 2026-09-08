import { View, Text, useWindowDimensions } from "react-native";
import { TrendChart } from "./TrendChart";
import { formatDateMDY } from "../lib/formatDate";
import { externalLoad, formatWeight } from "../lib/programming/setLabels";
import { fonts } from "../lib/theme";

// Turns a lift's raw per-set log rows (listLogsForExercise's shape:
// date_performed, set_number, reps, weight) into the "am I getting
// stronger" answer: top-set weight per date for the trend line, plus the
// single best set ever (heaviest weight; most reps breaks a tie).
export function computeLiftProgress(logs) {
  const topByDate = new Map();
  let best = null;
  for (const row of logs ?? []) {
    // Bodyweight is not a point on a weight-progress line — a stored 0 would
    // spike the chart to the floor on any lift she sometimes loads and
    // sometimes doesn't (Split Squat, across 23 clients as of 2026-09-08),
    // and would report a "best" of 0 lb on one she never loads at all. A
    // lift done only at bodyweight therefore draws no chart, exactly like a
    // reps-only lift; her progress on it is in the reps.
    const load = externalLoad(row);
    if (load == null) continue;
    const current = topByDate.get(row.date_performed);
    if (current == null || load > current) topByDate.set(row.date_performed, load);
    if (!best || load > best.weight || (load === best.weight && (row.reps ?? 0) > (best.reps ?? 0))) {
      best = { weight: load, reps: row.reps, date: row.date_performed };
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
// `width` overrides the window-derived default for a caller that renders
// this inside a narrower container than the page (the coach's per-lift
// history panel sits in a bordered card inside a column, not on the page).
export function LiftProgressSection({ logs, width }) {
  const { width: windowWidth } = useWindowDimensions();
  const { points, best } = computeLiftProgress(logs);
  if (!best) return null;

  const chartWidth = width ?? Math.min(windowWidth - 40, 560);

  return (
    <View className="mb-3">
      {best ? (
        <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#4d6142" }}>
          Best: {best.reps ?? "–"} reps @ {formatWeight(best.weight)} ({formatDateMDY(best.date)})
        </Text>
      ) : null}
      {points.length >= 2 ? <TrendChart points={points} width={chartWidth} unit="lb" /> : null}
    </View>
  );
}
