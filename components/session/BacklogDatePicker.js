import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { buildMonthGrid, stepMonth, MONTH_LABELS, WEEKDAY_LABELS } from "../../lib/monthGrid";
import { fonts, colors, type } from "../../lib/theme";
import { CARD_BORDER, CARD_SHADOW, CLAY, BRAND_TEXT, INK, MUTED } from "./SessionSheetParts";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortLabel(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// A real month grid rather than a 30-item dropdown — a member reaching for
// "pick a date" is looking for a specific day she trained, and scanning a
// flat list of "Thu 08-07-2026" for it is the wrong shape of work.
//
// Same pure year/month math every other calendar in this app uses
// (lib/monthGrid.js) so nothing here parses a Date for anything but the
// noon-anchored weekday lookup. Future days are inert: she can't have
// trained on one.
function CalendarGrid({ value, today, onPick }) {
  const [viewed, setViewed] = useState(() => {
    const [y, m] = (value ?? today).split("-").map(Number);
    return { year: y, month: m };
  });
  const cells = useMemo(() => buildMonthGrid(viewed.year, viewed.month), [viewed]);
  // Nothing to see past the current month.
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const atCurrentMonth = viewed.year === todayYear && viewed.month === todayMonth;

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: "#f4efe9", paddingTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <PressFade onPress={() => setViewed((v) => stepMonth(v.year, v.month, -1))} hitSlop={10} accessibilityLabel="Previous month" style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={16} color="#57534e" />
        </PressFade>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: INK }}>
          {MONTH_LABELS[viewed.month - 1]} {viewed.year}
        </Text>
        <PressFade
          onPress={() => !atCurrentMonth && setViewed((v) => stepMonth(v.year, v.month, 1))}
          disabled={atCurrentMonth}
          hitSlop={10}
          accessibilityLabel="Next month"
          style={{ padding: 4, opacity: atCurrentMonth ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-forward" size={16} color="#57534e" />
        </PressFade>
      </View>

      <View style={{ flexDirection: "row" }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text
            key={i}
            maxFontSizeMultiplier={1}
            style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: type.eyebrow, color: colors.muted, marginBottom: 4 }}
          >
            {d}
          </Text>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {cells.slice(row * 7, row * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={{ flex: 1, height: 34 }} />;
            const selected = date === value;
            const future = date > today;
            return (
              <PressFade
                key={date}
                onPress={() => !future && onPick(date)}
                disabled={future}
                accessibilityLabel={formatDateMDY(date)}
                style={{ flex: 1, height: 34, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected ? CLAY : "transparent",
                    borderWidth: !selected && date === today ? 1.5 : 0,
                    borderColor: CLAY,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1}
                    style={{
                      fontFamily: selected || date === today ? fonts.sansBold : fonts.sans,
                      fontSize: 12.5,
                      color: selected ? "#fff" : future ? "#ddd6cd" : INK,
                    }}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>
              </PressFade>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// design_handoff_member_block_v1 (14b) — this is the fix for a real bug, not
// decoration: the old sheet offered "Log session" for any incomplete session
// with no date question at all, so a session she did last Thursday was
// recorded as today.
//
// Three chips (today and the two days behind it) cover the overwhelmingly
// common case in one tap; "Pick a date" opens the full list for anything
// older. Nothing ahead of today is ever offered — she can't have trained on a
// day that hasn't happened.
export function BacklogDatePicker({ value, onChange, locked }) {
  const today = todayInBoise();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Oldest first, left to right: two days ago, yesterday, today — then the
  // calendar. Time runs the way it's read.
  const quickDates = useMemo(() => [2, 1, 0].map((offset) => addDays(today, -offset)), [today]);

  // Once she starts entering sets the date is fixed — changing it afterwards
  // would silently split one session's log across two dates.
  if (locked) {
    return (
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 14, ...CARD_SHADOW }}>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK }}>
          Logging as {formatDateMDY(value)}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: MUTED, marginTop: 3 }}>
          Close and reopen this session to change the date.
        </Text>
      </View>
    );
  }

  const showFullPicker = pickerOpen || !quickDates.includes(value);

  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 14, ...CARD_SHADOW }}>
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK, marginBottom: 10 }}>
        When did you do this one?
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {quickDates.map((date) => {
          const selected = date === value;
          const isToday = date === today;
          return (
            <PressFade
              key={date}
              onPress={() => {
                setPickerOpen(false);
                onChange(date);
              }}
              accessibilityLabel={`Logged on ${formatDateMDY(date)}`}
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: selected ? 1.5 : 1,
                borderColor: selected ? CLAY : "#e2ddd6",
                backgroundColor: selected ? "#fdf6f2" : "#fff",
                paddingVertical: 9,
                alignItems: "center",
              }}
            >
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 15, lineHeight: 17, color: selected ? BRAND_TEXT : "#57534e" }}>
                {isToday ? "Today" : WEEKDAY_SHORT[dayOfWeekInBoise(date)]}
              </Text>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: selected ? BRAND_TEXT : MUTED, marginTop: 3 }}>
                {shortLabel(date)}
              </Text>
            </PressFade>
          );
        })}
        <PressFade
          onPress={() => setPickerOpen((o) => !o)}
          accessibilityLabel="Pick another date"
          style={{
            flex: 1,
            borderRadius: 12,
            borderWidth: showFullPicker ? 1.5 : 1,
            borderColor: showFullPicker ? CLAY : "#e2ddd6",
            backgroundColor: showFullPicker ? "#fdf6f2" : "#fff",
            paddingVertical: 9,
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Ionicons name="calendar-outline" size={15} color={BRAND_TEXT} />
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: BRAND_TEXT, textAlign: "center" }}>
            Pick a date
          </Text>
        </PressFade>
      </View>

      {showFullPicker ? <CalendarGrid value={value} today={today} onPick={onChange} /> : null}
    </View>
  );
}
