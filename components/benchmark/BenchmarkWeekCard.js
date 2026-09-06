import { View, Text } from "react-native";
import { PressFade } from "../PressFade";
import { NeonText, neonTextShadow } from "./NeonText";
import { NEON, glow, rgba } from "./neon";
import { LIFTS, MOVEMENTS, tierUnit } from "../../lib/programming/benchmark";
import { fonts } from "../../lib/theme";

// The one way into Benchmark Day. Lives on My Week between the hero and YOUR
// WEEK, under its own THIS QUARTER eyebrow, and which of the three states
// shows is entirely the coach's three dates — see benchmarkPhase().
//
// It is black in a cream app on purpose. Benchmark Day is four days a year and
// it should not look like the seven other cards on this screen.

function Eyebrow({ name }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      numberOfLines={1}
      style={{
        fontFamily: fonts.sansBold,
        fontSize: 10,
        letterSpacing: 1.5,
        color: NEON.mint,
        flexShrink: 1,
        ...neonTextShadow(NEON.mintRgb, { core: 10, coreAlpha: 0.7 }),
      }}
    >
      {name.toUpperCase()} BENCHMARK
    </Text>
  );
}

const CARD = {
  backgroundColor: NEON.ground,
  borderRadius: 22,
  overflow: "hidden",
  marginBottom: 22,
};

export function BenchmarkWeekCard({ phase, event, board, daysOut, onOpen }) {
  if (phase === "countdown") {
    return (
      <PressFade
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${event.name} Benchmark, ${daysLabel(daysOut).toLowerCase()}`}
        style={{ ...CARD, borderWidth: 1.5, borderColor: "#2a2a2a", padding: 18, paddingBottom: 17 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Eyebrow name={event.name} />
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: NEON.ink5 }}
          >
            {daysLabel(daysOut)}
          </Text>
        </View>
        <NeonText
          size={33}
          color="#fff"
          rgb={LIFTS.pull.rgb}
          core={16}
          coreAlpha={0.55}
          halo={42}
          haloAlpha={0.3}
          style={{ marginTop: 11, marginBottom: 6 }}
        >
          Benchmark Day
        </NeonText>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink62 }}>
          You've been training. Now let's see it.
        </Text>
        {/* The three movements, in board order. Four days a year this is the
            only thing on the card that says what is coming. */}
        <View style={{ flexDirection: "row", gap: 7, marginTop: 15 }}>
          {MOVEMENTS.map((m) => (
            <View
              key={m}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 999,
                backgroundColor: LIFTS[m].color,
                ...glow(LIFTS[m].rgb, { radius: 12, opacity: 0.8 }),
              }}
            />
          ))}
        </View>
      </PressFade>
    );
  }

  if (phase === "live") {
    return (
      <PressFade
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Benchmark Day is today. Open the board."
        style={{
          ...CARD,
          borderWidth: 1.5,
          borderColor: LIFTS.pull.color,
          padding: 18,
          ...glow(LIFTS.pull.rgb, { radius: 18, opacity: 0.28 }),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Eyebrow name={event.name} />
          <View style={{ backgroundColor: NEON.mint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text
              maxFontSizeMultiplier={1}
              style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#000" }}
            >
              TODAY
            </Text>
          </View>
        </View>
        <NeonText
          size={36}
          color="#fff"
          rgb={LIFTS.pull.rgb}
          core={16}
          coreAlpha={0.6}
          halo={44}
          haloAlpha={0.32}
          style={{ marginTop: 11, marginBottom: 6 }}
        >
          You vs You
        </NeonText>
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink62, marginBottom: 16 }}
        >
          Pull Ups | Push Ups | Squats
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: LIFTS.pull.color,
            borderRadius: 14,
            height: 48,
            paddingLeft: 16,
            paddingRight: 8,
            ...glow(LIFTS.pull.rgb, { radius: 22, opacity: 0.45 }),
          }}
        >
          <Text
            maxFontSizeMultiplier={1.15}
            style={{ fontFamily: fonts.sansBold, fontSize: 14, color: NEON.inkOnPink }}
          >
            Let's Do This
          </Text>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: "rgba(0,0,0,.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: NEON.inkOnPink }}>
              ›
            </Text>
          </View>
        </View>
      </PressFade>
    );
  }

  // Results. Tapping it opens her card rather than the board — the board is
  // read-only by now and the card is the thing she wants to look at again.
  const loggedCount = MOVEMENTS.filter((m) => board?.[m]?.completedAt).length;
  return (
    <PressFade
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="See your benchmark card"
      style={{ ...CARD, borderWidth: 1.5, borderColor: "#2a2a2a", padding: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Eyebrow name={event.name} />
        <View
          style={{
            borderWidth: 1,
            borderColor: rgba(NEON.mintRgb, 0.45),
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text
            maxFontSizeMultiplier={1}
            style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: NEON.mint }}
          >
            {loggedCount}/3 LOGGED
          </Text>
        </View>
      </View>
      <NeonText size={30} color="#fff" glow={false} style={{ marginTop: 11, marginBottom: 12 }}>
        Benchmark Data
      </NeonText>
      {/* Fixed height with the three parts pushed apart, so the neon numbers
          land on one line whether the label above them wraps or not. */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "stretch" }}>
        {MOVEMENTS.map((m) => {
          const lift = LIFTS[m];
          const entry = board?.[m];
          const logged = !!entry?.tier;
          return (
            <View
              key={m}
              style={{
                flex: 1,
                height: 104,
                borderWidth: 1,
                borderColor: logged ? rgba(lift.rgb, 0.4) : NEON.borderSoft,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 9,
                justifyContent: "space-between",
              }}
            >
              <Text
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.9, color: NEON.ink5 }}
              >
                {lift.name.toUpperCase()}
              </Text>
              <NeonText
                size={26}
                color={logged ? lift.color : NEON.ink28}
                rgb={lift.rgb}
                glow={logged}
                core={14}
                coreAlpha={0.6}
              >
                {logged ? entry.value || "–" : "–"}
              </NeonText>
              {/* Two lines are RESERVED whether the unit needs them or not.
                  With space-between, a bottom block that wraps pushes the
                  number above it up — measured 5px out when SEC ECCENTRIC
                  wrapped and REPS did not, which is exactly the misalignment
                  the fixed tile height is here to prevent. */}
              <Text
                maxFontSizeMultiplier={1}
                numberOfLines={2}
                style={{
                  fontFamily: fonts.sansBold,
                  fontSize: 8.5,
                  letterSpacing: 0.5,
                  lineHeight: 11,
                  height: 22,
                  color: NEON.ink42,
                }}
              >
                {logged ? resultUnit(m, entry) : "NOT LOGGED"}
              </Text>
            </View>
          );
        })}
      </View>
    </PressFade>
  );
}

function resultUnit(movement, entry) {
  const unit = tierUnit(movement, entry.tier).toUpperCase();
  if (LIFTS[movement].load && entry.load) return `${unit} | ${entry.load} LB`;
  return unit;
}

function daysLabel(days) {
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}
