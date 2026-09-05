import { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { buildDateOptions, formatTimeLabel } from "../../lib/dateTimeOptions";
import { todayInBoise, addDays } from "../../lib/boiseDate";
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

// "Thu Sep 4". Parsed at noon so the weekday can't roll to the wrong day.
// This is the date under a day pill, so it never says "Today" — the pill's
// own heading does that, and the line beneath it has to be the real date.
function shortDayLabel(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateLabel(value) {
  if (!value) return "";
  const known = DATE_OPTIONS.find((o) => o.value === value);
  return known ? known.label : shortDayLabel(value);
}

// Now, in Boise, as the same "HH:MM" the time picker works in — so the two
// can be compared as plain strings. Never device-local: a coach travelling
// must not be told a 5am slot has passed because it has where she is.
function nowTimeInBoise() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Boise",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

// Which day a time means, when nobody has said. Past-for-today means
// tomorrow: staging at 9pm is staging for the morning, and the old default of
// "always today" is what put 6 of the first 16 staged sessions on a day that
// had already gone.
function defaultDateFor(time) {
  const today = todayInBoise();
  return time && time < nowTimeInBoise() ? addDays(today, 1) : today;
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

const CLAY = "#a46a57";
const TODAY_BG = "#fdf6f2";

// WHICH DAY, as two pills rather than a fortnight.
//
// This replaces a 7-day strip with a fortnight's worth of paging, which the
// data says was never needed and was actively going wrong: of the first 16
// staged sessions, 15 were for the day they were created and exactly one was
// for any other day. Nothing was ever staged more than a day ahead.
//
// What the strip WAS doing was being missed. The board matches a staged
// session on its date alone (hub_staged_for_pin), so a group dated today
// disappears at Boise midnight — and 6 of those 16 were saved for a time that
// had already passed when they were saved, including two staged two minutes
// apart one evening where only the first got the day changed. That is the
// whole bug: a coach staging tomorrow's 8:30 at 9pm has to notice a small
// grid of day numbers and move it, and half the time doesn't.
//
// So: two big pills that state the day and the date, and a Today pill that
// says out loud when the time picked has already gone by.
//
// A third pill appears only when an existing group is dated further out, so
// reopening one can never silently move it to a day the coach didn't pick.
function DayPills({ value, onChange, timeValue, touched }) {
  const today = todayInBoise();
  const tomorrow = addDays(today, 1);
  // Only meaningful against today: the board ignores the time and matches on
  // the date, so "already passed" is about the day being nearly over, not
  // about the slot itself.
  const passedToday = Boolean(timeValue) && timeValue < nowTimeInBoise();

  // A third pill only when an existing group is dated further out. It costs
  // the row a third of its width, which is why the warning gets shorter: at
  // 375px "already passed" fits two pills and ellipsises across three, and
  // letting it wrap instead pushed the whole row below the fold (measured).
  const hasOther = Boolean(value && value !== today && value !== tomorrow);
  const passedLabel = hasOther ? "passed" : "already passed";

  const options = [
    { value: today, label: "Today", sub: passedToday ? passedLabel : shortDayLabel(today), warn: passedToday },
    { value: tomorrow, label: "Tomorrow", sub: shortDayLabel(tomorrow), warn: false },
  ];
  if (hasOther) {
    options.push({
      value,
      label: new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }),
      sub: new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      warn: false,
    });
  }

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        // The nudge, not a rule: the day only auto-follows the clock while
        // the coach hasn't picked one herself. Once she has, it stays put.
        const nudge = !touched && !selected && passedToday && opt.value === tomorrow;
        return (
          <PressFade
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityLabel={`${opt.label}, ${formatDateLabel(opt.value)}`}
            pressedOpacity={0.7}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 11,
              paddingHorizontal: 8,
              alignItems: "center",
              backgroundColor: selected ? CLAY : nudge ? TODAY_BG : "#fff",
              borderWidth: selected ? 0 : nudge ? 1.5 : 1,
              borderColor: nudge ? CLAY : INPUT_BORDER,
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 15, color: selected ? "#fff" : INK }}
            >
              {opt.label}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{
                marginTop: 2,
                textAlign: "center",
                fontFamily: fonts.sansSemiBold,
                fontSize: type.caption,
                color: selected ? "rgba(255,255,255,0.85)" : opt.warn ? "#b23a22" : colors.muted,
              }}
            >
              {opt.sub}
            </Text>
          </PressFade>
        );
      })}
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
  const [time, setTime] = useState(initial?.scheduledTime ?? "05:00");
  const [date, setDate] = useState(initial?.scheduledDate ?? defaultDateFor(initial?.scheduledTime ?? "05:00"));
  const [title, setTitle] = useState(initial?.title ?? "");
  // Reopening an existing group counts as already chosen: its day is the
  // coach's from a previous sitting, and must not drift when she comes back
  // to change the time.
  const [dayTouched, setDayTouched] = useState(Boolean(initial?.scheduledDate));

  // ClockTimePicker hands its onChange a FUNCTIONAL updater, not a value, so
  // that an hour and a minute tapped inside one React batch compose instead of
  // the second undoing the first. Resolving it needs the current time, and
  // reading that from state would be a render behind in exactly that case — so
  // a ref is advanced by hand, the same idiom ExerciseCard's rowsRef and the
  // hub's activeRef use for the same reason.
  const timeRef = useRef(time);

  // The sheet is mounted for the life of the screen with `visible` toggling,
  // so state seeded at mount is whatever was last typed — reopening to edit a
  // group showed the previous group's values, and a default date worked out
  // this morning would still be sitting there tonight. Re-seed on every open,
  // the same thing ClockTimePicker's resetKey does below. Keyed on `visible`
  // alone: `initial` is a fresh object each render and would loop.
  useEffect(() => {
    if (!visible) return;
    const t = initial?.scheduledTime ?? "05:00";
    timeRef.current = t;
    setTime(t);
    setDate(initial?.scheduledDate ?? defaultDateFor(t));
    setTitle(initial?.title ?? "");
    setDayTouched(Boolean(initial?.scheduledDate));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The day follows the clock only until the coach picks one herself. This is
  // the actual fix for sessions landing on a morning that has gone: at 9pm,
  // choosing 8:30 means tomorrow, and leaving the day alone should not quietly
  // mean otherwise.
  const chooseTime = (updater) => {
    const next = typeof updater === "function" ? updater(timeRef.current) : updater;
    timeRef.current = next;
    setTime(next);
    if (dayTouched) return;
    const today = todayInBoise();
    // Only ever nudges between today and tomorrow. A group dated further out
    // is a day the coach chose, and the clock must not drag it back.
    if (date !== today && date !== addDays(today, 1)) return;
    setDate(defaultDateFor(next));
  };

  const chooseDay = (next) => {
    setDayTouched(true);
    setDate(next);
  };

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

        <View style={{ marginTop: 14 }}>
          <ClockTimePicker value={time} onChange={chooseTime} resetKey={visible} />
        </View>
        {/* Under the clock, per the order a coach actually thinks in: the
            time is the thing always being set, the day is usually just
            "today". Kept above the name field and the buttons so it can't
            fall below the fold on a short phone — measured. */}
        <View style={{ marginTop: 14 }}>
          <DayPills value={date} onChange={chooseDay} timeValue={time} touched={dayTouched} />
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
