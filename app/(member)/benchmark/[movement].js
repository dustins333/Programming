import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PressFade } from "../../../components/PressFade";
import { NeonText } from "../../../components/benchmark/NeonText";
import { Kettlebell } from "../../../components/benchmark/Kettlebell";
import { NEON, glow, rgba } from "../../../components/benchmark/neon";
import { BackRow, NeonScreen } from "../../../components/benchmark/BenchmarkChrome";
import { BenchmarkCelebration } from "../../../components/benchmark/BenchmarkCelebration";
import { LIFTS, MOVEMENTS, saveBenchmarkEntry } from "../../../lib/programming/benchmark";
import { useBenchmark } from "../../../lib/programming/useBenchmark";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { showToast } from "../../../lib/toast";
import { fonts } from "../../../lib/theme";

// The core screen. Two columns of kettlebells over four tier rows, mirroring
// the physical board: This time is what she just did, Last time is what she
// did at the previous benchmark and is editable too.
//
// Autosave throughout — there is no save button anywhere in this feature. Text
// fields debounce; placing or moving a bell writes immediately, because that is
// the action she would be most annoyed to lose.

const SAVE_DEBOUNCE_MS = 600;
const COL = 92;

export default function BenchmarkMovement() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const params = useLocalSearchParams();
  const movement = MOVEMENTS.includes(params.movement) ? params.movement : "pull";
  const lift = LIFTS[movement];

  const { status, event, board, last, loggingOpen, setBoard, setLast } = useBenchmark();

  // Which variation tab she is looking at. Seeded from whatever the bell was
  // placed under so reopening a logged movement lands on the tab the bell is
  // actually on, rather than hiding it behind the other tab.
  const [variant, setVariant] = useState(null);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || status !== "ready") return;
    seeded.current = true;
    setVariant(board?.[movement]?.tier != null ? board[movement].variant : 0);
  }, [status, board, movement]);

  const [celebrating, setCelebrating] = useState(false);
  const timers = useRef({});

  const entry = board?.[movement];
  const lastEntry = last?.[movement];
  const locked = !loggingOpen || !!entry?.completedAt;
  const activeVariant = variant ?? 0;

  // Never leave a pending debounce behind on the way out.
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((id) => clearTimeout(id));
  }, []);

  const persist = useCallback(
    async (slot, fields) => {
      if (!profile?.id || !event) return;
      try {
        await saveBenchmarkEntry(profile.id, event.id, movement, slot, fields);
      } catch (err) {
        console.error("Benchmark: failed to save", err);
        showToast("Couldn't save that. Check your connection.");
      }
    },
    [profile?.id, event, movement],
  );

  const persistDebounced = useCallback(
    (slot, field, fields) => {
      const key = `${slot}:${field}`;
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => persist(slot, fields), SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  const patchLocal = (slot, fields) => {
    const apply = (b) => ({ ...b, [movement]: { ...b[movement], ...fields } });
    if (slot === "this") setBoard(apply);
    else setLast(apply);
  };

  // One bell per movement, ever. Tapping where it already sits removes it;
  // tapping elsewhere moves it and carries the number and load along, because
  // she is correcting her tier, not starting over.
  const placeBell = (slot, tier) => {
    if (slot === "this" && locked) return;
    const current = slot === "this" ? entry : lastEntry;
    const onThisCell = current?.tier === tier && (current?.variant ?? 0) === activeVariant;
    const fields = onThisCell
      ? { tier: null, value: "", load: "" }
      : { tier, variant: activeVariant };
    patchLocal(slot, fields);
    persist(slot, fields);
  };

  const setNumber = (slot, field, raw) => {
    if (slot === "this" && locked) return;
    const clean = String(raw).replace(/[^0-9]/g, "").slice(0, 4);
    patchLocal(slot, { [field]: clean });
    persistDebounced(slot, field, { [field]: clean });
  };

  const setNote = (slot, text) => {
    patchLocal(slot, { note: text });
    persistDebounced(slot, "note", { note: text });
  };

  const pickVariant = (next) => {
    if (locked) return;
    setVariant(next);
  };

  const canComplete = !!entry?.tier && !!entry?.value && (!lift.load || !!entry.load);

  const completeLabel = entry?.completedAt
    ? "Logged | tap a bell to change"
    : canComplete
      ? `Mark ${lift.name.toLowerCase()} complete`
      : !entry?.tier
        ? "Place your kettlebell first"
        : !entry?.value
          ? "Type your number on the bell"
          : "Add the load you used";

  const markComplete = async () => {
    if (!canComplete || entry?.completedAt) return;
    const completedAt = new Date().toISOString();
    patchLocal("this", { completedAt });
    setCelebrating(true);
    await persist("this", { completedAt });
  };

  const doneCount = useMemo(
    () => MOVEMENTS.filter((m) => board?.[m]?.completedAt).length,
    [board],
  );

  if (status === "loading" || variant === null) {
    return (
      <NeonScreen insets={insets}>
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={NEON.mint} />
        </View>
      </NeonScreen>
    );
  }

  if (status !== "ready" || !entry) {
    return (
      <NeonScreen insets={insets}>
        <BackRow label="Benchmark Day" onPress={() => router.replace("/(member)/benchmark")} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: NEON.ink62, marginTop: 24 }}>
          Couldn't load this movement.
        </Text>
      </NeonScreen>
    );
  }

  // The screen behind the celebration unmounts while it is up.
  if (celebrating) {
    return (
      <BenchmarkCelebration
        eventName={event.name}
        movement={movement}
        entry={entry}
        lastEntry={lastEntry}
        allDone={doneCount === 3}
        onDismiss={() => {
          setCelebrating(false);
          if (doneCount === 3) router.replace("/(member)/benchmark/card");
          else router.replace("/(member)/benchmark");
        }}
      />
    );
  }

  return (
    <NeonScreen insets={insets}>
      <BackRow
        label="Benchmark Day"
        onPress={() => router.replace("/(member)/benchmark")}
        right={
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: NEON.ink42 }}
          >
            TEST {lift.index} OF 3
          </Text>
        }
      />

      <NeonText
        size={40}
        color={lift.color}
        rgb={lift.rgb}
        core={14}
        coreAlpha={0.55}
        halo={40}
        haloAlpha={0.25}
        style={{ marginTop: 4, marginBottom: 6 }}
      >
        {lift.name}
      </NeonText>
      <Text
        maxFontSizeMultiplier={1.2}
        style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink55, marginBottom: 16 }}
      >
        {lift.hint}
      </Text>

      {lift.variants ? (
        <View>
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: NEON.ink42, marginBottom: 8 }}
          >
            VARIATION
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 5,
              backgroundColor: NEON.trackFill,
              borderRadius: 14,
              padding: 5,
              marginBottom: 18,
            }}
          >
            {lift.variants.map((label, i) => {
              const selected = activeVariant === i;
              return (
                <PressFade
                  key={label}
                  onPress={() => pickVariant(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 10,
                    backgroundColor: selected ? lift.color : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 6,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.15}
                    style={{
                      fontFamily: fonts.sansBold,
                      fontSize: 11.5,
                      lineHeight: 14,
                      textAlign: "center",
                      color: selected ? NEON.inkOnNeon : NEON.ink62,
                    }}
                  >
                    {label}
                  </Text>
                </PressFade>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Tier grid */}
      <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-end", marginBottom: 8 }}>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: NEON.ink42 }}
        >
          TIER
        </Text>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{
            width: COL,
            textAlign: "center",
            fontFamily: fonts.sansBold,
            fontSize: 9.5,
            letterSpacing: 1,
            color: NEON.ink36,
          }}
        >
          LAST TIME
        </Text>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{
            width: COL,
            textAlign: "center",
            fontFamily: fonts.sansBold,
            fontSize: 9.5,
            letterSpacing: 1,
            color: NEON.mint,
          }}
        >
          THIS TIME
        </Text>
      </View>

      {lift.tiers.map((tier, i) => {
        const n = i + 1;
        const hereThis = entry.tier === n && (entry.variant ?? 0) === activeVariant;
        const hereLast = lastEntry?.tier === n && (lastEntry?.variant ?? 0) === activeVariant;
        return (
          <View
            key={tier.label}
            style={{
              flexDirection: "row",
              gap: 9,
              alignItems: "stretch",
              borderTopWidth: 1,
              borderTopColor: NEON.hairline,
              paddingVertical: 11,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <NeonText
                size={30}
                color={hereThis ? lift.color : NEON.ink28}
                rgb={lift.rgb}
                glow={hereThis}
                core={14}
                coreAlpha={0.55}
              >
                {n}
              </NeonText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 15, color: NEON.ink }}
                >
                  {tier.label}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{ fontFamily: fonts.sans, fontSize: 10, lineHeight: 13, color: "rgba(247,243,238,.45)", marginTop: 2 }}
                >
                  {tier.sub}
                </Text>
              </View>
            </View>

            <BellCell
              width={COL}
              tone="last"
              placed={hereLast}
              lift={lift}
              tier={n}
              unit={tier.unit}
              value={lastEntry?.value ?? ""}
              load={lastEntry?.load ?? ""}
              onPlace={() => placeBell("last", n)}
              onValue={(v) => setNumber("last", "value", v)}
              onLoad={(v) => setNumber("last", "load", v)}
              disabled={false}
            />

            <BellCell
              width={COL}
              tone="this"
              placed={hereThis}
              lift={lift}
              tier={n}
              unit={tier.unit}
              value={entry.value}
              load={entry.load}
              onPlace={() => placeBell("this", n)}
              onValue={(v) => setNumber("this", "value", v)}
              onLoad={(v) => setNumber("this", "load", v)}
              disabled={locked}
            />
          </View>
        );
      })}

      {/* Notes */}
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: NEON.ink42, marginTop: 22, marginBottom: 8 }}
      >
        NOTES
      </Text>

      <NoteBlock
        label="LAST TIME"
        labelColor={NEON.ink36}
        borderColor={NEON.trackRail}
        borderWidth={1}
        textColor="rgba(247,243,238,.72)"
        value={lastEntry?.note ?? ""}
        placeholder="Add a note from last time."
        onChange={(t) => setNote("last", t)}
      />

      <NoteBlock
        label="THIS TIME"
        labelColor={NEON.mint}
        borderColor={(entry.note || "").length ? rgba(NEON.mintRgb, 0.45) : NEON.trackRail}
        borderWidth={1.5}
        textColor={NEON.ink}
        value={entry.note ?? ""}
        placeholder="How did it feel? What's next?"
        onChange={(t) => setNote("this", t)}
        editable={!locked}
      />

      <PressFade
        onPress={markComplete}
        disabled={!canComplete || !!entry.completedAt}
        accessibilityRole="button"
        style={{
          marginTop: 18,
          height: 52,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          borderWidth: 1.5,
          borderColor: entry.completedAt
            ? rgba(NEON.mintRgb, 0.4)
            : canComplete
              ? lift.color
              : NEON.borderSoft,
          backgroundColor: entry.completedAt ? "transparent" : canComplete ? lift.color : "transparent",
          ...(canComplete && !entry.completedAt ? glow(lift.rgb, { radius: 26, opacity: 0.4 }) : null),
        }}
      >
        <Text
          maxFontSizeMultiplier={1.15}
          numberOfLines={1}
          style={{
            fontFamily: fonts.sansBold,
            fontSize: 14,
            color: entry.completedAt ? NEON.ink55 : canComplete ? NEON.inkOnNeon : "rgba(247,243,238,.38)",
          }}
        >
          {completeLabel}
        </Text>
      </PressFade>

      {locked && !entry.completedAt ? (
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: NEON.ink42, marginTop: 12, textAlign: "center" }}
        >
          Logging is closed for this benchmark.
        </Text>
      ) : null}
    </NeonScreen>
  );
}

// One cell of the tier grid. Either the bell sits here, with her number keyed
// onto its body the way the sticker sits on the physical one, or it is an
// empty box she taps to move it.
function BellCell({ width, tone, placed, lift, tier, unit, value, load, onPlace, onValue, onLoad, disabled }) {
  const isThis = tone === "this";

  if (!placed) {
    return (
      <PressFade
        onPress={onPlace}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Put your ${isThis ? "" : "last "}kettlebell on tier ${tier}`}
        style={{
          width,
          height: 56,
          borderRadius: 12,
          borderWidth: isThis ? 2 : 1.5,
          borderStyle: "dashed",
          borderColor: isThis ? NEON.dashedThis : NEON.dashedLast,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ fontSize: 15, color: isThis ? NEON.ink3 : NEON.ink2 }}>
          –
        </Text>
      </PressFade>
    );
  }

  const bellSize = isThis ? 58 : 54;
  const boxSize = isThis ? 62 : 58;
  const numberSize = isThis ? 20 : 18;
  const bellColor = isThis ? lift.color : lift.dim;
  const inkColor = isThis ? NEON.inkOnNeon : NEON.ink;

  return (
    <View style={{ width, alignItems: "center" }}>
      <View style={{ width: boxSize, height: boxSize, alignItems: "center", justifyContent: "center" }}>
        <PressFade
          onPress={onPlace}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Take the kettlebell off tier ${tier}`}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
        >
          <Kettlebell size={bellSize} color={bellColor} glow={isThis} rgb={lift.rgb} />
        </PressFade>
        {/* The number lives ON the bell body, not beside it. */}
        <TextInput
          value={value}
          onChangeText={onValue}
          editable={!disabled}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor={isThis ? "rgba(10,10,10,.45)" : "rgba(247,243,238,.35)"}
          maxLength={4}
          accessibilityLabel={`Number for tier ${tier}`}
          style={{
            position: "absolute",
            top: isThis ? 27 : 25,
            alignSelf: "center",
            width: bellSize * 0.66,
            textAlign: "center",
            backgroundColor: "transparent",
            borderWidth: 0,
            padding: 0,
            fontFamily: fonts.display,
            fontSize: numberSize,
            color: inkColor,
          }}
        />
      </View>
      <Text
        maxFontSizeMultiplier={1}
        numberOfLines={2}
        style={{
          marginTop: 1,
          fontFamily: fonts.sansBold,
          fontSize: 8.5,
          letterSpacing: 0.5,
          lineHeight: 11,
          textAlign: "center",
          color: isThis ? lift.color : NEON.ink5,
        }}
      >
        {unit.toUpperCase()}
      </Text>
      {lift.load ? (
        <View
          style={{
            marginTop: 5,
            minHeight: 30,
            width: 88,
            borderRadius: 999,
            borderWidth: 1.5,
            borderStyle: isThis && !load ? "dashed" : "solid",
            borderColor: isThis ? (load ? lift.color : "rgba(255,255,255,.26)") : "rgba(255,255,255,.2)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          <TextInput
            value={load}
            onChangeText={onLoad}
            editable={!disabled}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="–"
            placeholderTextColor="rgba(247,243,238,.35)"
            maxLength={4}
            accessibilityLabel={`Load in pounds for tier ${tier}`}
            style={{
              width: 34,
              textAlign: "right",
              backgroundColor: "transparent",
              borderWidth: 0,
              padding: 0,
              fontFamily: fonts.display,
              fontSize: 16,
              color: isThis ? (load ? lift.color : NEON.ink5) : "rgba(247,243,238,.8)",
            }}
          />
          <Text
            maxFontSizeMultiplier={1}
            style={{
              fontFamily: fonts.sansBold,
              fontSize: 9.5,
              letterSpacing: 0.7,
              color: isThis ? (load ? lift.color : NEON.ink42) : NEON.ink5,
            }}
          >
            LB
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function NoteBlock({ label, labelColor, borderColor, borderWidth, textColor, value, placeholder, onChange, editable = true }) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth,
        borderColor,
        backgroundColor: NEON.noteFill,
        paddingHorizontal: 13,
        paddingVertical: 12,
        marginBottom: 10,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1, color: labelColor, marginBottom: 6 }}
      >
        {label}
      </Text>
      {/* Fixed height, not auto-growing off onContentSizeChange. On web that
          measurement feeds back into the height it just set and can loop —
          this codebase has been bitten by it three times, once reaching a real
          member as a blank screen. */}
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline
        placeholder={placeholder}
        placeholderTextColor="rgba(247,243,238,.32)"
        style={{
          fontFamily: fonts.sans,
          fontSize: 12.5,
          lineHeight: 18,
          color: textColor,
          backgroundColor: "transparent",
          borderWidth: 0,
          padding: 0,
          minHeight: 54,
          maxHeight: 54,
        }}
      />
    </View>
  );
}
