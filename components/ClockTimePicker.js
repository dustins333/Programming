import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";

// A real clock face for picking a time, because the thing it replaces was a
// pair of +/- steppers and getting from 12:00 to 5:00 was five jabs.
//
// Tap an hour, the face turns into minutes, tap a quarter. The result fills
// the HH : MM boxes underneath, and either box takes you back to that half of
// the face — so a wrong hour costs one tap, not a restart.
//
// MINUTES ARE QUARTERS ONLY. Every consumer of a staged time runs on a
// 15-minute cadence, so offering :07 would be a promise nothing keeps. The
// other eight five-minute ticks are still drawn, because a clock face with
// four marks on it doesn't read as a clock.
//
// No SVG. react-native-svg's web build turns `onPress` on a child element
// into RN touch-responder props that aren't real DOM attributes (it threw
// "Unknown event handler property 'onResponderTerminate'" the last time
// something in this app tried it), and a face is only circles and text.

const FACE = 216;
const CENTER = FACE / 2;
const R_NUM = 84; // to the centre of each number
const R_TICK = 100;
const TARGET = 38;
const HAND_W = 2.5;

// Long enough to watch the hour fill in and the hand swing to it before the
// face is swapped out from under you. Deliberately short: at twice this it
// read as the picker hanging rather than as a beat.
const FACE_SWAP_MS = 220;

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

const FACE_BG = "#fdf6f2";
const FACE_BORDER = "#f0ddd2";
const CARD_BORDER = "#ece7e1";
const INK = "#2a211c";

// Clockwise from 12. Every position on the face comes through here so the
// hand and the labels cannot disagree about where a value lives.
function pointAt(angleDeg, radius) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(a), y: CENTER - radius * Math.cos(a) };
}

export function parseTime(value) {
  const [h, m] = String(value ?? "05:00")
    .slice(0, 5)
    .split(":")
    .map((n) => parseInt(n, 10));
  const hour = Number.isFinite(h) ? h : 5;
  const minute = Number.isFinite(m) ? m : 0;
  return { hour12: hour % 12 === 0 ? 12 : hour % 12, minute, pm: hour >= 12 };
}

export function buildTime(hour12, minute, pm) {
  const h24 = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------- face */

function FaceButton({ label, angle, selected, onPress, accessibilityLabel }) {
  const { x, y } = pointAt(angle, R_NUM);
  return (
    <PressFade
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={{
        position: "absolute",
        left: x - TARGET / 2,
        top: y - TARGET / 2,
        width: TARGET,
        height: TARGET,
        borderRadius: TARGET / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.primary : "transparent",
      }}
    >
      <Text
        maxFontSizeMultiplier={1}
        style={{ fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 15, color: selected ? "#fff" : INK }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

function Face({ mode, hour12, minute, onPickHour, onPickMinute }) {
  // The hand points at whatever the face is currently asking for.
  const angle = mode === "hour" ? hour12 * 30 : minute * 6;

  return (
    <View
      style={{
        width: FACE,
        height: FACE,
        borderRadius: CENTER,
        backgroundColor: FACE_BG,
        borderWidth: 1,
        borderColor: FACE_BORDER,
        alignSelf: "center",
      }}
    >
      {/* Ticks and hand sit under the buttons and must never eat a tap. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const { x, y } = pointAt(i * 30, R_TICK);
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: x - 1.5,
                top: y - 1.5,
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: "#e0cfc4",
              }}
            />
          );
        })}

        {/* Full-height column centred on the face, so rotating it turns the
            bar about the clock's centre — RN has no dependable
            transform-origin, and this needs none. The bar occupies only the
            half above centre, so 0deg points at 12. */}
        <View
          style={{
            position: "absolute",
            left: CENTER - HAND_W / 2,
            top: 0,
            width: HAND_W,
            height: FACE,
            alignItems: "center",
            transform: [{ rotate: `${angle}deg` }],
          }}
        >
          <View
            style={{
              marginTop: CENTER - R_NUM,
              width: HAND_W,
              height: R_NUM,
              borderRadius: HAND_W,
              backgroundColor: colors.primary,
            }}
          />
        </View>

        <View
          style={{
            position: "absolute",
            left: CENTER - 4,
            top: CENTER - 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.primary,
          }}
        />
      </View>

      {mode === "hour"
        ? HOURS.map((h) => (
            <FaceButton
              key={h}
              label={String(h)}
              angle={h * 30}
              selected={hour12 === h}
              onPress={() => onPickHour(h)}
              accessibilityLabel={`${h} o'clock`}
            />
          ))
        : MINUTES.map((m) => (
            <FaceButton
              key={m}
              label={String(m).padStart(2, "0")}
              angle={m * 6}
              selected={minute === m}
              onPress={() => onPickMinute(m)}
              accessibilityLabel={`${m} minutes past`}
            />
          ))}
    </View>
  );
}

/* ------------------------------------------------------------------ digits */

function DigitBox({ text, active, onPress, accessibilityLabel }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={{
        minWidth: 62,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: active ? 2 : 1,
        borderColor: active ? colors.primary : CARD_BORDER,
        backgroundColor: active ? FACE_BG : "#fff",
        alignItems: "center",
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 26, color: active ? colors.primaryOnWhite : INK }}>
        {text}
      </Text>
    </PressFade>
  );
}

export function ClockTimePicker({ value, onChange, resetKey }) {
  const { hour12, minute, pm } = parseTime(value);
  const [mode, setMode] = useState("hour");
  const swapTimer = useRef(null);

  // Every mode change goes through here, so a pending swap can never land on
  // top of a coach who has since tapped a digit box to go somewhere else —
  // and tapping a second hour restarts the wait rather than queueing another.
  const goToMode = (next) => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = null;
    setMode(next);
  };

  useEffect(() => () => swapTimer.current && clearTimeout(swapTimer.current), []);

  // Back to hours when the host says this is a fresh use of the picker. It
  // lives inside a Modal, which keeps its children mounted while hidden, so
  // without this a sheet reopened after picking minutes greets the coach with
  // the minute face and the first tap changes the wrong half.
  useEffect(() => {
    goToMode("hour");
    // goToMode is stable enough for this: it only ever reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Functional, NOT computed from this render's props: picking an hour and
  // then a minute fast enough to land in one React batch would otherwise have
  // the second tap read the pre-hour value and undo the first.
  const set = (fn) =>
    onChange((prev) => {
      const p = parseTime(prev);
      const next = fn(p);
      return buildTime(next.hour12, next.minute, next.pm);
    });

  const pickHour = (h) => {
    set((p) => ({ ...p, hour12: h }));
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => {
      swapTimer.current = null;
      setMode("minute");
    }, FACE_SWAP_MS);
  };

  return (
    <View>
      <Face
        mode={mode}
        hour12={hour12}
        minute={minute}
        onPickHour={pickHour}
        onPickMinute={(m) => set((p) => ({ ...p, minute: m }))}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
        <DigitBox
          text={String(hour12)}
          active={mode === "hour"}
          onPress={() => goToMode("hour")}
          accessibilityLabel="Change the hour"
        />
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 24, color: colors.muted }}>
          :
        </Text>
        <DigitBox
          text={String(minute).padStart(2, "0")}
          active={mode === "minute"}
          onPress={() => goToMode("minute")}
          accessibilityLabel="Change the minutes"
        />
        <View style={{ marginLeft: 6, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, overflow: "hidden" }}>
          {[false, true].map((isPm) => (
            <PressFade
              key={isPm ? "PM" : "AM"}
              onPress={() => set((p) => ({ ...p, pm: isPm }))}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                alignItems: "center",
                backgroundColor: pm === isPm ? colors.primary : "transparent",
              }}
            >
              <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: pm === isPm ? "#fff" : colors.muted }}>
                {isPm ? "PM" : "AM"}
              </Text>
            </PressFade>
          ))}
        </View>
      </View>

    </View>
  );
}
