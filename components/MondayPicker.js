import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts, colors } from "../lib/theme";
import { todayInBoise } from "../lib/boiseDate";
import { WEEKDAY_LABELS, MONTH_LABELS, buildMonthGrid, stepMonth } from "../lib/monthGrid";

const WIDTH = 280;
const DOT_COLOR = "#4d6142";

// Same compact inline month grid as DateCalendarPicker (shared math in
// lib/monthGrid.js), but single-select and Monday-only. Two callers, both
// of which need a date that is structurally a Monday rather than one that
// happens to be: a nutrition photo cadence (check-ins are reviewed on
// Mondays, so the schedule is anchored to one) and a training block's start
// date (a block runs Monday–Sunday so a block week and a calendar week are
// the same seven days).
//
// Restricting selection structurally — rather than validating a typed date
// — is what kills the real bugs the free-text fields had: a photo anchor
// that wasn't a Monday silently shifted every subsequent required week on
// biweekly/monthly cadences and a malformed string made the requirement
// check return false forever with no error anywhere; a block that didn't
// start on a Monday split one calendar week's sessions across two block
// weeks, so sessions were quietly skipped or repeated.
//
// NOTE: the opening month is seeded from `value` on the FIRST render only.
// A caller whose value arrives a tick later (e.g. from a fetch) has to
// remount this or it will open on the wrong month.
//
// `markedDates` dots the Mondays the cadence will actually land on, so the
// resulting schedule is visible while picking rather than something the
// coach has to work out in her head.
// `disabledDates` are Mondays that can't be chosen — the block dialog passes
// every Monday where a new block would land on top of an existing one, so
// overlaps are unpickable rather than rejected after the fact by
// createBlock's own guard. Combine it with `markedDates` on the same date to
// say "there's already a block in this week" as opposed to a plain "no".
export function MondayPicker({ value, onChange, markedDates = [], disabledDates = [] }) {
  const today = todayInBoise();
  const [initialYear, initialMonth] = (value || today).split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const marked = useMemo(() => new Set(markedDates), [markedDates]);
  const disabled = useMemo(() => new Set(disabledDates), [disabledDates]);

  const goMonth = (delta) => {
    const { year, month } = stepMonth(viewYear, viewMonth, delta);
    setViewYear(year);
    setViewMonth(month);
  };

  // Column index 1 is Monday — the grid is Sunday-first (WEEKDAY_LABELS),
  // so this needs no per-cell weekday lookup.
  const isMondayColumn = (i) => i % 7 === 1;

  return (
    <View style={{ width: WIDTH }}>
      <View className="mb-2 flex-row items-center justify-between">
        <Pressable onPress={() => goMonth(-1)} hitSlop={10} className="px-2 py-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.primaryOnWhite }}>‹</Text>
        </Pressable>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </Text>
        <Pressable onPress={() => goMonth(1)} hitSlop={10} className="px-2 py-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.primaryOnWhite }}>›</Text>
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-0.5">
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: i === 1 ? "#57534e" : "#d6d3d1" }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;

          const isMondayCell = isMondayColumn(i);
          const isTaken = isMondayCell && disabled.has(date);
          const selectable = isMondayCell && !isTaken;
          const isSelected = date === value;
          // A taken Monday keeps its marker — the point is to SHOW the weeks
          // that already have a block, not just refuse them silently.
          const isMarked = marked.has(date) && !isSelected;
          const day = Number(date.slice(8, 10));

          return (
            <View key={date} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} className="items-center justify-center">
              <Pressable
                onPress={() => selectable && onChange(date)}
                disabled={!selectable}
                className="items-center justify-center rounded-full"
                style={{
                  width: "78%",
                  height: "78%",
                  // A taken Monday is filled rather than blank, so an
                  // occupied stretch reads as a solid run across the row.
                  backgroundColor: isSelected ? colors.primary : isTaken ? "#ebe7e2" : "transparent",
                  borderWidth: date === today && !isSelected ? 1.5 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sansMedium,
                    fontSize: 12,
                    color: isSelected ? "white" : isTaken ? "#a8a29e" : selectable ? "#292524" : "#d6d3d1",
                  }}
                >
                  {day}
                </Text>
                {isMarked ? (
                  <View style={{ position: "absolute", bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: DOT_COLOR }} />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
