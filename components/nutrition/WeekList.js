import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { colorForTarget, colorForStepsTarget } from "../../lib/nutrition/weekCycle";
import { addDays } from "../../lib/boiseDate";
import { formatDateMD } from "../../lib/formatDate";
import { fonts } from "../../lib/theme";

// Maps a metric column to the target row's matching field — steps is the
// only one-directional column (at/above goal is always green, below is
// always red); every other metric colors on a +/-10% band around its
// target. Mirrors the standalone app's WeekList.js exactly, since this is
// the one screen Terra asked to keep pixel-for-pixel faithful rather than
// restyled to Kova's house look.
const METRIC_COLUMNS = [
  { key: "weight", label: "Weight", width: 62, targetKey: null },
  { key: "protein_g", label: "Protein", width: 62, targetKey: "protein_g" },
  { key: "carb_g", label: "Carb", width: 58, targetKey: "carb_g" },
  { key: "fat_g", label: "Fat", width: 52, targetKey: "fat_g" },
  { key: "fiber_g", label: "Fiber", width: 52, targetKey: "fiber_g" },
  { key: "steps", label: "Steps", width: 72, targetKey: "step_goal" },
  { key: "sleep_hours", label: "Sleep", width: 56, targetKey: "sleep_hours_goal" },
  { key: "hunger", label: "Hunger", width: 56, targetKey: null },
  { key: "energy", label: "Energy", width: 56, targetKey: null },
];
const WEEK_COL_WIDTH = 150;
const NOTE_COL_WIDTH = 140;
const COLOR = { green: "#059669", red: "#dc2626" };

function fmt(v) {
  return v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10);
}

function weekRangeLabel(start, end) {
  return `${formatDateMD(start)}-${formatDateMD(end)}/${start.slice(2, 4)}`;
}

function dayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday}, ${formatDateMD(dateStr).replace(/^0/, "")}`;
}

function colorForColumn(key, actual, target) {
  return key === "steps" ? colorForStepsTarget(actual, target) : colorForTarget(actual, target);
}

// A single table (not one card per week) keeps every week's columns aligned
// with each other — per direct feedback that a stacked-card layout read as
// "all over the place." Clicking a week expands all 7 of its calendar days
// beneath it (not just logged ones, so a gap in logging is visible as blank
// cells rather than a missing row).
export function WeekList({ weeks }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const shown = weeks.filter((w) => w.summary.days.length > 0);

  if (shown.length === 0) {
    return (
      <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        No check-in weeks yet.
      </Text>
    );
  }

  const toggle = (weekStart) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  };

  const tableWidth = WEEK_COL_WIDTH + METRIC_COLUMNS.reduce((sum, c) => sum + c.width, 0) + NOTE_COL_WIDTH;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: tableWidth }}>
        <View className="flex-row border-b border-stone-200 pb-2">
          <Text style={{ width: WEEK_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Week</Text>
          {METRIC_COLUMNS.map((c) => (
            <Text key={c.key} style={{ width: c.width, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>
              {c.label}
            </Text>
          ))}
          <Text style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Note</Text>
        </View>

        {shown.map((week) => {
          const isOpen = expanded.has(week.start);
          const logByDate = Object.fromEntries(week.summary.days.map((d) => [d.date, d]));
          const allDates = [];
          for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
            allDates.push(d);
          }

          return (
            <View key={week.start}>
              <Pressable onPress={() => toggle(week.start)} className="flex-row items-center border-b border-stone-200 py-2">
                <View style={{ width: WEEK_COL_WIDTH }} className="flex-row items-center">
                  <Text style={{ color: "#a8a29e", fontSize: 11, width: 14 }}>{isOpen ? "▾" : "▸"}</Text>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>{weekRangeLabel(week.start, week.end)}</Text>
                </View>
                {METRIC_COLUMNS.map((c) => {
                  const target = c.targetKey ? week.target?.[c.targetKey] : null;
                  const color = colorForColumn(c.key, week.summary.averages[c.key], target);
                  return (
                    <Text key={c.key} style={{ width: c.width, fontFamily: fonts.sansSemiBold, fontSize: 13, color: color ? COLOR[color] : "#44403c" }}>
                      {fmt(week.summary.averages[c.key])}
                    </Text>
                  );
                })}
                <View style={{ width: NOTE_COL_WIDTH }} />
              </Pressable>

              {isOpen &&
                allDates.map((date) => {
                  const log = logByDate[date] ?? null;
                  return (
                    <View key={date} className="flex-row items-center border-b border-stone-100 py-1.5" style={{ backgroundColor: "#faf8f6" }}>
                      <Text style={{ width: WEEK_COL_WIDTH, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", paddingLeft: 14 }}>{dayLabel(date)}</Text>
                      {METRIC_COLUMNS.map((c) => (
                        <Text key={c.key} style={{ width: c.width, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                          {fmt(log?.[c.key])}
                        </Text>
                      ))}
                      <Text numberOfLines={1} style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                        {log?.client_note || "—"}
                      </Text>
                    </View>
                  );
                })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// design_handoff_v2_settings_nutrition's member Weekly tab wants the
// current week always shown day-by-day (no click-to-expand — it's the one
// week a member actually cares about seeing in full), separately from the
// "Prior weeks" table below it which keeps WeekList's collapsed/expandable
// rows. Reuses the exact same column set/coloring/day-label logic as
// WeekList's own expanded rows so the two tables read as one continuous
// column layout.
export function WeekDayTable({ week }) {
  const logByDate = Object.fromEntries(week.summary.days.map((d) => [d.date, d]));
  const allDates = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
    allDates.push(d);
  }
  const tableWidth = WEEK_COL_WIDTH + METRIC_COLUMNS.reduce((sum, c) => sum + c.width, 0) + NOTE_COL_WIDTH;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: tableWidth }}>
        <View className="flex-row border-b border-stone-200 pb-2">
          <Text style={{ width: WEEK_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Day</Text>
          {METRIC_COLUMNS.map((c) => (
            <Text key={c.key} style={{ width: c.width, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>
              {c.label}
            </Text>
          ))}
          <Text style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Note</Text>
        </View>
        {allDates.map((date) => {
          const log = logByDate[date] ?? null;
          return (
            <View key={date} className="flex-row items-center border-b border-stone-100 py-1.5">
              <Text style={{ width: WEEK_COL_WIDTH, fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>{dayLabel(date)}</Text>
              {METRIC_COLUMNS.map((c) => {
                const target = c.targetKey ? week.target?.[c.targetKey] : null;
                const color = colorForColumn(c.key, log?.[c.key], target);
                return (
                  <Text key={c.key} style={{ width: c.width, fontFamily: fonts.sans, fontSize: 12.5, color: color ? COLOR[color] : "#57534e" }}>
                    {fmt(log?.[c.key])}
                  </Text>
                );
              })}
              <Text numberOfLines={1} style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                {log?.client_note || "—"}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Computes the last `count` Monday-Sunday weeks (most recent first) —
// shared enumeration so the member and coach screens can't drift apart.
export function enumerateRecentWeeks(currentWeek, addDays, count) {
  return Array.from({ length: count }, (_, i) => {
    const end = addDays(currentWeek.end, -7 * i);
    const start = addDays(end, -6);
    return { start, end };
  });
}
