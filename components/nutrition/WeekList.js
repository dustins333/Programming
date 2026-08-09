import { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { colorForTarget, colorForStepsTarget } from "../../lib/nutrition/weekCycle";
import { addDays } from "../../lib/boiseDate";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

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
// Tightened from 150 — the actual week-range/day-label text never got
// close to filling 150px, leaving a visible dead gap between the date
// column and Weight (the first metric column). 120 comfortably fits the
// longest real content ("▾ 07/28-08/03/26") with a little breathing room.
const WEEK_COL_WIDTH = 120;
const NOTE_COL_WIDTH = 140;
const COLOR = { green: "#059669", red: "#dc2626" };
// This table's columns are fixed-width and mirrors the standalone app's
// pixel layout by design (see the class comment above) — there's no room
// for Dynamic Type's default ~1.3x app-wide scale here, so every cell caps
// much tighter and truncates rather than wrapping into a neighboring column.
const TABLE_MAX_SCALE = 1.1;

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

// Notes are single-line/truncated in the table itself — some clients write a
// lot in there — but tapping one opens a popup with the full text rather
// than defaulting to always showing it in full (which would blow out every
// row's height). Non-interactive (no underline, no press) when there's
// nothing to expand.
function NoteCell({ note }) {
  const [open, setOpen] = useState(false);
  const hasNote = Boolean(note);
  return (
    <>
      <Pressable disabled={!hasNote} onPress={() => setOpen(true)} style={{ width: NOTE_COL_WIDTH }}>
        <Text
          maxFontSizeMultiplier={TABLE_MAX_SCALE}
          numberOfLines={1}
          style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", textDecorationLine: hasNote ? "underline" : "none" }}
        >
          {note || "—"}
        </Text>
      </Pressable>
      {hasNote ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-4">
              <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                Note
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c" }}>{note}</Text>
              <Pressable onPress={() => setOpen(false)} className="mt-4 self-end" hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

// A single table (not one card per week) keeps every week's columns aligned
// with each other — per direct feedback that a stacked-card layout read as
// "all over the place." Clicking a week expands all 7 of its calendar days
// beneath it (not just logged ones, so a gap in logging is visible as blank
// cells rather than a missing row).
export function WeekList({ weeks }) {
  const [expanded, setExpanded] = useState(() => new Set());
  // Weeks with no logs stay in the list as muted "no logs" rows — filtering
  // them out made a skipped week look like it never existed.
  const shown = weeks;
  const hasAnyLogs = weeks.some((w) => w.summary.days.length > 0);

  if (shown.length === 0 || !hasAnyLogs) {
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

  const metricsWidth = METRIC_COLUMNS.reduce((sum, c) => sum + c.width, 0) + NOTE_COL_WIDTH;

  // Flattened week+expanded-day rows, built once and shared by both the
  // frozen label column and the horizontally-scrolling metrics table below
  // — the two need to iterate in lockstep (same rows, same order) so a
  // week's collapse/expand state can't desync between the two sides.
  // Row keys are prefixed by type — a week's start date is also its first
  // expanded day's date, so a bare date string collides between the "week"
  // summary row and that day's own row (React's "two children with the same
  // key" warning, reproducible on every expand, not a data fluke).
  const rows = [];
  shown.forEach((week) => {
    rows.push({ type: "week", key: `week-${week.start}`, week, isOpen: expanded.has(week.start) });
    if (expanded.has(week.start)) {
      const logByDate = Object.fromEntries(week.summary.days.map((d) => [d.date, d]));
      for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
        rows.push({ type: "day", key: `day-${d}`, date: d, log: logByDate[d] ?? null });
      }
    }
  });

  return (
    <View className="flex-row">
      {/* Frozen date/week column — stays put while the metrics scroll
          horizontally, so it's always clear which row you're looking at. */}
      <View style={{ width: WEEK_COL_WIDTH }}>
        <View className="border-b border-stone-200 pb-2">
          <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Week</Text>
        </View>
        {rows.map((row) =>
          row.type === "week" ? (
            <Pressable key={row.key} onPress={() => toggle(row.week.start)} className="flex-row items-center border-b border-stone-200 py-2">
              <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} style={{ color: "#a8a29e", fontSize: 11, width: 14 }}>{row.isOpen ? "▾" : "▸"}</Text>
              <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, flexShrink: 1 }}>
                {weekRangeLabel(row.week.start, row.week.end)}
              </Text>
            </Pressable>
          ) : (
            <View key={row.key} className="border-b border-stone-100 py-1.5" style={{ backgroundColor: "#faf8f6" }}>
              <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", paddingLeft: 14 }}>
                {dayLabel(row.date)}
              </Text>
            </View>
          )
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: metricsWidth }}>
          <View className="flex-row border-b border-stone-200 pb-2">
            {METRIC_COLUMNS.map((c) => (
              <Text key={c.key} maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ width: c.width, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>
                {c.label}
              </Text>
            ))}
            <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Note</Text>
          </View>

          {rows.map((row) =>
            row.type === "week" ? (
              <Pressable key={row.key} onPress={() => toggle(row.week.start)} className="flex-row items-center border-b border-stone-200 py-2">
                {METRIC_COLUMNS.map((c) => {
                  const target = c.targetKey ? row.week.target?.[c.targetKey] : null;
                  const color = colorForColumn(c.key, row.week.summary.averages[c.key], target);
                  return (
                    <Text key={c.key} maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ width: c.width, fontFamily: fonts.sansSemiBold, fontSize: 13, color: color ? COLOR[color] : "#44403c" }}>
                      {fmt(row.week.summary.averages[c.key])}
                    </Text>
                  );
                })}
                <View style={{ width: NOTE_COL_WIDTH }} />
              </Pressable>
            ) : (
              <View key={row.key} className="flex-row items-center border-b border-stone-100 py-1.5" style={{ backgroundColor: "#faf8f6" }}>
                {METRIC_COLUMNS.map((c) => (
                  <Text key={c.key} maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ width: c.width, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                    {fmt(row.log?.[c.key])}
                  </Text>
                ))}
                <NoteCell note={row.log?.client_note} />
              </View>
            )
          )}
        </View>
      </ScrollView>
    </View>
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
  const metricsWidth = METRIC_COLUMNS.reduce((sum, c) => sum + c.width, 0) + NOTE_COL_WIDTH;

  return (
    <View className="flex-row">
      <View style={{ width: WEEK_COL_WIDTH }}>
        <View className="border-b border-stone-200 pb-2">
          <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Day</Text>
        </View>
        {allDates.map((date) => (
          <View key={date} className="border-b border-stone-100 py-1.5">
            <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>{dayLabel(date)}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: metricsWidth }}>
          <View className="flex-row border-b border-stone-200 pb-2">
            {METRIC_COLUMNS.map((c) => (
              <Text key={c.key} maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ width: c.width, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>
                {c.label}
              </Text>
            ))}
            <Text maxFontSizeMultiplier={TABLE_MAX_SCALE} style={{ width: NOTE_COL_WIDTH, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#a8a29e" }}>Note</Text>
          </View>
          {allDates.map((date) => {
            const log = logByDate[date] ?? null;
            return (
              <View key={date} className="flex-row items-center border-b border-stone-100 py-1.5">
                {METRIC_COLUMNS.map((c) => {
                  const target = c.targetKey ? week.target?.[c.targetKey] : null;
                  const color = colorForColumn(c.key, log?.[c.key], target);
                  return (
                    <Text key={c.key} maxFontSizeMultiplier={TABLE_MAX_SCALE} numberOfLines={1} style={{ width: c.width, fontFamily: fonts.sans, fontSize: 12.5, color: color ? COLOR[color] : "#57534e" }}>
                      {fmt(log?.[c.key])}
                    </Text>
                  );
                })}
                <NoteCell note={log?.client_note} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
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
