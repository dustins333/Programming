import { useState } from "react";
import { View, Text, Platform } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { formatDateMD, formatDateMDY } from "../lib/formatDate";
import { fonts } from "../lib/theme";

const isWeb = Platform.OS === "web";
const DEFAULT_HEIGHT = 200;
const PADDING = { top: 16, bottom: 40, left: 8, right: 8 };
const MAX_LABELS = 5;
// Past this many readings the per-point dots stop being markers and become a
// solid bead of ink along the line. The line alone carries the shape at that
// density; the hovered point still gets its own dot.
const MAX_DOTS = 60;

const LINE = "#a46a57";
const LINE_BEFORE = "#d9d0c7";

// Auto-scales the Y axis to the data's actual range (±20% pad, not anchored
// at 0) — same convention the standalone app's MetricChart.js uses, since a
// weight/sleep/steps trend line is more readable zoomed to its own range
// than dwarfed against a 0-anchored axis.
//
// `sinceDate` splits the line in two: everything from that date on is clay,
// everything before it is a warm neutral. That's the current target's
// effective date on the nutrition dashboard — it says "this stretch is under
// the numbers she's on now" without needing a second legend. The two
// polylines share the boundary point, so the split is a colour change rather
// than a break.
//
// Note the dots sit on actual readings only, which is what keeps a line
// chart honest about gaps: a long straight run between two distant dots
// reads as two measurements, not as a fortnight of daily data.
export function TrendChart({
  points,
  width = 320,
  height = DEFAULT_HEIGHT,
  unit = "",
  sinceDate = null,
  emptyMessage = "Not enough data yet.",
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);

  if (valid.length === 0) {
    return (
      <View className="items-center justify-center" style={{ height: Math.min(height, 140) }}>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
          {emptyMessage}
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
  const plotHeight = height - PADDING.top - PADDING.bottom;
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

  // First reading on or after sinceDate. Everything from there on is the
  // current stretch; the segment before it includes that boundary point so
  // the two polylines meet rather than leaving a one-gap hole.
  const splitAt = sinceDate ? coords.findIndex((c) => c.date >= sinceDate) : -1;
  const hasSplit = splitAt > 0;
  const beforeCoords = hasSplit ? coords.slice(0, splitAt + 1) : [];
  const currentCoords = hasSplit ? coords.slice(splitAt) : coords;

  const showDots = coords.length <= MAX_DOTS;
  const active = activeIndex !== null && activeIndex < coords.length ? coords[activeIndex] : null;

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

  const asPoints = (list) => list.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <View>
      <Svg width={width} height={height} {...webHandlers}>
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
        {hasSplit ? <Polyline points={asPoints(beforeCoords)} fill="none" stroke={LINE_BEFORE} strokeWidth={2} /> : null}
        <Polyline points={asPoints(currentCoords)} fill="none" stroke={LINE} strokeWidth={2} />
        {showDots
          ? coords.map((c, i) => (
              <Circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={activeIndex === i ? 4 : 2.5}
                fill={hasSplit && i < splitAt ? LINE_BEFORE : LINE}
                {...(isWeb ? {} : { onPress: () => setActiveIndex(i) })}
              />
            ))
          : null}
        {/* At high density the dots are gone, so the hovered reading still
            needs one or there's nothing marking what the read-out refers to. */}
        {active && !showDots ? <Circle cx={active.x} cy={active.y} r={4} fill={LINE} /> : null}
        {active ? <Line x1={active.x} y1={PADDING.top} x2={active.x} y2={axisY} stroke="#d6d3d1" strokeWidth={1} /> : null}
      </Svg>
      {active ? (
        <Text className="text-center text-xs text-stone-600" style={{ fontFamily: fonts.sansMedium }}>
          {formatDateMDY(active.date)}: {active.value.toFixed(1)}
          {unit ? ` ${unit}` : ""}
        </Text>
      ) : (
        <Text className="text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {isWeb ? "Hover a point to see its value" : "Tap a point to see its value"}
        </Text>
      )}
    </View>
  );
}
