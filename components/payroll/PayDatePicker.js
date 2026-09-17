// "What day is this for" — the day a custom pay request is paid on, which
// is what decides the pay period it lands in.
//
// A month grid rather than a row of period pills. The pills answered a
// narrower question ("current period or the previous one"), hid themselves
// whenever only one was writable, and could not reach a period ahead of
// today at all — so owner pay meant for the next cycle had nowhere to go.
// A date is also the thing the money actually carries: pay_entries.entry_date
// is what every day-level view and the CSV export reads.
//
// Unusable days stay visible but inert (dimmed, with the reason shown when
// tapped) instead of vanishing: a closed period is a fact worth seeing, and
// a grid with holes in it reads as broken.
//
// One component, two skins, because the staff form sits on white and the
// admin approval card is dark — two calendars would drift.
import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildMonthGrid, stepMonth, MONTH_LABELS, WEEKDAY_LABELS } from "../../lib/monthGrid";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const TONES = {
  light: {
    text: "#2a211c",
    muted: "#78716c",
    faint: "#c8c2bb",
    border: "#e7e5e4",
    surface: "white",
    chrome: "#57534e",
    accent: colors.primary,
    accentText: "white",
    accentSoft: "#fdf6f2",
    accentSoftText: colors.primaryOnWhite,
  },
  dark: {
    text: "white",
    muted: "#a49890",
    faint: "#6b625b",
    border: "#6b625b",
    surface: "#2f2a27",
    chrome: "#c9beb4",
    accent: "#c9a274",
    accentText: "#2a211c",
    accentSoft: "#3f3833",
    accentSoftText: "#e7d9c9",
  },
};

function MonthGrid({ value, today, tone, dateStatus, onPick, onBlocked }) {
  const [viewed, setViewed] = useState(() => {
    const [y, m] = (value ?? today).split("-").map(Number);
    return { year: y, month: m };
  });
  const cells = useMemo(() => buildMonthGrid(viewed.year, viewed.month), [viewed]);

  return (
    <View style={{ marginTop: 10 }}>
      <View className="mb-2 flex-row items-center justify-between">
        <Pressable onPress={() => setViewed((v) => stepMonth(v.year, v.month, -1))} hitSlop={10} accessibilityLabel="Previous month" style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={16} color={tone.chrome} />
        </Pressable>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: tone.text }}>
          {MONTH_LABELS[viewed.month - 1]} {viewed.year}
        </Text>
        <Pressable onPress={() => setViewed((v) => stepMonth(v.year, v.month, 1))} hitSlop={10} accessibilityLabel="Next month" style={{ padding: 4 }}>
          <Ionicons name="chevron-forward" size={16} color={tone.chrome} />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((d, i) => (
          <Text
            key={i}
            maxFontSizeMultiplier={1}
            style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.6, color: tone.muted, marginBottom: 4 }}
          >
            {d}
          </Text>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} className="flex-row">
          {cells.slice(row * 7, row * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={{ flex: 1, height: 34 }} />;
            const selected = date === value;
            const blocked = dateStatus ? dateStatus(date) : null;
            return (
              <Pressable
                key={date}
                // Blocked days press and explain themselves rather than
                // doing nothing — the same reason the submit buttons on
                // these screens dim without being hard-disabled.
                onPress={() => (blocked ? onBlocked?.(blocked) : onPick(date))}
                accessibilityLabel={blocked ? `${formatDateMDY(date)} — ${blocked}` : formatDateMDY(date)}
                style={{ flex: 1, height: 34, alignItems: "center", justifyContent: "center", opacity: blocked ? 0.35 : 1 }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected ? tone.accent : "transparent",
                    borderWidth: !selected && date === today ? 1.5 : 0,
                    borderColor: tone.accent,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1}
                    style={{
                      fontFamily: selected || date === today ? fonts.sansBold : fonts.sans,
                      fontSize: 12.5,
                      color: selected ? tone.accentText : tone.text,
                    }}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function PayDatePicker({ value, today, onChange, dateStatus, onBlocked, periodLabel, periodWarning, variant = "light", startOpen = false }) {
  const tone = TONES[variant] ?? TONES.light;
  const [open, setOpen] = useState(startOpen);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel="Change the day this is paid on"
        className="flex-row items-center justify-between rounded-lg border px-3 py-2.5"
        style={{ borderColor: open ? tone.accent : tone.border, backgroundColor: open ? tone.accentSoft : tone.surface }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: open ? tone.accentSoftText : tone.text }}>
            {value ? formatDateMDY(value) : "Pick a day"}
            {value === today ? " · today" : ""}
          </Text>
          {/* The period is the consequence of the date, so it is stated
              next to it rather than left to be worked out from a calendar. */}
          {periodLabel ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: periodWarning ? tone.accentSoftText : tone.muted, marginTop: 3 }}>
              {periodLabel}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "calendar-outline"} size={15} color={open ? tone.accentSoftText : tone.muted} />
      </Pressable>

      {open ? (
        <MonthGrid
          value={value}
          today={today}
          tone={tone}
          dateStatus={dateStatus}
          onBlocked={onBlocked}
          onPick={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
