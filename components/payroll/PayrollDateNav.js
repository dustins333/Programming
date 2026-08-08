// Top-of-page date navigation for My Entries — a centered date tile
// (MM-DD-YYYY, tap to open the bounded calendar picker) flanked by day-step
// arrows, both mechanisms present since a coach might want to nudge one day
// at a time OR jump straight to a specific date.
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { formatDateMDY } from "../../lib/formatDate";
import { addDays } from "../../lib/boiseDate";
import { PayrollDatePicker } from "./PayrollDatePicker";

export function PayrollDateNav({ selectedDate, onSelectDate, periodStart, periodEnd, datesWithEntries }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const canGoPrev = selectedDate > periodStart;
  const canGoNext = selectedDate < periodEnd;
  const hasEntriesToday = datesWithEntries.has(selectedDate);

  return (
    <View className="mb-6 items-center">
      <View className="flex-row items-center" style={{ gap: 18 }}>
        <Pressable
          onPress={() => canGoPrev && onSelectDate(addDays(selectedDate, -1))}
          disabled={!canGoPrev}
          hitSlop={10}
          className="items-center justify-center rounded-full"
          style={{ width: 36, height: 36, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white", opacity: canGoPrev ? 1 : 0.35 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.primaryOnWhite} />
        </Pressable>

        <Pressable
          onPress={() => setPickerOpen(true)}
          className="items-center justify-center rounded-2xl"
          style={{ width: 150, height: 72, backgroundColor: "white", borderWidth: hasEntriesToday ? 2 : 1, borderColor: hasEntriesToday ? "#4d6142" : "#ece7e1" }}
        >
          <Ionicons name="calendar-outline" size={14} color="#a8a29e" style={{ marginBottom: 3 }} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>{formatDateMDY(selectedDate)}</Text>
        </Pressable>

        <Pressable
          onPress={() => canGoNext && onSelectDate(addDays(selectedDate, 1))}
          disabled={!canGoNext}
          hitSlop={10}
          className="items-center justify-center rounded-full"
          style={{ width: 36, height: 36, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white", opacity: canGoNext ? 1 : 0.35 }}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.primaryOnWhite} />
        </Pressable>
      </View>

      <PayrollDatePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        periodStart={periodStart}
        periodEnd={periodEnd}
        datesWithEntries={datesWithEntries}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          onSelectDate(date);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
