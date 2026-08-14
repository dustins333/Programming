import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Svg, { Circle } from "react-native-svg";
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

// A week's average for one macro, as a ring against its target.
//
// Replaces a horizontal bar. The bar needed ~96px of width to read at all,
// and four of them plus their gaps put a 420px floor under this row that no
// amount of flex-wrap could shrink — on the PWA at phone width the bars ran
// clean off the right edge. A ring carries the same "how close to target"
// signal in a fixed 62px column, and has room to state the target itself
// underneath rather than leaving the coach to infer it from the fill.
//
// Colour keeps the bar's own three-tone rule (the ±10% band, red included),
// NOT MacroDial's never-red one — a finished week's average genuinely can be
// over or under, where an in-progress day is only ever "not there yet".
const RING_COL_WIDTH = 62;
const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_TRACK = "#f0ece6";

function MacroRing({ short, value, goal }) {
  const tone = colorFor(short, value, goal);
  const color = tone === "green" ? OK : tone === "red" ? OFF : MUTED;
  const logged = value !== null && value !== undefined;
  const progress = logged && goal ? Math.max(0, Math.min(1, value / goal)) : 0;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = RING_SIZE / 2;

  return (
    <View style={{ width: RING_COL_WIDTH, alignItems: "center" }}>
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute" }}>
          <Circle cx={center} cy={center} r={radius} stroke={RING_TRACK} strokeWidth={RING_STROKE} fill="none" />
          {progress > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={`${circumference * progress} ${circumference}`}
              strokeLinecap="round"
              // Start the arc at 12 o'clock instead of 3 o'clock.
              transform={`rotate(-90 ${center} ${center})`}
            />
          ) : null}
        </Svg>
        <Text
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={{
            width: RING_SIZE - 8,
            textAlign: "center",
            fontFamily: fonts.sansSemiBold,
            fontSize: 12,
            color: logged ? color : MUTED,
          }}
        >
          {fmt(value, 0)}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: "#57534e", marginTop: 4 }}>
        {short}
      </Text>
      <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 10, color: "#a8a29e", marginTop: 1 }}>
        {goal ? `of ${Math.round(goal)}` : "no target"}
      </Text>
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
  // Which day's note is opened out to its full text. One at a time.
  const [openNote, setOpenNote] = useState(null);

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
              // Top-aligned while a note is opened out, so the day's numbers
              // sit on the note's first line instead of floating halfway
              // down a three-line block.
              className={openNote === date ? "flex-row items-start" : "flex-row items-center"}
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
              {/* client_note, not note — `day` is a raw public.daily_logs
                  row and there is no `note` column, so this rendered "—"
                  for every note a member has ever written.

                  Tap a note to read the whole thing. It was truncated to one
                  line with no press handler at all, so a long note was
                  simply unreadable from this table. */}
              {day && day.client_note ? (
                <Pressable
                  onPress={() => setOpenNote((cur) => (cur === date ? null : date))}
                  className="flex-row items-start"
                  style={{ flex: NOTE_FLEX, minWidth: 150, gap: 4 }}
                >
                  <Text
                    numberOfLines={openNote === date ? undefined : 1}
                    style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}
                  >
                    {day.client_note}
                  </Text>
                  <Ionicons name={openNote === date ? "chevron-up" : "chevron-down"} size={12} color="#c9c4bd" style={{ marginTop: 2 }} />
                </Pressable>
              ) : day ? (
                <Text style={{ flex: NOTE_FLEX, minWidth: 150, fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>—</Text>
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

        {/* minWidth is the four rings plus their gaps exactly — below that
            this whole block wraps to its own line rather than overflowing,
            which is what the old bars did on a phone. */}
        <View className="flex-row flex-wrap" style={{ flex: 1, minWidth: RING_COL_WIDTH * 4 + 24, gap: 8 }}>
          {MACRO_BARS.map((bar) => (
            <MacroRing key={bar.key} short={bar.short} value={week.summary.averages[bar.key] ?? null} goal={targetValue(target, bar.targetKey)} />
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
