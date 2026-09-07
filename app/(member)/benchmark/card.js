import { useEffect, useRef, useState } from "react";
import { Animated, Platform, View, Text, Image, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PressFade } from "../../../components/PressFade";
import { FinalizeConfetti } from "../../../components/FinalizeConfetti";
import { NeonText, neonTextShadow } from "../../../components/benchmark/NeonText";
import { NEON, glow, rgba } from "../../../components/benchmark/neon";
import { BackRow, NeonScreen } from "../../../components/benchmark/BenchmarkChrome";
import { LIFTS, MOVEMENTS, tierUnit, getNextBenchmarkEvent } from "../../../lib/programming/benchmark";
import { useBenchmark } from "../../../lib/programming/useBenchmark";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { daysBetween, todayInBoise } from "../../../lib/boiseDate";
import { fonts } from "../../../lib/theme";

// Her card. The one thing in this feature meant to leave the app — it is
// designed to be screenshot-clean, which is also why nothing sits on top of it
// except the confetti.
//
// The gym has one location, and the board it mirrors says IDAHO FALLS on it.

const USE_NATIVE_DRIVER = Platform.OS !== "web";
const LOCATION = "IDAHO FALLS";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function BenchmarkCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { height } = useWindowDimensions();
  const { status, event, board } = useBenchmark();
  const [next, setNext] = useState(null);

  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [pop]);

  // Its own try/catch: a missing next benchmark just drops one line, and must
  // never take down the card she came here to look at.
  useEffect(() => {
    if (!event) return;
    let alive = true;
    getNextBenchmarkEvent(event)
      .then((e) => alive && setNext(e))
      .catch(() => alive && setNext(null));
    return () => {
      alive = false;
    };
  }, [event]);

  if (status === "loading") {
    return (
      <NeonScreen insets={insets}>
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={NEON.mint} />
        </View>
      </NeonScreen>
    );
  }

  if (status !== "ready") {
    return (
      <NeonScreen insets={insets}>
        <BackRow label="Benchmark Day" onPress={() => router.replace("/(member)/benchmark")} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: NEON.ink62, marginTop: 24 }}>
          Couldn't load your results.
        </Text>
      </NeonScreen>
    );
  }

  const firstName = (profile?.name ?? "").trim().split(/\s+/)[0] || "You";

  return (
    <NeonScreen insets={insets}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, overflow: "hidden" }}>
        <FinalizeConfetti
          runKey={`card:${event.id}`}
          pieceCount={38}
          distance={height + 80}
          fallMinMs={1500}
          fallMaxMs={2800}
          staggerMs={700}
          colors={[LIFTS.pull.color, LIFTS.push.color, LIFTS.squat.color, NEON.mint]}
        />
      </View>

      <BackRow label="Benchmark Day" onPress={() => router.replace("/(member)/benchmark")} />

      <Animated.View
        style={{
          borderRadius: 24,
          borderWidth: 1.5,
          borderColor: rgba(NEON.mintRgb, 0.35),
          backgroundColor: NEON.cardDeep,
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: 20,
          marginTop: 4,
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{
                fontFamily: fonts.sansBold,
                fontSize: 9.5,
                letterSpacing: 1.5,
                color: NEON.mint,
                ...neonTextShadow(NEON.mintRgb, { core: 10, coreAlpha: 0.6 }),
              }}
            >
              {event.name.toUpperCase()} BENCHMARK
            </Text>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: NEON.ink42, marginTop: 4 }}
            >
              {longDate(event.benchmark_day)} | {LOCATION}
            </Text>
          </View>
          <Image
            source={require("../../../assets/kova-logo.jpg")}
            style={{ width: 78, height: 78, borderRadius: 39 }}
          />
        </View>

        <NeonText
          size={42}
          lineHeight={40}
          color="#fff"
          rgb="255,255,255"
          core={20}
          coreAlpha={0.3}
          numberOfLines={1}
          style={{ marginTop: 12 }}
        >
          {firstName}
        </NeonText>
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink55, marginTop: 4, marginBottom: 16 }}
        >
          Three tests. You vs you.
        </Text>

        <View style={{ flexDirection: "row", gap: 9 }}>
          {MOVEMENTS.map((m) => {
            const lift = LIFTS[m];
            const entry = board[m];
            const logged = !!entry?.tier;
            return (
              <View
                key={m}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: logged ? rgba(lift.rgb, 0.45) : NEON.borderSoft,
                  backgroundColor: "rgba(255,255,255,.02)",
                  paddingHorizontal: 8,
                  paddingTop: 13,
                  paddingBottom: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.05}
                  numberOfLines={1}
                  style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.8, color: NEON.ink5 }}
                >
                  {lift.name.toUpperCase()}
                </Text>
                <NeonText
                  size={44}
                  color={logged ? lift.color : NEON.ink28}
                  rgb={lift.rgb}
                  glow={logged}
                  core={14}
                  coreAlpha={0.6}
                  style={{ marginTop: 6 }}
                >
                  {logged ? entry.value || "–" : "–"}
                </NeonText>
                <Text
                  maxFontSizeMultiplier={1.05}
                  style={{
                    fontFamily: fonts.sansBold,
                    fontSize: 9,
                    letterSpacing: 0.5,
                    lineHeight: 12,
                    textAlign: "center",
                    color: NEON.ink42,
                    marginTop: 6,
                  }}
                >
                  {logged ? tileUnit(m, entry) : "NOT LOGGED"}
                </Text>
              </View>
            );
          })}
        </View>

        <View
          style={{
            marginTop: 18,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,.1)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text
            maxFontSizeMultiplier={1.05}
            style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1.2, color: "rgba(247,243,238,.4)" }}
          >
            KOVA STRENGTH
          </Text>
          <Text
            maxFontSizeMultiplier={1.05}
            style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1.2, color: NEON.mint }}
          >
            ALWAYS IN PROGRESS
          </Text>
        </View>
      </Animated.View>

      {/* The design's primary is "Save to photos". There is no rasterizer in
          this app — react-native-view-shot is a native dependency, and every
          real user is on the installed PWA where a native module never
          arrives. So the button says what it actually does. The card above is
          built to be screenshot-clean for exactly this reason, the same way
          the coach's photo-compare board is. */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <View
          style={{
            flex: 1,
            height: 50,
            borderRadius: 14,
            backgroundColor: NEON.mint,
            alignItems: "center",
            justifyContent: "center",
            ...glow(NEON.mintRgb, { radius: 22, opacity: 0.4 }),
          }}
        >
          <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: NEON.inkOnMint }}>
            Screenshot my results
          </Text>
        </View>
        <PressFade
          onPress={() => router.replace("/(member)")}
          accessibilityRole="button"
          style={{
            width: 108,
            height: 50,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,.2)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: NEON.ink }}>
            Done
          </Text>
        </PressFade>
      </View>

      {next ? (
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink42, textAlign: "center", marginTop: 14 }}
        >
          Next Benchmark Day is {next.name}, in {weeksAway(next.benchmark_day)}.
        </Text>
      ) : null}
    </NeonScreen>
  );
}

function tileUnit(movement, entry) {
  const unit = tierUnit(movement, entry.tier).toUpperCase();
  if (LIFTS[movement].load && entry.load) return `${unit} | ${entry.load} LB`;
  return unit;
}

// "SEP 6, 2026" — string arithmetic on the ISO date, never through `new Date`,
// which reads a plain YYYY-MM-DD as UTC midnight and can land a day early in
// Boise.
function longDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function weeksAway(iso) {
  const days = daysBetween(iso, todayInBoise());
  if (days <= 0) return "days";
  const weeks = Math.round(days / 7);
  if (weeks < 1) return `${days} day${days === 1 ? "" : "s"}`;
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}
