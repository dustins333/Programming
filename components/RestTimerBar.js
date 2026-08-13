import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { useRestTimer, formatSeconds } from "../lib/restTimer";
import { fonts } from "../lib/theme";

// The pinned rest bar (design_handoff_member_lift_v1). Rendered by
// (member)/_layout.js above <Tabs>, so it sits over the tab content on every
// member screen — see lib/restTimer.js for why the state lives up there.
//
// Two states, both drawn from the handoff:
//  - running: dark, big remaining time, "REST · {LIFT}", a filling progress
//    bar, and Cancel.
//  - done:    olive, a ✓, "Rest done" + the lift and set, and "Back to lift ›".
//    Holds a few seconds (lib/restTimer.js's DONE_HOLD_MS) then clears itself.
//
// Tapping the body returns to the lift in either state. Cancel is its own
// press target so it can't be hit by accident on the way back.
//
// The 250ms tick lives here rather than in the provider on purpose: a
// provider re-render re-renders every member screen beneath it, and there's
// no reason for My Nutrition to repaint four times a second because someone
// is resting.
const DARK = "#33251f";
const CREAM = "#f7f3ee";
const SAND = "#beac95";
const OCHRE = "#e0b070";
const OLIVE = "#4d6142";

export function RestTimerBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { timer, cancelRest, markRestDone } = useRestTimer();
  const [, tick] = useState(0);

  const running = !!timer && !timer.done;
  const endsAt = timer?.endsAt;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (Date.now() >= endsAt) markRestDone();
      else tick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [running, endsAt, markRestDone]);

  if (!timer) return null;

  const goBackToLift = () => {
    if (!timer.returnTo) return;
    router.push(timer.returnTo);
  };

  const setLine = [timer.liftName, timer.setNumber ? `set ${timer.setNumber}` : null].filter(Boolean).join(" · ");

  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: "#faf8f6" }}>
      {timer.done ? (
        <PressFade
          onPress={goBackToLift}
          accessibilityLabel={`Rest done. ${setLine}. Back to lift`}
          style={{
            backgroundColor: OLIVE,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            shadowColor: OLIVE,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 20,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#fff" }}>
              Rest done
            </Text>
            {setLine ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                {setLine}
              </Text>
            ) : null}
          </View>
          {timer.returnTo ? (
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: "#fff", flexShrink: 0 }}>
              Back to lift ›
            </Text>
          ) : null}
        </PressFade>
      ) : (
        <View
          style={{
            backgroundColor: DARK,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 11,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            shadowColor: DARK,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.22,
            shadowRadius: 20,
          }}
        >
          <PressFade
            onPress={goBackToLift}
            accessibilityLabel={`Resting, ${formatSeconds((timer.endsAt - Date.now()) / 1000)} left. Back to lift`}
            style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 24, color: CREAM, flexShrink: 0 }}>
              {formatSeconds((timer.endsAt - Date.now()) / 1000)}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.3, color: SAND, marginBottom: 5 }}
              >
                {timer.liftName ? `REST · ${String(timer.liftName).toUpperCase()}` : "REST"}
              </Text>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: "rgba(247,243,238,0.18)", overflow: "hidden" }}>
                <View
                  style={{
                    width: `${Math.min(100, Math.max(0, ((timer.durationMs - (timer.endsAt - Date.now())) / timer.durationMs) * 100))}%`,
                    height: 4,
                    borderRadius: 999,
                    backgroundColor: OCHRE,
                  }}
                />
              </View>
            </View>
          </PressFade>
          <PressFade
            onPress={cancelRest}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Cancel rest timer"
            style={{ flexShrink: 0 }}
          >
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: OCHRE }}>
              Cancel
            </Text>
          </PressFade>
        </View>
      )}
    </View>
  );
}
