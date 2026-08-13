import { useState } from "react";
import { View, Text, Platform } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { formatDateMD, formatDateMDY } from "../../lib/formatDate";
import { fonts } from "../../lib/theme";

const isWeb = Platform.OS === "web";
const PADDING = { top: 12, bottom: 26, left: 4, right: 4 };
const MAX_LABELS = 3;
const GAP_RATIO = 0.22;

const BAR = "#e7e0d8";
const BAR_CURRENT = "#a46a57";
const BAR_ACTIVE = "#2a211c";

// The weight chart on the client Dashboard (coach web v2, screen 19). Bars
// rather than the line TrendChart draws, and it stays bars deliberately:
// weigh-ins are discrete daily readings with real gaps in them, and a line
// interpolates straight through a missed day as though it were measured.
//
// Bars on or after `sinceDate` render in clay — that's the current target's
// effective date, so the chart says "this is the stretch under the numbers
// she's on now" without a second legend. Everything before it is the same
// warm neutral, present for shape but not competing.
//
// Y axis is scaled to the data's own range with a small pad, same reasoning
// as TrendChart: a body-weight series zoomed to 0 is a flat line.
export function WeightBarChart({ points, width = 640, height = 260, sinceDate = null, unit = "lb" }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);

  if (valid.length === 0) {
    return (
      <View className="items-center justify-center" style={{ height: 140 }}>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
          No weigh-ins in this range yet.
        </Text>
      </View>
    );
  }

  const values = valid.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // Bars grow from the bottom of the plot, so the baseline sits below the
  // lowest reading rather than at zero — otherwise every bar is the same
  // height to within a percent and the shape disappears.
  const yMin = min - range * 0.45;
  const yMax = max + range * 0.15;

  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const axisY = PADDING.top + plotHeight;

  const slot = plotWidth / valid.length;
  const barWidth = Math.max(3, slot * (1 - GAP_RATIO));

  const bars = valid.map((p, i) => {
    const x = PADDING.left + i * slot + (slot - barWidth) / 2;
    const y = PADDING.top + plotHeight - ((p.value - yMin) / (yMax - yMin)) * plotHeight;
    return { ...p, x, y, barHeight: Math.max(1, axisY - y), centerX: x + barWidth / 2 };
  });

  const labelCount = Math.min(MAX_LABELS, bars.length);
  const labelIndices = Array.from(
    new Set(Array.from({ length: labelCount }, (_, i) => Math.round((i / Math.max(1, labelCount - 1)) * (bars.length - 1))))
  );

  const active = activeIndex !== null && activeIndex < bars.length ? bars[activeIndex] : null;

  const nearestIndex = (offsetX) => {
    let closest = 0;
    let closestDist = Infinity;
    bars.forEach((b, i) => {
      const dist = Math.abs(b.centerX - offsetX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  // Same pointer-tracking-over-the-whole-chart approach TrendChart uses —
  // per-shape onPress makes react-native-svg's web build emit RN touch
  // responder props onto a raw <rect>, which React Native Web then warns
  // about as unknown DOM attributes.
  const webHandlers = isWeb
    ? {
        onMouseMove: (e) => setActiveIndex(nearestIndex(e.nativeEvent.offsetX)),
        onMouseLeave: () => setActiveIndex(null),
      }
    : {};

  return (
    <View>
      <Svg width={width} height={height} {...webHandlers}>
        {bars.map((b, i) => (
          <Rect
            key={b.date}
            x={b.x}
            y={b.y}
            width={barWidth}
            height={b.barHeight}
            rx={3}
            fill={activeIndex === i ? BAR_ACTIVE : sinceDate && b.date >= sinceDate ? BAR_CURRENT : BAR}
            {...(isWeb ? {} : { onPress: () => setActiveIndex(i) })}
          />
        ))}
        <Line x1={PADDING.left} y1={axisY} x2={width - PADDING.right} y2={axisY} stroke="#ece7e1" strokeWidth={1} />
        {labelIndices.map((i) => {
          const b = bars[i];
          const anchor = i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle";
          return (
            <SvgText key={b.date} x={b.centerX} y={axisY + 15} fontSize={10} fill="#a8a29e" textAnchor={anchor}>
              {formatDateMD(b.date)}
            </SvgText>
          );
        })}
      </Svg>
      {/* The read-out sits under the chart rather than floating over the
          bars — an absolutely-positioned tooltip would need a measured
          container to stay inside, and this never occludes the data. */}
      <Text
        className="text-center text-xs"
        style={{ fontFamily: active ? fonts.sansSemiBold : fonts.sans, color: active ? "#44403c" : "#a8a29e", marginTop: 2 }}
      >
        {active
          ? `${formatDateMDY(active.date)} · ${active.value.toFixed(1)} ${unit}`
          : isWeb
            ? "Hover a bar to see its date"
            : "Tap a bar to see its date"}
      </Text>
    </View>
  );
}
