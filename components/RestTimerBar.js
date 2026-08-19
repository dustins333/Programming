import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { useRestTimer, formatSeconds } from "../lib/restTimer";
import { fonts, type } from "../lib/theme";

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
// The bar never navigates when the member is ALREADY on the screen the timer
// came from (`onLiftScreen` below). Two real bugs, both reported off the PWA:
// the done state offered "Back to lift ›" while standing on that very lift,
// and — worse — a mis-tap on the running bar's body fired a navigation that
// re-ran plan.js's load(), resetting the page's own session resolution ("it
// asked me what session I was logging again"). On that screen the body is
// plain text with no press target at all, and the done state offers Dismiss
// instead. When it DOES navigate it uses router.navigate, not push, so
// repeated taps update the existing screen rather than stacking copies of it.
//
// Cancel is a padded chip, not a bare word with hitSlop: react-native-web's
// Pressable does not implement hitSlop at all (confirmed — the prop appears
// nowhere in its source), so on the PWA the old target was literally the
// glyph box of an 11px word. That is why Cancel "took a few taps" to land.
// Any tap target on this bar has to earn its size from real padding.
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

// Route groups aren't part of the URL, so usePathname() gives "/plan" where a
// returnTo href gives "/(member)/plan". Compare them on the same footing.
function stripGroups(path) {
  return String(path || "").replace(/\/\([^)]*\)/g, "");
}

export function RestTimerBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
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

  // Already standing on the screen the rest came from? Then there is nowhere
  // to go back to, and navigating would only reset it.
  const onLiftScreen = !timer.returnTo || stripGroups(pathname) === stripGroups(timer.returnTo.pathname);
  const canNavigate = !!timer.returnTo && !onLiftScreen;

  const goBackToLift = () => {
    if (!canNavigate) return;
    router.navigate(timer.returnTo);
  };

  const setLine = [timer.liftName, timer.setNumber ? `set ${timer.setNumber}` : null].filter(Boolean).join(" · ");

  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: "#faf8f6" }}>
      {timer.done ? (
        <Body onPress={canNavigate ? goBackToLift : null} tone={OLIVE} label={`Rest done. ${setLine}`}>
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
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "rgba(255,255,255,0.8)" }}>
                {setLine}
              </Text>
            ) : null}
          </View>
          {canNavigate ? (
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color: "#fff", flexShrink: 0 }}>
              Back to lift ›
            </Text>
          ) : (
            <ChipButton onPress={cancelRest} label="Dismiss" color="#fff" borderColor="rgba(255,255,255,0.4)" />
          )}
        </Body>
      ) : (
        <Body
          onPress={canNavigate ? goBackToLift : null}
          tone={DARK}
          label={`Resting, ${formatSeconds((timer.endsAt - Date.now()) / 1000)} left`}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 24, color: CREAM, flexShrink: 0 }}>
            {formatSeconds((timer.endsAt - Date.now()) / 1000)}
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1.2, color: SAND, marginBottom: 5 }}
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
          <ChipButton onPress={cancelRest} label="Stop" color={OCHRE} borderColor="rgba(224,176,112,0.45)" />
        </Body>
      )}
    </View>
  );
}

// The bar's card. Pressable only when there's somewhere to go — on the lift's
// own screen it's a plain View, so a tap aimed at Stop that misses does
// nothing instead of navigating.
function Body({ onPress, tone, label, children }) {
  const card = {
    backgroundColor: tone,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: tone,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
  };
  if (!onPress) return <View style={card}>{children}</View>;
  return (
    <PressFade onPress={onPress} accessibilityLabel={`${label}. Back to lift`} style={card}>
      {children}
    </PressFade>
  );
}

// ~40pt of real padded target. Deliberately not hitSlop — see the header note:
// react-native-web ignores it, which is what made Stop take several taps on
// the PWA. The negative margin keeps the bar the same height it was.
function ChipButton({ onPress, label, color, borderColor }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === "Stop" ? "Stop rest timer" : "Dismiss rest timer"}
      style={{
        flexShrink: 0,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginVertical: -6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color }}>
        {label}
      </Text>
    </PressFade>
  );
}
