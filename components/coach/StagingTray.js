import { useState } from "react";
import { Modal, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { NativePickerField } from "../NativePickerField";
import { buildDateOptions, formatTimeLabel } from "../../lib/dateTimeOptions";
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

export function formatDateLabel(value) {
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
function WhenField({ options, value, onChange, label }) {
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          flex: 1,
          minWidth: 0,
          height: 42,
          borderRadius: 10,
          border: `1px solid ${INPUT_BORDER}`,
          background: "#fff",
          padding: "0 10px",
          fontFamily: fonts.sans,
          fontSize: 14,
          color: INK,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return <NativePickerField options={options} value={value} onChange={onChange} placeholder={label} />;
}


/* --------------------------------------------------------------- time input */

// Hour / 15-minute steppers plus AM-PM, the same shape as payroll's hour
// picker — a 96-row dropdown of every quarter hour in the day is a miserable
// way to say "5:00 AM", which is what nearly every one of these is.
const MINUTE_STEP = 15;
const TIME_PRESETS = ["05:00", "06:00", "07:00", "16:00"];

function parseTime(value) {
  const [h, m] = String(value ?? "05:00").slice(0, 5).split(":").map((n) => parseInt(n, 10));
  const hour = Number.isFinite(h) ? h : 5;
  const minute = Number.isFinite(m) ? m : 0;
  return { hour12: hour % 12 === 0 ? 12 : hour % 12, minute, pm: hour >= 12 };
}

function buildTime(hour12, minute, pm) {
  const h24 = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function StepButton({ icon, onPress, label }) {
  return (
    <PressFade
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: "#e7e5e4",
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
        {icon}
      </Text>
    </PressFade>
  );
}

function Stepper({ label, display, onDown, onUp }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 9, backgroundColor: "#fff" }}>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ textAlign: "center", fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.7, color: colors.muted, textTransform: "uppercase" }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
        <StepButton icon="−" onPress={onDown} label={`Fewer ${label.toLowerCase()}`} />
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 24, color: INK }}>
          {display}
        </Text>
        <StepButton icon="+" onPress={onUp} label={`More ${label.toLowerCase()}`} />
      </View>
    </View>
  );
}

function TimeStepper({ value, onChange }) {
  const { hour12, minute, pm } = parseTime(value);

  // Functional update, NOT a value computed from the props on this render:
  // two taps that land in one React batch would otherwise both read the same
  // stale time and the second would overwrite the first rather than add to
  // it — which is exactly what four fast jabs at a stepper look like. Same
  // reasoning as HubPinPad's digit entry.
  const bump = (fn) =>
    onChange((prev) => {
      const p = parseTime(prev);
      const next = fn(p);
      return buildTime(next.hour12, next.minute, next.pm);
    });

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8 }}>
        <Stepper
          label="Hour"
          display={hour12}
          onDown={() => bump((p) => ({ ...p, hour12: p.hour12 === 1 ? 12 : p.hour12 - 1 }))}
          onUp={() => bump((p) => ({ ...p, hour12: p.hour12 === 12 ? 1 : p.hour12 + 1 }))}
        />
        <Stepper
          label="Min"
          display={String(minute).padStart(2, "0")}
          onDown={() => bump((p) => ({ ...p, minute: (p.minute + 60 - MINUTE_STEP) % 60 }))}
          onUp={() => bump((p) => ({ ...p, minute: (p.minute + MINUTE_STEP) % 60 }))}
        />
        <View style={{ width: 62, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, backgroundColor: "#fff", overflow: "hidden" }}>
          {[false, true].map((isPm) => (
            <PressFade
              key={isPm ? "PM" : "AM"}
              onPress={() => bump((p) => ({ ...p, pm: isPm }))}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: pm === isPm ? colors.primary : "transparent" }}
            >
              <Text
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 13, color: pm === isPm ? "#fff" : colors.muted }}
              >
                {isPm ? "PM" : "AM"}
              </Text>
            </PressFade>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 7, marginTop: 8 }}>
        {TIME_PRESETS.map((t) => {
          const active = t === String(value ?? "").slice(0, 5);
          return (
            <PressFade
              key={t}
              onPress={() => onChange(t)}
              style={{
                flex: 1,
                alignItems: "center",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? "#ead9cd" : CARD_BORDER,
                backgroundColor: active ? TINT_BG : "#fff",
                paddingVertical: 7,
              }}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: active ? colors.primaryOnWhite : "#78716c" }}
              >
                {formatTimeLabel(t)}
              </Text>
            </PressFade>
          );
        })}
      </View>
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

// Asked BEFORE the roster rather than at finalize: the tray has to say what
// it is collecting into from the very first client, or "2 staged" is
// ambiguous until the end.
export function StageWhenSheet({ visible, onClose, onCreate, busy }) {
  const [date, setDate] = useState(DATE_OPTIONS[0]?.value ?? "");
  const [time, setTime] = useState("05:00");
  const [title, setTitle] = useState("");

  return (
    <SheetShell visible={visible} onClose={onClose} label="Close staging setup">
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>Stage a session</Eyebrow>
        <Text maxFontSizeMultiplier={1.1} style={{ marginTop: 4, fontFamily: fonts.display, fontSize: 23, color: INK }}>
          When is it?
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 3, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
          The board offers a staged session on the morning it's for, so tonight's work is waiting at 5am.
        </Text>

        <View style={{ marginTop: 16 }}>
          <WhenField options={DATE_OPTIONS} value={date} onChange={setDate} label="Day" />
        </View>
        <View style={{ marginTop: 9 }}>
          <TimeStepper value={time} onChange={setTime} />
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

        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
          <PressFade onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.muted }}>
              Cancel
            </Text>
          </PressFade>
          <PrimaryButton
            label={busy ? "Starting…" : "Start staging"}
            disabled={busy || !date || !time}
            onPress={() => onCreate({ scheduledDate: date, scheduledTime: time, title: title.trim() || null })}
          />
        </View>
      </View>
    </SheetShell>
  );
}

/* ------------------------------------------------------------------ the bar */

export function StageTrayBar({ staged, onPress }) {
  const insets = useSafeAreaInsets();
  const count = staged?.clients?.length ?? 0;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}
    >
      <PressFade
        onPress={onPress}
        accessibilityLabel="Review staged session"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: ESPRESSO,
          borderRadius: 14,
          paddingVertical: 13,
          paddingHorizontal: 16,
          shadowColor: "#2a211c",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.8, color: ESPRESSO_SUB, textTransform: "uppercase" }}
          >
            Staging
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ marginTop: 1, fontFamily: fonts.sansBold, fontSize: 14.5, color: ESPRESSO_TEXT }}>
            {describeWhen(staged)}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: ESPRESSO_TEXT }}>
          {count === 0 ? "Nobody yet" : `${count} staged`}
        </Text>
        <Ionicons name="chevron-up" size={16} color={ESPRESSO_SUB} />
      </PressFade>
    </View>
  );
}

/* ---------------------------------------------------------------- the sheet */

function StagedClientRow({ client, first, onRemove }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: ROW_DIVIDER,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
          {client.client_name}
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 1, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
          Session {client.session_number}
        </Text>
      </View>
      <PressFade onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${client.client_name}`} style={{ padding: 4 }}>
        <Ionicons name="close" size={17} color="#a8a29e" />
      </PressFade>
    </View>
  );
}

export function StageTraySheet({ visible, staged, onClose, onRemove, onFinalize, onDiscard, onChangeWhen, busy }) {
  const clients = staged?.clients ?? [];
  const finalized = Boolean(staged?.finalized_at);
  const [editingWhen, setEditingWhen] = useState(false);
  const [date, setDate] = useState(staged?.scheduled_date ?? "");
  const [time, setTime] = useState((staged?.scheduled_time ?? "").slice(0, 5));

  const openWhenEditor = () => {
    setDate(staged?.scheduled_date ?? "");
    setTime((staged?.scheduled_time ?? "").slice(0, 5));
    setEditingWhen(true);
  };

  return (
    <SheetShell visible={visible} onClose={onClose} label="Close staged session">
      <View style={{ paddingHorizontal: 20 }}>
        <Eyebrow>{finalized ? "Staged · on the board" : "Staging"}</Eyebrow>

        {editingWhen ? (
          <View style={{ marginTop: 8 }}>
            <WhenField options={DATE_OPTIONS} value={date} onChange={setDate} label="Day" />
            <View style={{ marginTop: 9 }}>
              <TimeStepper value={time} onChange={setTime} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
              <PressFade
                onPress={() => {
                  onChangeWhen({ scheduled_date: date, scheduled_time: time });
                  setEditingWhen(false);
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 9 }}
              >
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>
                  Save time
                </Text>
              </PressFade>
            </View>
          </View>
        ) : (
          <PressFade onPress={openWhenEditor} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 23, color: INK }}>
              {describeWhen(staged)}
            </Text>
            <Ionicons name="pencil" size={13} color={colors.muted} />
          </PressFade>
        )}

        {staged?.title ? (
          <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
            {staged.title}
          </Text>
        ) : null}

        <View style={{ marginTop: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, paddingHorizontal: 14 }}>
          {clients.length === 0 ? (
            <Text maxFontSizeMultiplier={1.15} style={{ paddingVertical: 16, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.muted }}>
              Nobody staged yet. Tap a client on the roster, pick the session she's doing, and add it from there.
            </Text>
          ) : (
            clients.map((c, i) => (
              <StagedClientRow key={c.id} client={c} first={i === 0} onRemove={() => onRemove(c.user_id)} />
            ))
          )}
        </View>

        {clients.length >= 4 ? (
          <View style={{ marginTop: 10, backgroundColor: TINT_BG, borderWidth: 1, borderColor: TINT_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#7a5c49" }}>
              That's four — the board holds four columns.
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }}>
          <PressFade onPress={onDiscard} style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#b23a22" }}>
              Discard
            </Text>
          </PressFade>
          {finalized ? (
            <PrimaryButton label="Done" onPress={onClose} disabled={busy} />
          ) : (
            <PrimaryButton
              label={busy ? "Saving…" : clients.length === 0 ? "Finalize" : `Finalize (${clients.length})`}
              onPress={onFinalize}
              disabled={busy || clients.length === 0}
            />
          )}
        </View>

        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: type.eyebrow, lineHeight: 16, color: colors.muted, textAlign: "center" }}>
          {finalized
            ? "Waiting on the board. You can still add or drop anyone until it starts."
            : "Finalizing puts it on the board for that morning. You can still change it after."}
        </Text>
      </View>
    </SheetShell>
  );
}
