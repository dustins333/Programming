import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { todayInBoise } from "../lib/boiseDate";
import { WEEKDAY_LABELS, MONTH_LABELS, buildMonthGrid, stepMonth } from "../lib/monthGrid";
import { fonts, colors } from "../lib/theme";

const CALENDAR_WIDTH = 280;

// "Fri, Sep 18" — with the year only when it isn't this one. Parsed at noon
// so the weekday can't roll to a neighbouring day in any timezone.
export function formatDateFieldLabel(value, today = todayInBoise()) {
  if (!value) return "";
  const sameYear = value.slice(0, 4) === today.slice(0, 4);
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// A date input that opens a small month calendar right underneath it, in
// place of a long <select> of upcoming days. Values are plain YYYY-MM-DD
// strings in Boise time, the same shape the old option lists produced, so a
// caller swaps it in without touching how it saves.
//
// Days before `minDate` (today, by default) can't be picked. `clearLabel`
// adds a link for an optional date. Picking a day closes the calendar.
// Inline rather than a popup on purpose: it pushes the rest of the form
// down instead of covering it, and there is no positioning to get wrong.
export function DateField({ value, onChange, minDate, clearLabel, placeholder = "Pick a date", maxWidth = 200 }) {
  const today = todayInBoise();
  const floor = minDate ?? today;
  const [open, setOpen] = useState(false);

  const start = value || today;
  const [viewYear, setViewYear] = useState(Number(start.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(start.slice(5, 7)));

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggle = () => {
    if (!open) {
      // Reopen on the month that's actually selected, not wherever the
      // calendar was left.
      const anchor = value || today;
      setViewYear(Number(anchor.slice(0, 4)));
      setViewMonth(Number(anchor.slice(5, 7)));
    }
    setOpen((v) => !v);
  };

  const goMonth = (delta) => {
    const next = stepMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  // Can't page back into months that are entirely unpickable.
  const floorMonth = floor.slice(0, 7);
  const viewKey = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
  const atFloor = viewKey <= floorMonth;

  return (
    <View>
      <PressFade
        onPress={toggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          maxWidth,
          width: "100%",
          borderWidth: 1,
          borderColor: open ? colors.primary : "#d6d3d1",
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: value ? "#292524" : "#a8a29e" }}>
          {value ? formatDateFieldLabel(value, today) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
      </PressFade>

      {open ? (
        <View
          style={{
            width: CALENDAR_WIDTH,
            marginTop: 6,
            borderWidth: 1,
            borderColor: "#ece7e1",
            borderRadius: 12,
            padding: 10,
            backgroundColor: "white",
          }}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <PressFade
              onPress={() => goMonth(-1)}
              disabled={atFloor}
              hitSlop={10}
              style={{ paddingHorizontal: 8, paddingVertical: 4, opacity: atFloor ? 0.3 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.primaryOnWhite }}>‹</Text>
            </PressFade>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#292524" }}>
              {MONTH_LABELS[viewMonth - 1]} {viewYear}
            </Text>
            <PressFade onPress={() => goMonth(1)} hitSlop={10} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.primaryOnWhite }}>›</Text>
            </PressFade>
          </View>

          <View className="flex-row">
            {WEEKDAY_LABELS.map((label, i) => (
              <View key={i} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: "#a8a29e" }}>{label}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((date, i) => {
              if (!date) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const selected = date === value;
              const isToday = date === today;
              const blocked = date < floor;
              return (
                <View key={date} style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}>
                  <PressFade
                    onPress={() => {
                      onChange(date);
                      setOpen(false);
                    }}
                    disabled={blocked}
                    style={{
                      width: "80%",
                      height: "80%",
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.primary : "transparent",
                      borderWidth: isToday && !selected ? 1.5 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: selected ? fonts.sansSemiBold : fonts.sansMedium,
                        fontSize: 12.5,
                        color: selected ? "white" : blocked ? "#d6d3d1" : "#292524",
                      }}
                    >
                      {Number(date.slice(8, 10))}
                    </Text>
                  </PressFade>
                </View>
              );
            })}
          </View>

          {clearLabel ? (
            <PressFade
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
              style={{ alignSelf: "flex-start", paddingTop: 8, paddingHorizontal: 4 }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: value ? colors.primaryOnWhite : "#a8a29e" }}>
                {clearLabel}
              </Text>
            </PressFade>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
