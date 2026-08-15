import { forwardRef, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { PressFade } from "../PressFade";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { fonts } from "../../lib/theme";
import { FIELD_BG, FIELD_BORDER, FIELD_BORDER_FOCUS, FieldLabel, HINT_TEXT } from "./AuthChrome";

// A field sitting on the clay ground rather than on white: translucent
// fill, a hairline border that goes solid white on focus.

export const AuthField = forwardRef(function AuthField(
  { label, hint, secureToggle = false, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={style}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View
        style={{
          height: 54,
          borderRadius: 14,
          backgroundColor: FIELD_BG,
          borderWidth: focused ? 1.5 : 1,
          borderColor: focused ? FIELD_BORDER_FOCUS : FIELD_BORDER,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor="rgba(255,255,255,0.55)"
          selectionColor="#ffffff"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
          secureTextEntry={secureToggle ? !revealed : props.secureTextEntry}
          style={{
            flex: 1,
            // An <input> won't shrink below its intrinsic content width on
            // react-native-web without this, which shoves the Show toggle
            // out past the border (same failure as the sleep-unit field).
            minWidth: 0,
            height: "100%",
            color: "#fff",
            fontFamily: fonts.sans,
            // 16, not 15: iOS auto-zooms any focused field under 16px, and a
            // zoomed viewport is one WebKeyboardViewport deliberately won't
            // reflow (it can't tell that apart from a pinch). Belt-and-braces
            // with the maximum-scale pin there — this is the screen we know
            // was broken, so it should not depend on the meta trick landing.
            fontSize: 16,
          }}
        />
        {secureToggle ? (
          <PressFade
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={10}
            style={{ paddingLeft: 12 }}
          >
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "rgba(255,255,255,0.75)" }}
            >
              {revealed ? "Hide" : "Show"}
            </Text>
          </PressFade>
        ) : null}
      </View>
      {hint ? (
        <Text style={{ marginTop: 8, fontFamily: fonts.sans, fontSize: 11.5, color: HINT_TEXT }}>{hint}</Text>
      ) : null}
    </View>
  );
});

// Six boxes, one input.
//
// The boxes are display only — a single real TextInput sits invisibly on
// top of the whole row, so `autoComplete="one-time-code"` /
// `textContentType="oneTimeCode"` still land the SMS autofill exactly as
// they did on the single field this replaces (handoff requirement). Six
// separate inputs would each be a one-character field and break it.
export function CodeInput({ value, onChangeText, label = "CODE", length = 6, style }) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");

  return (
    <View style={style}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 60,
                borderRadius: 13,
                backgroundColor: FIELD_BG,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? FIELD_BORDER_FOCUS : "rgba(255,255,255,0.3)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansSemiBold, fontSize: 24, color: "#fff" }}
              >
                {digits[i] ?? ""}
              </Text>
            </View>
          );
        })}

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(next) => onChangeText(next.replace(/[^0-9]/g, "").slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          // Explicit, so babel/noAutofillPlugin.js leaves it alone — this is
          // the one field in the app that genuinely wants autofill.
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          maxLength={length}
          caretHidden
          accessibilityLabel={`${length}-digit code`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 60,
            opacity: 0,
            color: "transparent",
            fontSize: 24,
          }}
        />
      </View>
    </View>
  );
}
