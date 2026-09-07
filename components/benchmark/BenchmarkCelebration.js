import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View, Text, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { PressFade } from "../PressFade";
import { FinalizeConfetti } from "../FinalizeConfetti";
import { NeonText } from "./NeonText";
import { NEON, glow } from "./neon";
import { LIFTS, compareEntries, unitLabel } from "../../lib/programming/benchmark";
import { fonts } from "../../lib/theme";

// The one place in the app that celebrates. Everything else here is
// deliberately calm; Benchmark Day happens four times a year and is the whole
// point of the neon board, so it gets the flash, the confetti and the 96px
// number.
//
// The emphasis rule holds throughout: the number she actually did is the hero,
// the tier is supporting. That was a deliberate call in the handoff — celebrate
// the work, not the bucket.

const USE_NATIVE_DRIVER = Platform.OS !== "web";

export function BenchmarkCelebration({ eventName, movement, entry, lastEntry, allDone, onDismiss }) {
  const lift = LIFTS[movement];
  const delta = compareEntries(movement, entry, lastEntry);
  const { width, height } = useWindowDimensions();

  // Radial burst behind everything. react-native-svg rather than a CSS
  // gradient so native and web produce the same shape.
  const flash = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(flash, { toValue: 0, duration: 970, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: USE_NATIVE_DRIVER }).start();
    Animated.timing(rise, { toValue: 1, duration: 500, delay: 180, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [flash, pop, rise]);


  return (
    <View style={{ flex: 1, backgroundColor: NEON.ground, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
      <StatusBar style="light" />

      <Animated.View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }}
      >
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="benchmarkFlash" cx="50%" cy="42%" r="62%">
              <Stop offset="0" stopColor={`rgb(${lift.rgb})`} stopOpacity={0.5} />
              <Stop offset="1" stopColor={`rgb(${lift.rgb})`} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill="url(#benchmarkFlash)" />
        </Svg>
      </Animated.View>

      {/* In front of the content, per the design — the pieces pass over the
          number rather than behind it. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, overflow: "hidden" }}>
        <FinalizeConfetti
          runKey={`${movement}:${entry?.completedAt ?? ""}`}
          pieceCount={38}
          distance={height + 80}
          fallMinMs={1500}
          fallMaxMs={2800}
          staggerMs={700}
          colors={[lift.color, NEON.mint, "#ffffff", lift.color]}
        />
      </View>

      <Animated.View
        style={{
          alignItems: "center",
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}
      >
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1.9, color: NEON.ink55, textAlign: "center" }}
        >
          {eventName.toUpperCase()} BENCHMARK
        </Text>
        <NeonText size={34} color="#fff" glow={false} style={{ marginTop: 8 }}>
          {lift.name}
        </NeonText>
        <NeonText
          size={124}
          lineHeight={107}
          color={lift.color}
          rgb={lift.rgb}
          core={26}
          coreAlpha={0.75}
          halo={70}
          haloAlpha={0.4}
          style={{ marginTop: 4 }}
        >
          {entry?.value || "–"}
        </NeonText>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.8, color: NEON.ink5, marginTop: 6, textAlign: "center" }}
        >
          {unitLabel(movement, entry).toUpperCase()}
        </Text>
      </Animated.View>

      <Animated.View
        style={{
          alignItems: "center",
          marginTop: 22,
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}
      >
        {/* Always the LIFT colour, never mint — checked against the
            prototype rather than inferred from the palette note. Mint is the
            "this improved" colour on the shareable card's delta line; here the
            pill is the movement's own, whatever the result was. */}
        <View
          style={{
            maxWidth: 300,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: lift.color,
            paddingHorizontal: 18,
            paddingVertical: 10,
          }}
        >
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              fontFamily: fonts.sansBold,
              fontSize: 12,
              lineHeight: 17,
              textAlign: "center",
              color: lift.color,
            }}
          >
            {delta.text}
          </Text>
        </View>

        <PressFade
          onPress={onDismiss}
          accessibilityRole="button"
          style={{
            marginTop: 26,
            height: 52,
            minWidth: 216,
            borderRadius: 999,
            paddingHorizontal: 26,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            // Both CTAs are the mint primary. The label is the only thing
            // that differs, because the choice it offers is the only thing
            // that differs.
            backgroundColor: NEON.mint,
            ...glow(NEON.mintRgb, { radius: 28, opacity: 0.5 }),
          }}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: NEON.inkOnNeon }}>
            {allDone ? "See my results" : "Next movement"}
          </Text>
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: NEON.inkOnNeon, opacity: 0.55 }}>
            ›
          </Text>
        </PressFade>
      </Animated.View>
    </View>
  );
}
