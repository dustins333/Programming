import { useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { buildDateOptions, formatTimeLabel } from "../../lib/dateTimeOptions";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../../lib/boiseDate";
import { ClockTimePicker } from "../ClockTimePicker";
import { fonts, colors, type } from "../../lib/theme";

// Staging's three pieces on the roster: pick WHEN, a docked bar that follows
// you while you build, and the sheet you finalize from.
//
// The bar is the whole reason staging is usable. Clients are added one at a
// time from the preview sheet, several screens deep, so without something
// persistent on the roster a coach is adding to an invisible pile and loses
// count by the third client.
//
// Espresso, matching StartLiveSessionButton — the two live on the same
// screen and are the same kind of object (the dark surface is "the board",
// wherever it appears).

const ESPRESSO = "#33251f";
const ESPRESSO_TEXT = "#f7f3ee";
const ESPRESSO_SUB = "#a89a92";
const CARD_BORDER = "#ece7e1";
const ROW_DIVIDER = "#f4f1ec";
const INPUT_BORDER = "#e2ddd6";
const INK = "#2a211c";
const SHEET_CANVAS = "#faf8f6";
const TINT_BG = "#fdf6f2";
const TINT_BORDER = "#f0ddd2";

const DATE_OPTIONS = buildDateOptions(14);

function formatDateLabel(value) {
  if (!value) return "";
  const known = DATE_OPTIONS.find((o) => o.value === value);
  if (known) return known.label;
  // Parsed at noon so the weekday can't roll to the wrong day.
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function describeWhen(staged) {
  if (!staged) return "";
  return `${formatTimeLabel(staged.scheduled_time)} · ${formatDateLabel(staged.scheduled_date)}`;
}

/* --------------------------------------------------------------- sheet shell */

function SheetShell({ visible, onClose, children, label }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <PressFade
        onPress={onClose}
        pressedOpacity={1}
        accessibilityLabel={label}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(42,33,28,0.38)" }}
      >
        {/* Swallows the tap so pressing inside the sheet doesn't reach the
            backdrop — on web a Pressable's onClick is a real DOM event. */}
        <PressFade
          onPress={(e) => e.stopPropagation?.()}
          pressedOpacity={1}
          style={{
            width: "100%",
            maxHeight: "86%",
            // Without an explicit clip the content sizes to itself and pushes
            // the footer off the bottom — maxHeight alone doesn't make a flex
            // child shrink.
            overflow: "hidden",
            backgroundColor: SHEET_CANVAS,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingBottom: insets.bottom + 14,
            shadowColor: "#2a211c",
            shadowOffset: { width: 0, height: -12 },
            shadowOpacity: 0.2,
            shadowRadius: 34,
            elevation: 12,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: "#ddd6cd", alignSelf: "center", marginTop: 10, marginBottom: 14 }} />
          {children}
        </PressFade>
      </PressFade>
    </Modal>
  );
}

// A real <select> on web (the PWA is web, and a native list there would be a
// worse control than the one the browser already has), NativePickerField on
// native — the same split announcements and payroll already use.
const CLAY = "#a46a57";
const TODAY_BG = "#fdf6f2";
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
// How far ahead a session can be staged. Matches the 14 days the dropdown
// this replaces offered, i.e. two swipes of the strip.
const HORIZON_WEEKS = 2;

function DateStrip({ value, onChange }) {
  const today = todayInBoise();
  const [weekOffset, setWeekOffset] = useState(0);

  const start = addDays(today, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, letter: DAY_LETTERS[dayOfWeekInBoise(date)], isToday: date === today };
  });

  const arrow = (dir, label, disabled) => (
    <PressFade
      onPress={() => setWeekOffset((o) => o + dir)}
      disabled={disabled}
      accessibilityLabel={label}
      pressedOpacity={0.6}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={dir < 0 ? "chevron-back" : "chevron-forward"} size={16} color="#57534e" />
    </PressFade>
  );

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {arrow(-1, "Earlier days", weekOffset === 0)}
        <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
          {days.map((day) => {
            const selected = day.date === value;
            return (
              <PressFade
                key={day.date}
                onPress={() => onChange(day.date)}
                accessibilityLabel={formatDateLabel(day.date)}
                pressedOpacity={0.6}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 8,
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: selected ? CLAY : day.isToday ? TODAY_BG : "transparent",
                  borderWidth: day.isToday && !selected ? 1.5 : 0,
                  borderColor: CLAY,
                }}
              >
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, color: selected ? "#fff" : colors.muted }}
                >
                  {day.letter}
                </Text>
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: selected ? "#fff" : "#44403c" }}
                >
                  {Number(day.date.slice(8, 10))}
                </Text>
              </PressFade>
            );
          })}
        </View>
        {arrow(1, "Later days", weekOffset >= HORIZON_WEEKS - 1)}
      </View>
      {/* A day number alone can't say which month, and the strip crosses one
          every few weeks. */}
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ marginTop: 7, textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.muted }}
      >
        {formatDateLabel(value)}
      </Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, tone = colors.primary }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: tone,
        borderRadius: 12,
        paddingVertical: 14,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#fff" }}>
        {label}
      </Text>
    </PressFade>
  );
}

/* ------------------------------------------------------------- when to stage */

// Asked at SAVE time now, not before you can add anyone: a coach browses the
// roster first and only commits to a morning once they know who is on it.
// `initial` is for reopening an existing group to change its when.
export function StageWhenSheet({
  visible,
  onClose,
  onCreate,
  busy,
  heading = "When is it?",
  ctaLabel = "Start staging",
  busyLabel = "Starting…",
  initial = null,
}) {
  const [date, setDate] = useState(initial?.scheduledDate ?? DATE_OPTIONS[0]?.value ?? "");
  const [time, setTime] = useState(initial?.scheduledTime ?? "05:00");
  const [title, setTitle] = useState(initial?.title ?? "");

  return (
    <SheetShell visible={visible} onClose={onClose} label="Close staging setup">
      {/* The clock made this tall enough to matter: on a short phone the
          sheet's own maxHeight would clip whatever fell off the bottom, and
          the bottom is where Save lives. The body scrolls; the buttons sit
          outside it so they are always reachable. */}
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6 }}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>Stage a session</Eyebrow>
        <Text maxFontSizeMultiplier={1.1} style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 23, color: INK }}>
          {heading}
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 3, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
          The board offers a staged session on the morning it's for, so tonight's work is waiting at 5am.
        </Text>

        <View style={{ marginTop: 16 }}>
          <DateStrip value={date} onChange={setDate} />
        </View>
        <View style={{ marginTop: 14 }}>
          <ClockTimePicker value={time} onChange={setTime} resetKey={visible} />
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Name it (optional)"
          placeholderTextColor={colors.hint}
          maxLength={40}
          style={{
            marginTop: 9,
            height: 42,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: INPUT_BORDER,
            borderRadius: 10,
            paddingHorizontal: 12,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: INK,
          }}
        />
      </ScrollView>

      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <PressFade onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.muted }}>
              Cancel
            </Text>
          </PressFade>
          <PrimaryButton
            label={busy ? busyLabel : ctaLabel}
            disabled={busy || !date || !time}
            onPress={() => onCreate({ scheduledDate: date, scheduledTime: time, title: title.trim() || null })}
          />
        </View>
      </View>
    </SheetShell>
  );
}
