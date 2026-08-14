import { useEffect, useRef } from "react";
import { View, Text, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { fonts } from "../lib/theme";

// Which reference the grey "shadow" value in every not-yet-logged reps/weight
// box comes from, and the one place its colour is defined.
//
// Before this there was no choice: the ghost was last time's matching set,
// falling back to the coach's programmed reps only when there was no history
// — so a member working to a new prescription had no way to see what she was
// actually being asked for. The two references are different questions ("what
// am I aiming for" vs "what did I do"), so this makes it a real switch.
//
// The colour is the point of the pairing: the thumb and the ghost text are
// the same hue, so the boxes visibly answer "where are these numbers coming
// from" without a legend. Clay is the app's brand/target colour; olive is
// what it already uses everywhere for something already done, which is
// exactly what "last time" is.
export const GHOST_MODES = {
  this: { key: "this", label: "This time", color: "#a46a57", ghost: "#d5b0a1" },
  last: { key: "last", label: "Last time", color: "#4d6142", ghost: "#a3b795" },
};

export const ghostTint = (mode) => (GHOST_MODES[mode] ?? GHOST_MODES.last).ghost;

const ORDER = ["this", "last"];
const SEG_W = 74;
const SEG_H = 24;
const PAD = 3;

export function GhostSourceToggle({ mode = "last", onChange }) {
  const index = Math.max(0, ORDER.indexOf(mode));
  // Seeded at the right position so the very first frame is already correct
  // (and so the control still reads properly anywhere the animation loop
  // doesn't run at all).
  const slide = useRef(new Animated.Value(index)).current;
  const active = GHOST_MODES[ORDER[index]];

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, slide]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-end" }}>
      <Ionicons name="eye-outline" size={13} color="#c0b9b0" />
      <Text
        maxFontSizeMultiplier={1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 1.1, color: "#b5afa6" }}
      >
        SHADOW
      </Text>

      <View
        style={{
          flexDirection: "row",
          padding: PAD,
          borderRadius: 999,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#ece7e1",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            top: PAD,
            left: PAD,
            width: SEG_W,
            height: SEG_H,
            borderRadius: 999,
            backgroundColor: active.color,
            transform: [
              { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, SEG_W] }) },
            ],
          }}
        />
        {ORDER.map((key) => {
          const on = key === active.key;
          return (
            <PressFade
              key={key}
              onPress={() => onChange?.(key)}
              accessibilityLabel={`Show ${GHOST_MODES[key].label.toLowerCase()} in the empty boxes`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={{ width: SEG_W, height: SEG_H, alignItems: "center", justifyContent: "center" }}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                style={{
                  fontFamily: fonts.sansBold,
                  fontSize: 10.5,
                  color: on ? "#fff" : "#a8a29e",
                }}
              >
                {GHOST_MODES[key].label}
              </Text>
            </PressFade>
          );
        })}
      </View>
    </View>
  );
}
