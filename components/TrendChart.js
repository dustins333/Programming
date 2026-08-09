import { useState } from "react";
import { View, Text, Platform } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { formatDateMD, formatDateMDY } from "../lib/formatDate";
import { fonts } from "../lib/theme";

const isWeb = Platform.OS === "web";
const CHART_HEIGHT = 200;
const PADDING = { top: 16, bottom: 40, left: 8, right: 8 };
const MAX_LABELS = 5;

// Auto-scales the Y axis to the data's actual range (±20% pad, not anchored
// at 0) — same convention the standalone app's MetricChart.js uses, since a
// weight/sleep/steps trend line is more readable zoomed to its own range
// than dwarfed against a 0-anchored axis.
export function TrendChart({ points, width = 320 }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);

  if (valid.length === 0) {
    return (
      <View className="items-center justify-center py-10">
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
          Not enough data yet.
        </Text>
      </View>
    );
  }

  const values = valid.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padAmount = range * 0.2;
  const yMin = min - padAmount;
  const yMax = max + padAmount;

  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const axisY = PADDING.top + plotHeight;

  const coords = valid.map((p, i) => ({
    x: PADDING.left + (valid.length === 1 ? plotWidth / 2 : (i / (valid.length - 1)) * plotWidth),
    y: PADDING.top + plotHeight - ((p.value - yMin) / (yMax - yMin)) * plotHeight,
    ...p,
  }));

  // Evenly spaced date labels along the bottom — first, last, and up to 3
  // more in between, rather than one per point (would overlap for any real
  // date range).
  const labelCount = Math.min(MAX_LABELS, coords.length);
  const labelIndices = Array.from(new Set(
    Array.from({ length: labelCount }, (_, i) => Math.round((i / Math.max(1, labelCount - 1)) * (coords.length - 1)))
  ));

  const active = activeIndex !== null ? coords[activeIndex] : null;

  const nearestIndex = (offsetX) => {
    let closest = 0;
    let closestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - offsetX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  // Hover-to-inspect on web (tap-to-inspect on native, below). Deliberately
  // not using onPress on the individual Circles here — react-native-svg's
  // web build applies RN's touch-responder props (onResponderTerminate, etc)
  // to the underlying raw <circle> DOM node when a shape has onPress, which
  // React Native Web then logs as "Unknown event handler property" since
  // those aren't real DOM attributes. Tracking the pointer position against
  // the whole chart instead sidesteps that entirely.
  const webHandlers = isWeb
    ? {
        onMouseMove: (e) => setActiveIndex(nearestIndex(e.nativeEvent.offsetX)),
        onMouseLeave: () => setActiveIndex(null),
      }
    : {};

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT} {...webHandlers}>
        <Line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={axisY} stroke="#e7e5e4" strokeWidth={1} />
        <Line x1={PADDING.left} y1={axisY} x2={width - PADDING.right} y2={axisY} stroke="#e7e5e4" strokeWidth={1} />
        <SvgText x={PADDING.left} y={PADDING.top - 4} fontSize={10} fill="#a8a29e">
          {max.toFixed(1)}
        </SvgText>
        {/* Just above the axis, not below it — below collided with the
            first date label at the same y. */}
        <SvgText x={PADDING.left} y={axisY - 5} fontSize={10} fill="#a8a29e">
          {min.toFixed(1)}
        </SvgText>
        {labelIndices.map((i) => {
          const c = coords[i];
          const anchor = i === 0 ? "start" : i === coords.length - 1 ? "end" : "middle";
          return (
            <SvgText key={i} x={c.x} y={axisY + 16} fontSize={9.5} fill="#a8a29e" textAnchor={anchor}>
              {formatDateMD(c.date)}
            </SvgText>
          );
        })}
        <Polyline points={coords.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke="#a46a57" strokeWidth={2} />
        {coords.map((c, i) => (
          <Circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={activeIndex === i ? 4 : 2.5}
            fill="#a46a57"
            {...(isWeb ? {} : { onPress: () => setActiveIndex(i) })}
          />
        ))}
        {active ? <Line x1={active.x} y1={PADDING.top} x2={active.x} y2={axisY} stroke="#d6d3d1" strokeWidth={1} /> : null}
      </Svg>
      {active ? (
        <Text className="text-center text-xs text-stone-600" style={{ fontFamily: fonts.sansMedium }}>
          {formatDateMDY(active.date)}: {active.value.toFixed(1)}
        </Text>
      ) : (
        <Text className="text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {isWeb ? "Hover a point to see its value" : "Tap a point to see its value"}
        </Text>
      )}
    </View>
  );
}
