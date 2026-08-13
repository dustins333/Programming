import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colorForTarget, colorForStepsTarget } from "../../lib/nutrition/weekCycle";
import { deriveCalories } from "../../lib/nutrition/targets";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// The Weeks tab (coach web v2, screen 20): one row per week, opening into
// its seven days. Replaces the flat metric grid on this tab — a coach
// scanning eleven weeks wants the shape of each week, not 77 cells at once,
// and the day-level numbers are what she opens a week to see.
//
// Supersedes the old flat metric grid. Its enumerateRecentWeeks helper
// moved to lib/nutrition/weekCycle.js, beside its forward counterpart.

const OK = "#4d6142";
const OFF = "#b23a22";
const MUTED = "#a8a29e";

const MACRO_BARS = [
  { key: "protein_g", short: "P", targetKey: "protein_g" },
  { key: "carb_g", short: "C", targetKey: "carb_g" },
  { key: "fat_g", short: "F", targetKey: "fat_g" },
  { key: "calories", short: "kcal", targetKey: "calories" },
];

// Columns FLEX rather than sitting at a fixed width — the expanded day table
// is inside the same card as the week's target bars above it, and a
// fixed-width table left a growing gap down the right-hand side as the card
// widened. `min` is the wrap/scroll floor, not the width.
const DAY_COLUMNS = [
  { key: "weight", label: "Weight", min: 54, flex: 1.1, digits: 1 },
  { key: "protein_g", label: "Prot", min: 44, flex: 0.95, digits: 0, targetKey: "protein_g" },
  { key: "carb_g", label: "Carb", min: 44, flex: 0.95, digits: 0, targetKey: "carb_g" },
  { key: "fat_g", label: "Fat", min: 40, flex: 0.85, digits: 0, targetKey: "fat_g" },
  { key: "calories", label: "Kcal", min: 50, flex: 1, digits: 0 },
  { key: "sleep_hours", label: "Sleep", min: 46, flex: 0.95, digits: 1, targetKey: "sleep_hours_goal", suffix: " h" },
  { key: "sleep_quality", label: "Quality", min: 48, flex: 0.95, digits: 1 },
  { key: "steps", label: "Steps", min: 52, flex: 1, digits: 0, targetKey: "step_goal" },
  { key: "hunger", label: "Hunger", min: 48, flex: 0.95, digits: 1 },
  { key: "energy", label: "Energy", min: 48, flex: 0.95, digits: 1 },
];
const DAY_COL_WIDTH = 52;
const NOTE_FLEX = 2.4;
// The point below which the table stops flexing and starts scrolling.
const TABLE_MIN_WIDTH =
  DAY_COL_WIDTH + DAY_COLUMNS.reduce((sum, c) => sum + c.min, 0) + 150;

function fmt(value, digits = 1) {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
}

function targetValue(target, key) {
  if (!target) return null;
  if (key === "calories") return Math.round(deriveCalories(target));
  return target[key] ?? null;
}

function colorFor(key, actual, target) {
  if (target === null || target === undefined) return null;
  return key === "steps" || key === "step_goal" ? colorForStepsTarget(actual, target) : colorForTarget(actual, target);
}

function MacroBar({ short, value, goal }) {
  const tone = colorFor(short, value, goal);
  const color = tone === "green" ? OK : tone === "red" ? OFF : MUTED;
  const fill = value !== null && goal ? Math.max(0.02, Math.min(1, value / goal)) : 0;
  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <View className="flex-row items-baseline justify-between" style={{ gap: 6 }}>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>
          {short}
        </Text>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color }}>
          {fmt(value, 0)}
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 3, backgroundColor: "#f0ece6", marginTop: 3, overflow: "hidden" }}>
        <View style={{ width: `${fill * 100}%`, height: 4, borderRadius: 3, backgroundColor: color === MUTED ? "#ddd6cd" : color }} />
      </View>
    </View>
  );
}

function LoggedDots({ count }) {
  return (
    <View className="flex-row" style={{ gap: 3 }}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < count ? OK : "#ece7e1" }} />
      ))}
    </View>
  );
}

const CHECKIN_STATE = {
  waiting: { label: "Waiting on you", color: "#8a5a2e" },
  reviewed: { label: "Reviewed", color: OK },
  missed: { label: "No check-in", color: MUTED },
};

function DayTable({ week, target }) {
  const byDate = Object.fromEntries(week.summary.days.map((d) => [d.date, d]));
  const dates = Array.from({ length: 7 }, (_, i) => week.dates[i]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-3"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={{ flex: 1, minWidth: TABLE_MIN_WIDTH }}>
        <View className="flex-row items-center" style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
          <Text style={{ width: DAY_COL_WIDTH, fontFamily: fonts.sansBold, fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Day
          </Text>
          {DAY_COLUMNS.map((col) => (
            <Text
              key={col.key}
              style={{ flex: col.flex, minWidth: col.min, fontFamily: fonts.sansBold, fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              {col.label}
            </Text>
          ))}
          <Text style={{ flex: NOTE_FLEX, minWidth: 150, fontFamily: fonts.sansBold, fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Note
          </Text>
        </View>

        {dates.map((date) => {
          const day = byDate[date] ?? null;
          const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
          return (
            <View
              key={date}
              className="flex-row items-center"
              style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f6f3ef", opacity: day ? 1 : 0.55 }}
            >
              <Text style={{ width: DAY_COL_WIDTH, fontFamily: fonts.sansSemiBold, fontSize: 12, color: day ? "#44403c" : MUTED }}>{weekday}</Text>
              {day ? (
                DAY_COLUMNS.map((col) => {
                  const value = day[col.key] ?? null;
                  const tone = col.targetKey ? colorFor(col.key, value, targetValue(target, col.targetKey)) : null;
                  return (
                    <Text
                      key={col.key}
                      maxFontSizeMultiplier={1.1}
                      style={{
                        flex: col.flex,
                        minWidth: col.min,
                        fontFamily: fonts.sans,
                        fontSize: 12,
                        color: tone === "green" ? OK : tone === "red" ? OFF : "#57534e",
                      }}
                    >
                      {fmt(value, col.digits)}
                      {value !== null && value !== undefined && col.suffix ? col.suffix : ""}
                    </Text>
                  );
                })
              ) : (
                <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, color: MUTED, fontStyle: "italic" }}>nothing logged</Text>
              )}
              {day ? (
                <Text numberOfLines={1} style={{ flex: NOTE_FLEX, minWidth: 150, fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
                  {/* client_note, not note — `day` is a raw public.daily_logs
                      row and there is no `note` column, so this rendered "—"
                      for every note a member has ever written. */}
                  {day.client_note || "—"}
                </Text>
              ) : null}
            </View>
          );
        })}

        <View className="flex-row items-center" style={{ paddingVertical: 8 }}>
          <Text style={{ width: DAY_COL_WIDTH, fontFamily: fonts.sansBold, fontSize: 12, color: "#44403c" }}>Avg</Text>
          {DAY_COLUMNS.map((col) => {
            const value = week.summary.averages[col.key] ?? null;
            const tone = col.targetKey ? colorFor(col.key, value, targetValue(target, col.targetKey)) : null;
            return (
              <Text
                key={col.key}
                maxFontSizeMultiplier={1.1}
                style={{
                  flex: col.flex,
                  minWidth: col.min,
                  fontFamily: fonts.sansSemiBold,
                  fontSize: 12,
                  color: tone === "green" ? OK : tone === "red" ? OFF : "#44403c",
                }}
              >
                {fmt(value, col.digits)}
                {value !== null && value !== undefined && col.suffix ? col.suffix : ""}
              </Text>
            );
          })}
          <Text style={{ flex: NOTE_FLEX, minWidth: 150, fontFamily: fonts.sans, fontSize: 11.5, color: MUTED }}>
            {week.summary.days.length} of 7 days logged
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// `week`: { label, start, end, dates, summary, target, checkinState, weightDelta }
export function WeekRow({ week, expanded, onToggle }) {
  const target = week.target;
  const avgWeight = week.summary.averages.weight;

  return (
    <View
      className="mb-2 rounded-xl"
      style={{
        borderWidth: 1,
        borderColor: expanded ? "#e2d6cd" : "#ece7e1",
        backgroundColor: "white",
      }}
    >
      <Pressable onPress={onToggle} className="flex-row flex-wrap items-center px-4 py-3" style={{ gap: 14 }}>
        <View style={{ width: 118 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }}>
            {week.label}
          </Text>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11, color: MUTED, marginTop: 1 }}>
            {formatDateMD(week.start)} – {formatDateMD(week.end)}
          </Text>
        </View>

        <View style={{ width: 78 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
            {fmt(avgWeight, 1)}
          </Text>
          {week.weightDelta !== null && week.weightDelta !== undefined ? (
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sans, fontSize: 11, color: week.weightDelta < 0 ? OK : week.weightDelta > 0 ? "#8a5a2e" : MUTED, marginTop: 1 }}
            >
              {week.weightDelta > 0 ? "+" : ""}
              {week.weightDelta.toFixed(1)}
            </Text>
          ) : null}
        </View>

        <View style={{ width: 82 }}>
          <LoggedDots count={week.summary.days.length} />
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11, color: MUTED, marginTop: 4 }}>
            {week.summary.days.length} of 7
          </Text>
        </View>

        <View className="flex-row" style={{ flex: 1, minWidth: 260, gap: 12 }}>
          {MACRO_BARS.map((bar) => (
            <MacroBar key={bar.key} short={bar.short} value={week.summary.averages[bar.key] ?? null} goal={targetValue(target, bar.targetKey)} />
          ))}
        </View>

        <View className="flex-row items-center" style={{ width: 132, gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CHECKIN_STATE[week.checkinState].color }} />
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: CHECKIN_STATE[week.checkinState].color }}>
            {CHECKIN_STATE[week.checkinState].label}
          </Text>
        </View>

        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#c9c4bd" />
      </Pressable>

      {expanded ? (
        <View className="px-4 pb-4">
          <DayTable week={week} target={target} />
        </View>
      ) : null}
    </View>
  );
}

// A change of targets is drawn BETWEEN the two weeks it separates, not on
// either of them — the point is that everything above the line was measured
// against different numbers than everything below it.
export function TargetChangeDivider({ changes, date }) {
  return (
    <View className="mb-2 flex-row flex-wrap items-center px-4 py-2" style={{ gap: 10 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Targets changed
      </Text>
      <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
        {changes.map((c) => c.text).join(" · ")}
        {date ? ` · ${formatDateMD(date)}` : ""}
      </Text>
    </View>
  );
}

export function WeekRows({ weeks, targetChangeByWeek }) {
  const [expanded, setExpanded] = useState(() => (weeks.length > 0 ? weeks[0].start : null));

  if (weeks.length === 0) {
    return (
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
        No weeks logged yet.
      </Text>
    );
  }

  return (
    <View>
      {weeks.map((week) => {
        const change = targetChangeByWeek?.[week.start] ?? null;
        return (
          <View key={week.start}>
            {/* Rendered above its week because the list runs newest-first,
                so "the week the change took effect" sits directly under it. */}
            {change ? <TargetChangeDivider changes={change.changes} date={change.date} /> : null}
            <WeekRow week={week} expanded={expanded === week.start} onToggle={() => setExpanded((cur) => (cur === week.start ? null : week.start))} />
          </View>
        );
      })}
    </View>
  );
}
