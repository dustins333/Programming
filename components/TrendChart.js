import { useRef, useState } from "react";
import { View, Text, Platform, PanResponder } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { formatDateMD, formatDateMDY } from "../lib/formatDate";
import { fonts, colors, type } from "../lib/theme";

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
//
// READING A VALUE is a thumb drag anywhere across the plot, not a hit on a
// dot. The dots are 2.5px; asking for one on a phone meant nobody could read
// this chart at all on the PWA, which is where everyone actually is. The
// pointer only ever has to land in the right COLUMN — nearestIndex snaps to
// the closest reading horizontally, so vertical accuracy is irrelevant and a
// sloppy drag still reads cleanly. Mouse hover is kept alongside it for the
// coach at a desk, who has a pointer and no reason to press first.
//
// `readoutPlacement="above"` puts the value over the chart instead of under
// it. On a phone the finger doing the scrubbing sits on the plot, and a
// read-out below the plot is under the hand that's driving it.
export function TrendChart({
  points,
  width = 320,
  height = DEFAULT_HEIGHT,
  unit = "",
  sinceDate = null,
  emptyMessage = "Not enough data yet.",
  readoutPlacement = "below",
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);

  // The responder is created once, so it can't close over this render's
  // coords — it reads them through a ref that's kept current instead.
  const coordsRef = useRef([]);
  const panRef = useRef(null);
  if (!panRef.current) {
    const setFromX = (x) => {
      const list = coordsRef.current;
      if (!list.length || x === undefined || x === null) return;
      let closest = 0;
      let closestDist = Infinity;
      list.forEach((c, i) => {
        const dist = Math.abs(c.x - x);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setActiveIndex(closest);
    };
    panRef.current = PanResponder.create({
      // Claim on touch-down so a plain tap reads a value with no drag, then
      // hand the gesture straight back if a parent scroller wants it — that
      // pair is what keeps the page scrollable when a finger happens to
      // start on the chart.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (evt) => setFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
      // Deliberately NOT cleared on release. She lifts her thumb to read the
      // value it was covering; clearing on release means the answer vanishes
      // at the exact moment the chart becomes visible again.
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    });
  }

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
  coordsRef.current = coords;

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

  // Hover-to-inspect for a mouse, on top of the drag handled above.
  // Deliberately not using onPress on the individual Circles here —
  // react-native-svg's web build applies RN's touch-responder props
  // (onResponderTerminate, etc) to the underlying raw <circle> DOM node when
  // a shape has onPress, which React Native Web then logs as "Unknown event
  // handler property" since those aren't real DOM attributes. Tracking the
  // pointer position against the whole chart instead sidesteps that entirely.
  //
  // offsetX has to be read off the <Svg> itself, not the wrapper: on web it's
  // relative to the DOM event's own target, and over a wrapper View that
  // target is whichever child sits under the pointer.
  const webHandlers = isWeb
    ? {
        onMouseMove: (e) => setActiveIndex(nearestIndex(e.nativeEvent.offsetX)),
        onMouseLeave: () => setActiveIndex(null),
      }
    : {};

  const asPoints = (list) => list.map((c) => `${c.x},${c.y}`).join(" ");

  const large = readoutPlacement === "above";
  const readout = large ? (
    // Fixed height so the chart doesn't shift when the hint swaps for a value.
    <View style={{ height: 34, justifyContent: "center", marginBottom: 4 }}>
      {active ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>
            {active.value.toFixed(1)}
            {unit ? <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}> {unit}</Text> : null}
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: colors.muted }}>
            {formatDateMDY(active.date)}
          </Text>
        </View>
      ) : (
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}
        >
          Drag across the line to read any day
        </Text>
      )}
    </View>
  ) : active ? (
    <Text className="text-center text-xs text-stone-600" style={{ fontFamily: fonts.sansMedium }}>
      {formatDateMDY(active.date)}: {active.value.toFixed(1)}
      {unit ? ` ${unit}` : ""}
    </Text>
  ) : (
    <Text className="text-center text-xs" style={{ fontFamily: fonts.sans, color: colors.muted }}>
      Drag across the line to read any day
    </Text>
  );

  return (
    <View>
      {large ? readout : null}
      <View
        {...panRef.current.panHandlers}
        style={{
          width,
          // pan-y hands vertical scrolling back to the browser so the page
          // still moves when a drag starts on the chart; userSelect stops a
          // horizontal drag turning into a text selection.
          ...(isWeb ? { touchAction: "pan-y", userSelect: "none" } : null),
        }}
      >
        <Svg width={width} height={height} {...webHandlers}>
          <Line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={axisY} stroke="#e7e5e4" strokeWidth={1} />
          <Line x1={PADDING.left} y1={axisY} x2={width - PADDING.right} y2={axisY} stroke="#e7e5e4" strokeWidth={1} />
          <SvgText x={PADDING.left} y={PADDING.top - 4} fontSize={11} fill="#6f6862">
            {max.toFixed(1)}
          </SvgText>
          {/* Just above the axis, not below it — below collided with the
              first date label at the same y. */}
          <SvgText x={PADDING.left} y={axisY - 5} fontSize={11} fill="#6f6862">
            {min.toFixed(1)}
          </SvgText>
          {labelIndices.map((i) => {
            const c = coords[i];
            const anchor = i === 0 ? "start" : i === coords.length - 1 ? "end" : "middle";
            return (
              <SvgText key={i} x={c.x} y={axisY + 16} fontSize={11} fill="#6f6862" textAnchor={anchor}>
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
                  r={activeIndex === i ? 5 : 2.5}
                  fill={hasSplit && i < splitAt ? LINE_BEFORE : LINE}
                />
              ))
            : null}
          {/* At high density the dots are gone, so the hovered reading still
              needs one or there's nothing marking what the read-out refers to. */}
          {active && !showDots ? <Circle cx={active.x} cy={active.y} r={5} fill={LINE} /> : null}
          {active ? <Line x1={active.x} y1={PADDING.top} x2={active.x} y2={axisY} stroke="#d6d3d1" strokeWidth={1} /> : null}
        </Svg>
      </View>
      {large ? null : readout}
    </View>
  );
}
