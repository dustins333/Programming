// Bounded month-grid calendar for My Entries' date nav — forked from
// components/nutrition/DateCalendarPicker.js rather than extended with a
// third interaction mode: that component's semantics are toggle
// assign/unassign, this one's are "select one in-range date and close."
// Reuses its pure grid math (buildMonthGrid/daysInMonth/pad2, anchored on
// dayOfWeekInBoise — never a raw Date object) since the underlying
// calendar-cell layout is identical.
import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { dayOfWeekInBoise } from "../../lib/boiseDate";
import { PayrollBottomSheet } from "./PayrollBottomSheet";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildMonthGrid(year, month) {
  const monthStart = `${year}-${pad2(month)}-01`;
  const firstWeekday = dayOfWeekInBoise(monthStart);
  const total = daysInMonth(year, month);
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function PayrollDatePicker({ visible, onClose, periodStart, periodEnd, datesWithEntries, selectedDate, onSelectDate }) {
  const [year, month] = (selectedDate || periodStart).split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title="Pick a date" maxHeight="70%">
      <View style={{ width: 280, alignSelf: "center" }}>
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
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap">
          {cells.map((date, i) => {
            if (!date) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;

            const inRange = date >= periodStart && date <= periodEnd;
            const isSelected = date === selectedDate;
            const hasEntries = datesWithEntries.has(date);
            const day = Number(date.slice(8, 10));

            let bg = "transparent";
            let textColor = inRange ? "#292524" : "#d6d3d1";
            let borderColor = "transparent";
            if (isSelected) {
              bg = colors.primary;
              textColor = "white";
            }

            return (
              <View key={date} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} className="items-center justify-center">
                <Pressable
                  onPress={() => inRange && onSelectDate(date)}
                  disabled={!inRange}
                  className="items-center justify-center rounded-full"
                  style={{ width: "78%", height: "78%", backgroundColor: bg, borderWidth: borderColor === "transparent" ? 0 : 1.5, borderColor, opacity: inRange ? 1 : 0.35 }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: textColor }}>{day}</Text>
                  {hasEntries && !isSelected ? (
                    <View style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </PayrollBottomSheet>
  );
}
