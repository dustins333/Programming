import { View, Text, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { PressFade } from "../PressFade";
import { NEON } from "./neon";
import { fonts } from "../../lib/theme";

// The black screen every Benchmark Day view sits on, and the back row they all
// share. Extracted so the three screens cannot drift on padding or on which
// direction the chevron points.
//
// StatusBar is forced light here: the member app runs a dark status bar over
// its cream canvas, and expo-status-bar's last-mounted instance wins, so each
// neon screen flips it while it is up and the tab screens flip it back.

export function NeonScreen({ insets, children, scroll = true, contentStyle }) {
  const padding = {
    paddingTop: (insets?.top ?? 0) + 14,
    paddingHorizontal: 18,
    paddingBottom: (insets?.bottom ?? 0) + 30,
  };

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: NEON.ground, ...padding, ...contentStyle }}>
        <StatusBar style="light" />
        {children}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NEON.ground }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1, backgroundColor: NEON.ground }}
        contentContainerStyle={{ ...padding, ...contentStyle }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function BackRow({ label, onPress, right = null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <PressFade
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${label}`}
        style={{ height: 44, justifyContent: "center", flexShrink: 1 }}
      >
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: NEON.ink62 }}
        >
          {"‹ "}
          {label}
        </Text>
      </PressFade>
      {right}
    </View>
  );
}
