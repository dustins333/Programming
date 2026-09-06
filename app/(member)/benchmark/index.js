import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PressFade } from "../../../components/PressFade";
import { NeonText, neonTextShadow } from "../../../components/benchmark/NeonText";
import { Kettlebell } from "../../../components/benchmark/Kettlebell";
import { NEON, glow, rgba } from "../../../components/benchmark/neon";
import { BackRow, NeonScreen } from "../../../components/benchmark/BenchmarkChrome";
import {
  LIFTS,
  MOVEMENTS,
  compareEntries,
  tierUnit,
  benchmarkPhase,
} from "../../../lib/programming/benchmark";
import { useBenchmark } from "../../../lib/programming/useBenchmark";
import { formatDateShort } from "../../../lib/formatDate";
import { fonts } from "../../../lib/theme";

// The board hub: the three movements, what she has logged, and the way into
// each one. It is the same three cards whether logging is open or closed —
// after benchmark day the bells are locked and this becomes a review screen,
// which is why the action reads REVIEW rather than OPEN once a movement is in.

export default function BenchmarkHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, event, board, last, loggingOpen, reload } = useBenchmark();

  if (status === "loading") {
    return (
      <NeonScreen insets={insets}>
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={NEON.mint} />
        </View>
      </NeonScreen>
    );
  }

  if (status === "error" || (status === "ready" && benchmarkPhase(event) === "none")) {
    return (
      <NeonScreen insets={insets}>
        <BackRow label="My week" onPress={() => router.replace("/(member)")} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: NEON.ink62, marginTop: 24 }}>
          {status === "error"
            ? "Couldn't load Benchmark Day."
            : "Benchmark Day isn't open right now."}
        </Text>
        {status === "error" ? (
          <PressFade
            onPress={reload}
            style={{
              marginTop: 16,
              alignSelf: "flex-start",
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: rgba(NEON.mintRgb, 0.45),
              paddingHorizontal: 18,
              paddingVertical: 11,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: NEON.mint }}>Try again</Text>
          </PressFade>
        ) : null}
      </NeonScreen>
    );
  }

  if (status === "none") {
    return (
      <NeonScreen insets={insets}>
        <BackRow label="My week" onPress={() => router.replace("/(member)")} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: NEON.ink62, marginTop: 24 }}>
          Benchmark Day isn't open right now.
        </Text>
      </NeonScreen>
    );
  }

  const done = MOVEMENTS.filter((m) => board[m]?.completedAt);
  const allDone = done.length === 3;

  return (
    <NeonScreen insets={insets}>
      <BackRow label="My week" onPress={() => router.replace("/(member)")} />

      <Text
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: 10,
          letterSpacing: 1.5,
          color: NEON.mint,
          marginTop: 6,
          ...neonTextShadow(NEON.mintRgb, { core: 10, coreAlpha: 0.6 }),
        }}
      >
        {event.name.toUpperCase()} BENCHMARK | {formatDateShort(event.benchmark_day).toUpperCase()}
      </Text>

      <NeonText
        size={44}
        lineHeight={42}
        color="#fff"
        rgb="255,255,255"
        core={18}
        coreAlpha={0.28}
        style={{ marginTop: 10, marginBottom: 8 }}
      >
        {"Benchmark\nDay"}
      </NeonText>

      <Text
        maxFontSizeMultiplier={1.2}
        style={{ fontFamily: fonts.sans, fontSize: 13, color: NEON.ink62, maxWidth: 300 }}
      >
        You vs You. Three movements.
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 18 }}>
        <View style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: NEON.trackRail, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${Math.round((done.length / 3) * 100)}%`,
              borderRadius: 999,
              backgroundColor: NEON.mint,
              ...glow(NEON.mintRgb, { radius: 14, opacity: 0.8 }),
            }}
          />
        </View>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, color: NEON.mint }}
        >
          {done.length}/3 LOGGED
        </Text>
      </View>

      {MOVEMENTS.map((m) => (
        <MovementCard
          key={m}
          movement={m}
          entry={board[m]}
          lastEntry={last[m]}
          onOpen={() => router.push(`/(member)/benchmark/${m}`)}
        />
      ))}

      {allDone ? (
        <PressFade
          onPress={() => router.push("/(member)/benchmark/card")}
          accessibilityRole="button"
          style={{
            marginTop: 8,
            height: 52,
            borderRadius: 15,
            backgroundColor: NEON.mint,
            alignItems: "center",
            justifyContent: "center",
            ...glow(NEON.mintRgb, { radius: 26, opacity: 0.45 }),
          }}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: NEON.inkOnMint }}>
            See your benchmark card
          </Text>
        </PressFade>
      ) : null}

      {!loggingOpen ? (
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink42, marginTop: 16, textAlign: "center" }}
        >
          Logging closed on {formatDateShort(event.benchmark_day)}. Your bells are locked in.
        </Text>
      ) : null}
    </NeonScreen>
  );
}

function MovementCard({ movement, entry, lastEntry, onOpen }) {
  const lift = LIFTS[movement];
  const logged = !!entry?.completedAt;
  const delta = compareEntries(movement, entry, lastEntry);

  const status = logged
    ? `${entry.value || "–"} ${tierUnit(movement, entry.tier)}${
        lift.load && entry.load ? ` at ${entry.load} lb` : ""
      } | ${delta.text}`
    : "Not logged yet";

  return (
    <PressFade
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${lift.name}. ${status}`}
      style={{
        borderRadius: 20,
        padding: 16,
        paddingBottom: 15,
        marginBottom: 12,
        backgroundColor: NEON.card,
        borderWidth: 1.5,
        borderColor: logged ? rgba(lift.rgb, 0.7) : NEON.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* 42, not the README's 30. The prototype's own markup renders
              these at 42 and the signed-off screenshot shows it — where the
              prose and the rendered artifact disagree, the artifact is what
              the designer actually looked at. */}
          <NeonText
            size={42}
            lineHeight={44}
            numberOfLines={1}
            color={lift.color}
            rgb={lift.rgb}
            core={14}
            coreAlpha={0.55}
            halo={40}
            haloAlpha={0.25}
          >
            {lift.name}
          </NeonText>
          <Text
            maxFontSizeMultiplier={1.2}
            style={{ fontFamily: fonts.sans, fontSize: 11.5, color: NEON.ink5, marginTop: 4 }}
          >
            {lift.variants ? `${lift.variants.length} variations | 4 tiers` : "4 tiers | one bell"}
          </Text>
        </View>
        <Kettlebell
          size={34}
          color={logged ? lift.color : "rgba(255,255,255,.16)"}
          glow={logged}
          rgb={lift.rgb}
        />
      </View>

      <View
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: NEON.hairline,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text
          maxFontSizeMultiplier={1.15}
          numberOfLines={2}
          style={{
            fontFamily: fonts.sansSemiBold,
            fontSize: 11.5,
            color: logged ? lift.color : "rgba(247,243,238,.4)",
            flex: 1,
          }}
        >
          {status}
        </Text>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, color: NEON.ink42 }}
        >
          {logged ? "REVIEW ›" : "OPEN ›"}
        </Text>
      </View>
    </PressFade>
  );
}
