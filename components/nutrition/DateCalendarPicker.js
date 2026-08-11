import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { todayInBoise } from "../../lib/boiseDate";
import { WEEKDAY_LABELS, MONTH_LABELS, buildMonthGrid, stepMonth } from "../../lib/monthGrid";

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
    const { year: y, month: m } = stepMonth(viewYear, viewMonth, delta);
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
