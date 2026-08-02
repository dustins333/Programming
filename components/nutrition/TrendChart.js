import { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { fonts } from "../../lib/theme";

const CHART_HEIGHT = 200;
const PADDING = { top: 16, bottom: 24, left: 8, right: 8 };

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

  const coords = valid.map((p, i) => ({
    x: PADDING.left + (valid.length === 1 ? plotWidth / 2 : (i / (valid.length - 1)) * plotWidth),
    y: PADDING.top + plotHeight - ((p.value - yMin) / (yMax - yMin)) * plotHeight,
    ...p,
  }));

  const active = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={CHART_HEIGHT - PADDING.bottom} stroke="#e7e5e4" strokeWidth={1} />
        <Line
          x1={PADDING.left}
          y1={CHART_HEIGHT - PADDING.bottom}
          x2={width - PADDING.right}
          y2={CHART_HEIGHT - PADDING.bottom}
          stroke="#e7e5e4"
          strokeWidth={1}
        />
        <SvgText x={PADDING.left} y={PADDING.top - 4} fontSize={10} fill="#a8a29e">
          {max.toFixed(1)}
        </SvgText>
        <SvgText x={PADDING.left} y={CHART_HEIGHT - PADDING.bottom + 16} fontSize={10} fill="#a8a29e">
          {min.toFixed(1)}
        </SvgText>
        <Polyline points={coords.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke="#a46a57" strokeWidth={2} />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={activeIndex === i ? 4 : 2.5} fill="#a46a57" onPress={() => setActiveIndex(i)} />
        ))}
        {active ? <Line x1={active.x} y1={PADDING.top} x2={active.x} y2={CHART_HEIGHT - PADDING.bottom} stroke="#d6d3d1" strokeWidth={1} /> : null}
      </Svg>
      {active ? (
        <Text className="text-center text-xs text-stone-600" style={{ fontFamily: fonts.sansMedium }}>
          {active.date}: {active.value.toFixed(1)}
        </Text>
      ) : (
        <Text className="text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          Tap a point to see its value
        </Text>
      )}
    </View>
  );
}
