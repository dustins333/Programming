import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

// The four small trend tiles under the weight chart (coach web v2, screen
// 19): sleep, steps, hunger, energy. Latest reading big, the range's average
// beside it, and a bar sparkline underneath.
//
// The range label on each tile is a READ-OUT, not a control — one range
// picker above governs the weight chart and all four of these together
// (handoff data note 8). Four independent range pickers would let a coach
// compare a 7-day hunger average against a 3-month sleep average without
// noticing.
const BAR = "#e7e0d8";
const BAR_LATEST = "#a46a57";
const SPARK_HEIGHT = 22;
// Enough bars to show a shape without turning into a solid block at 1y.
const MAX_BARS = 18;

function formatValue(value, digits, unit) {
  if (value === null || value === undefined) return "–";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const text = rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
  return `${text}${unit ?? ""}`;
}

// Evenly samples down to MAX_BARS rather than truncating — a truncated
// series would silently show only the most recent slice while the tile's
// label still claimed the full range.
function sample(values) {
  if (values.length <= MAX_BARS) return values;
  return Array.from({ length: MAX_BARS }, (_, i) => values[Math.round((i / (MAX_BARS - 1)) * (values.length - 1))]);
}

function Sparkline({ values }) {
  const points = sample(values.filter((v) => v !== null && v !== undefined));
  if (points.length === 0) return <View style={{ height: SPARK_HEIGHT }} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <View className="flex-row items-end" style={{ height: SPARK_HEIGHT, gap: 2 }}>
      {points.map((value, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            // A floor of 25% so the lowest reading in the range is still a
            // visible bar rather than a gap that reads as "no data".
            height: SPARK_HEIGHT * (0.25 + 0.75 * ((value - min) / range)),
            borderRadius: 2,
            backgroundColor: i === points.length - 1 ? BAR_LATEST : BAR,
          }}
        />
      ))}
    </View>
  );
}

export function MetricSparkTile({ label, rangeLabel, values, digits = 1, unit = "" }) {
  const present = values.filter((v) => v !== null && v !== undefined);
  const latest = present.length > 0 ? present[present.length - 1] : null;
  const average = present.length > 0 ? present.reduce((sum, v) => sum + v, 0) / present.length : null;

  return (
    <View
      className="rounded-xl px-3.5 py-3"
      style={{ flex: 1, minWidth: 150, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}
    >
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {label}
        </Text>
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 10, color: "#c9c4bd" }}>
          {rangeLabel}
        </Text>
      </View>
      <View className="mb-2 flex-row flex-wrap items-baseline" style={{ gap: 6 }}>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>
          {formatValue(latest, digits, unit)}
        </Text>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a46a57" }}>
          avg {formatValue(average, digits, unit)}
        </Text>
      </View>
      <Sparkline values={values} />
    </View>
  );
}

export const SPARK_METRICS = [
  { key: "sleep_hours", label: "Sleep", digits: 1, unit: " h" },
  { key: "steps", label: "Steps", digits: 0, unit: "" },
  { key: "hunger", label: "Hunger", digits: 1, unit: " / 5" },
  { key: "energy", label: "Energy", digits: 1, unit: " / 5" },
];

export function MetricSparkTiles({ logs, rangeLabel }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 12 }}>
      {SPARK_METRICS.map((metric) => (
        <MetricSparkTile
          key={metric.key}
          label={metric.label}
          rangeLabel={rangeLabel}
          values={logs.map((log) => log[metric.key])}
          digits={metric.digits}
          unit={metric.unit}
        />
      ))}
    </View>
  );
}
