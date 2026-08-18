import { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { fonts } from "../../lib/theme";

// The four small trend tiles under the weight chart (coach web v2, screen
// 19): sleep, steps, hunger, energy. Latest reading big, the range's average
// beside it, and a sparkline underneath.
//
// The range label on each tile is a READ-OUT, not a control — one range
// picker above governs the weight chart and all four of these together
// (handoff data note 8). Four independent range pickers would let a coach
// compare a 7-day hunger average against a 3-month sleep average without
// noticing.
const LINE = "#c8b6ab";
const LATEST = "#a46a57";
const SPARK_HEIGHT = 26;
// Enough points to show a shape without turning into noise at 1y.
const MAX_POINTS = 40;
const STROKE = 1.75;
const DOT_R = 2.5;

function formatValue(value, digits, unit) {
  if (value === null || value === undefined) return "–";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const text = rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
  return `${text}${unit ?? ""}`;
}

// Evenly samples down to MAX_POINTS rather than truncating — a truncated
// series would silently show only the most recent slice while the tile's
// label still claimed the full range.
function sample(values) {
  if (values.length <= MAX_POINTS) return values;
  return Array.from({ length: MAX_POINTS }, (_, i) => values[Math.round((i / (MAX_POINTS - 1)) * (values.length - 1))]);
}

// Pure so it can be exercised without rendering. Inset on both axes by the
// widest thing drawn at the edge — the latest-reading dot, which sits on the
// final point, so an un-inset series has its right half cut off by the SVG
// bounds (measured: cx 140 with r 2.5 in a 140-wide box). The same inset
// vertically keeps the highest and lowest readings off the box edge.
export function sparkPoints(values, width, height) {
  const points = sample(values.filter((v) => v !== null && v !== undefined));
  if (points.length === 0 || width <= 0) return [];

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const usableWidth = Math.max(0, width - DOT_R * 2);
  const usableHeight = Math.max(0, height - DOT_R * 2);

  return points.map((value, i) => ({
    x: DOT_R + (points.length === 1 ? usableWidth / 2 : (i / (points.length - 1)) * usableWidth),
    y: DOT_R + usableHeight * (1 - (value - min) / range),
  }));
}

// `width` overrides measurement — onLayout is the production path, but
// ResizeObserver (which react-native-web implements onLayout with) doesn't
// fire in the sandboxed preview browser, so a forced width is the only way
// to actually look at this thing before shipping it.
function Sparkline({ values, width: forcedWidth }) {
  const [measured, setMeasured] = useState(0);
  const width = forcedWidth ?? measured;
  const coords = sparkPoints(values, width, SPARK_HEIGHT);
  const last = coords[coords.length - 1];

  return (
    <View
      style={{ height: SPARK_HEIGHT }}
      onLayout={forcedWidth ? undefined : (e) => setMeasured(e.nativeEvent.layout.width)}
    >
      {coords.length > 0 ? (
        <Svg width={width} height={SPARK_HEIGHT}>
          {/* A single reading has no line to draw — just the dot, rather
              than a degenerate one-point polyline that renders as nothing. */}
          {coords.length > 1 ? (
            <Polyline
              points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
              fill="none"
              stroke={LINE}
              strokeWidth={STROKE}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          <Circle cx={last.x} cy={last.y} r={DOT_R} fill={LATEST} />
        </Svg>
      ) : null}
    </View>
  );
}

export function MetricSparkTile({ label, rangeLabel, values, digits = 1, unit = "", sparkWidth }) {
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
      <Sparkline values={values} width={sparkWidth} />
    </View>
  );
}

export const SPARK_METRICS = [
  { key: "sleep_hours", label: "Sleep", digits: 1, unit: " h" },
  { key: "steps", label: "Steps", digits: 0, unit: "" },
  { key: "hunger", label: "Hunger", digits: 1, unit: " / 5" },
  { key: "energy", label: "Energy", digits: 1, unit: " / 5" },
];

export function MetricSparkTiles({ logs, rangeLabel, sparkWidth }) {
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
          sparkWidth={sparkWidth}
        />
      ))}
    </View>
  );
}
