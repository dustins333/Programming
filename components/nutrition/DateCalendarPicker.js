import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  // month is 1-12
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Pure calendar-grid math on plain year/month integers — deliberately never
// touches a Date object for anything beyond dayOfWeekInBoise's own internal
// noon-anchored parse, matching this app's standing "never trust device
// local time for date math" rule (lib/boiseDate.js).
function buildMonthGrid(year, month) {
  const monthStart = `${year}-${pad2(month)}-01`;
  const firstWeekday = dayOfWeekInBoise(monthStart); // 0=Sun
  const total = daysInMonth(year, month);

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WIDTH = 280;

// Compact inline month calendar, no popup — sits directly on the page.
// Tapping a plain date assigns it immediately (fills in a circle); tapping
// an already-assigned date immediately unassigns it. No separate
// select-then-confirm step, matching "click it, it's done, click again to
// undo" feedback from an earlier Modal-based multi-select version that
// felt oversized and had an unnecessary confirm button for something this
// simple. Fixed small width so it reads like a normal date-picker widget
// on any screen size, not a stretched panel.
export function DateCalendarPicker({ assignedDates, onAssign, onUnassign }) {
  const today = todayInBoise();
  const [year, initialMonth] = today.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [pending, setPending] = useState(null); // date currently being (un)assigned — blocks double-tap

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const assignedByDate = useMemo(() => new Map(assignedDates.map((d) => [d.date, d.id])), [assignedDates]);

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

  const handleTap = async (date) => {
    if (pending) return;
    setPending(date);
    try {
      const existingId = assignedByDate.get(date);
      if (existingId) await onUnassign(existingId);
      else await onAssign(date);
    } finally {
      setPending(null);
    }
  };

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
            <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;

          const isAssigned = assignedByDate.has(date);
          const isToday = date === today;
          const isPending = pending === date;
          const day = Number(date.slice(8, 10));

          let bg = "transparent";
          let textColor = "#292524";
          let borderColor = "transparent";
          if (isAssigned) {
            bg = colors.primary;
            textColor = "white";
          } else if (isToday) {
            borderColor = colors.primary;
          }

          return (
            <View key={date} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} className="items-center justify-center">
              <Pressable
                onPress={() => handleTap(date)}
                disabled={isPending}
                className="items-center justify-center rounded-full"
                style={{ width: "78%", height: "78%", backgroundColor: bg, borderWidth: borderColor === "transparent" ? 0 : 1.5, borderColor, opacity: isPending ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: textColor }}>{day}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
