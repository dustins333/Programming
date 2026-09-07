import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, useWindowDimensions } from "react-native";
import { listLogsForDateRange } from "../../lib/nutrition/dailyLog";
import { addDays } from "../../lib/boiseDate";
import { TrendChart } from "../TrendChart";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { fonts, colors, type } from "../../lib/theme";

// The member's own weight trend, opened from two places that were each
// already showing a one-number version of exactly what it answers: Today's
// "▼ 1.2 vs last week" under the weight tile, and Weekly's "8-WK LB" stat in
// the averages band. Both of those numbers ARE the tap target, so neither
// screen needed a new button competing for space.
//
// Same ranges as the coach's dashboard chart deliberately, so a coach and a
// client talking about "the last three months" are looking at the same
// window. Default 1m, matching the coach's default too.
//
// It fetches its own logs rather than taking them as a prop: Weekly happens
// to have 200 loaded already and Today only has the last 8 days, and one
// bounded date query on open is both cheaper than adding a year of history to
// every Today load and identical from either door.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const PILL_TRACK = "#f1ede8";
const OLIVE = "#4d6142";
const CHART_MAX_WIDTH = 560;
const SHEET_PADDING = 20;

const RANGES = [
  { key: 7, label: "W", long: "the week" },
  { key: 30, label: "1m", long: "1m" },
  { key: 90, label: "3m", long: "3m" },
  { key: 180, label: "6m", long: "6m" },
  { key: 365, label: "1y", long: "1y" },
];
const MAX_RANGE = Math.max(...RANGES.map((r) => r.key));

export function WeightTrendSheet({ visible, onClose, userId, today, targetEffectiveDate = null }) {
  const { width: windowWidth } = useWindowDimensions();
  const [range, setRange] = useState(30);
  const [logs, setLogs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // One fetch at the widest range on open; changing the range filters what's
  // already here rather than going back to the server for a subset of it.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLogs(null);
    setLoadError(null);
    listLogsForDateRange(userId, addDays(today, -MAX_RANGE), today)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, userId, today, retryKey]);

  const cutoff = addDays(today, -range);
  const points = useMemo(() => {
    if (!logs) return [];
    return logs
      .filter((log) => log.date >= cutoff && log.weight !== null && log.weight !== undefined)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((log) => ({ date: log.date, value: Number(log.weight) }));
  }, [logs, cutoff]);

  const first = points.length > 0 ? points[0].value : null;
  const last = points.length > 0 ? points[points.length - 1].value : null;
  const change = first !== null && last !== null ? last - first : null;
  const rangeLong = RANGES.find((r) => r.key === range)?.long ?? "";
  const chartWidth = Math.min(windowWidth - SHEET_PADDING * 2, CHART_MAX_WIDTH);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            maxHeight: "82%",
            width: "100%",
            backgroundColor: CANVAS,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 10,
            paddingHorizontal: SHEET_PADDING,
            paddingBottom: 24,
            overflow: "hidden",
          }}
        >
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4", marginBottom: 14 }} />

          <View className="flex-row items-start justify-between" style={{ gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow>Weight trend</Eyebrow>
              <View className="flex-row flex-wrap items-baseline" style={{ gap: 8, marginTop: 4 }}>
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text }}>
                  {last !== null ? last.toFixed(1) : "–"}
                  <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}> lb</Text>
                </Text>
                {change !== null ? (
                  // Down is olive, up is neutral — never red. Same convention
                  // as the weight tile on Today, and for the same reason: not
                  // every member is trying to go down.
                  <Text
                    maxFontSizeMultiplier={1.15}
                    style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: change <= 0 ? OLIVE : "#78716c" }}
                  >
                    {change <= 0 ? "▼" : "▲"} {Math.abs(change).toFixed(1)} lb over {rangeLong}
                  </Text>
                ) : null}
              </View>
            </View>
            <PressFade
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close weight trend"
              style={{ minHeight: 44, justifyContent: "center", flexShrink: 0 }}
            >
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>
                Done
              </Text>
            </PressFade>
          </View>

          <View className="flex-row rounded-full p-1" style={{ backgroundColor: PILL_TRACK, marginBottom: 12 }}>
            {RANGES.map((r) => {
              const selected = range === r.key;
              return (
                <PressFade
                  key={r.key}
                  onPress={() => setRange(r.key)}
                  accessibilityLabel={`Show ${r.long}`}
                  pressedOpacity={0.6}
                  style={{
                    flex: 1,
                    borderRadius: 999,
                    paddingVertical: 7,
                    alignItems: "center",
                    backgroundColor: selected ? "#fff" : "transparent",
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.1}
                    style={{
                      fontFamily: selected ? fonts.sansSemiBold : fonts.sans,
                      fontSize: type.caption,
                      color: selected ? colors.text : colors.muted,
                    }}
                  >
                    {r.label}
                  </Text>
                </PressFade>
              );
            })}
          </View>

          {loadError ? (
            <View className="items-center py-10">
              <Text className="mb-3 text-center" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>
                Couldn't load your weigh-ins.
              </Text>
              <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
              </Pressable>
            </View>
          ) : !logs ? (
            // Reserves the chart's own height so the sheet doesn't jump when
            // the readings land.
            <View style={{ height: 274, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>Loading…</Text>
            </View>
          ) : (
            <View
              style={{
                alignSelf: "center",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                backgroundColor: "#fff",
                paddingVertical: 12,
              }}
            >
              <TrendChart
                points={points}
                width={chartWidth}
                height={240}
                unit="lb"
                readoutPlacement="above"
                sinceDate={targetEffectiveDate}
                emptyMessage="No weigh-ins in this range yet."
              />
            </View>
          )}

          {targetEffectiveDate && points.length > 0 ? (
            <Text
              maxFontSizeMultiplier={1.2}
              style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, textAlign: "center", marginTop: 10 }}
            >
              The clay stretch is since your current targets started.
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
