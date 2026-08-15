// The Log screen's day picker — a five-day window sliding over the 14-day
// period, flanked by step arrows.
//
// This replaces three separate mechanisms that all answered the same
// question ("which day am I logging"): a 150×72 date tile, a pair of step
// arrows, and a bounded calendar modal behind the tile. One strip does all
// of it, shows the neighbouring days' state for free, and needs no modal.
//
// Window rule: windowStart = clamp(selected - 2, 0, LEN - VIS). At the start
// of the period the window is pinned to day 1 and the selection moves within
// it; from day 3 onward the selection rides the centre; over the last two
// days the window holds at the end and the selection drifts right, so the
// strip finishes the period out instead of stranding the final days.
import { View, Text, Pressable } from "react-native";
import { fonts } from "../../lib/theme";
import { addDays, daysBetween } from "../../lib/boiseDate";

const VISIBLE_DAYS = 5;
const CENTER_OFFSET = 2;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const SELECTED_FILL = { entered: "#a46a57", submitted: "#4d6142" };
const DOT = { submitted: "#4d6142", entered: "#c98a6b" };

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

// Weekday/day-of-month straight off the ISO string — never `new Date(...)`
// on a bare date, which resolves in the device's zone rather than Boise.
function partsOf(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], dayOfMonth: d.getUTCDate() };
}

function DayCell({ date, selected, submitted, entered, future, onPress }) {
  const { weekday, dayOfMonth } = partsOf(date);
  const fill = submitted ? SELECTED_FILL.submitted : SELECTED_FILL.entered;
  const dotColor = selected ? "rgba(255,255,255,0.85)" : submitted ? DOT.submitted : entered ? DOT.entered : "transparent";

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${weekday} ${dayOfMonth}${submitted ? ", submitted" : entered ? ", not submitted" : ""}`}
      style={{
        width: 46,
        paddingVertical: 7,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: selected ? fill : "transparent",
        opacity: future && !selected ? 0.45 : 1,
        ...(selected
          ? {
              shadowColor: "#2a211c",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.22,
              shadowRadius: 7,
            }
          : null),
      }}
    >
      <Text
        maxFontSizeMultiplier={1}
        style={{
          fontSize: 8.5,
          fontFamily: fonts.sansBold,
          letterSpacing: 0.6,
          color: selected ? "rgba(255,255,255,0.78)" : future ? "#c8c2bb" : "#a8a29e",
        }}
      >
        {weekday}
      </Text>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ marginTop: 4, fontSize: 15, fontFamily: fonts.sansBold, color: selected ? "white" : future ? "#c8c2bb" : "#44403c" }}
      >
        {dayOfMonth}
      </Text>
      <View style={{ marginTop: 4, width: 5, height: 5, borderRadius: 99, backgroundColor: dotColor }} />
    </Pressable>
  );
}

function StepArrow({ direction, enabled, onPress }) {
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      hitSlop={8}
      accessibilityLabel={direction === "back" ? "Previous day" : "Next day"}
      style={{
        width: 30,
        height: 30,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: "#ece7e1",
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Text style={{ fontSize: 15, color: "#8a5140", fontFamily: fonts.sansMedium, lineHeight: 18 }}>
        {direction === "back" ? "‹" : "›"}
      </Text>
    </Pressable>
  );
}

export function PayrollDateNav({ selectedDate, onSelectDate, periodStart, periodEnd, datesWithEntries, submittedDates, today }) {
  const periodLength = daysBetween(periodEnd, periodStart) + 1;
  const selectedIndex = clamp(daysBetween(selectedDate, periodStart), 0, periodLength - 1);
  // A period shorter than the window (shouldn't happen at 14 days, but the
  // clamp would go negative and produce a bogus start if it ever did) simply
  // shows every day it has.
  const windowStart = clamp(selectedIndex - CENTER_OFFSET, 0, Math.max(0, periodLength - VISIBLE_DAYS));
  const visible = Math.min(VISIBLE_DAYS, periodLength);

  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < periodLength - 1;

  return (
    <View className="mb-1 flex-row items-center" style={{ gap: 6 }}>
      <StepArrow direction="back" enabled={canGoPrev} onPress={() => onSelectDate(addDays(selectedDate, -1))} />
      <View className="flex-row justify-center" style={{ flex: 1, gap: 5, overflow: "hidden" }}>
        {Array.from({ length: visible }, (_, i) => {
          const date = addDays(periodStart, windowStart + i);
          const submitted = submittedDates?.has(date) ?? false;
          return (
            <DayCell
              key={date}
              date={date}
              selected={date === selectedDate}
              submitted={submitted}
              entered={!submitted && datesWithEntries.has(date)}
              future={today ? date > today : false}
              onPress={() => onSelectDate(date)}
            />
          );
        })}
      </View>
      <StepArrow direction="forward" enabled={canGoNext} onPress={() => onSelectDate(addDays(selectedDate, 1))} />
    </View>
  );
}
