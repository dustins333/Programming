import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TimerControl } from "./TimerControl";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// Which session is active — eyebrow (program · week/session) + title, an
// optional "Finalized" pill, a "View full block" link, and the workout
// timer (just an icon until tapped, then expands into the running
// control). Rendered in two places that are never visible at the same
// moment in practice — My Fitness's own header (visible whenever the
// exercise-focus modal is closed) and again inside SessionFocusModal's own
// header (visible whenever it's open). A real RN Modal always paints above
// everything else in the page, so there's no way to keep the *page's* copy
// on top of it once a card is open — duplicating this bar into both places
// is what makes the timer/View full block/session identity feel
// continuously available regardless of whether a specific exercise card is
// open, instead of needing to back all the way out to reach them.
export function SessionInfoBar({ eyebrow, title, completed, timer, timerExpanded, onToggleExpanded, onToggleTimer, onResetTimer, onViewBlock, style }) {
  return (
    <View className="flex-row items-start" style={[{ gap: 12 }, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}
        >
          {eyebrow}
        </Text>
        {title ? (
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#44403c", flexShrink: 1 }}>
              {title}
            </Text>
            {completed && (
              <View className="flex-row items-center rounded-full" style={{ backgroundColor: "#e9f0e1", paddingLeft: 6, paddingRight: 8, paddingVertical: 2, flexShrink: 0 }}>
                <Ionicons name="checkmark" size={9} color="#3f5136" style={{ marginRight: 3 }} />
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#3f5136" }}>Finalized</Text>
              </View>
            )}
          </View>
        ) : null}
        {onViewBlock ? (
          <Pressable onPress={onViewBlock} hitSlop={HITSLOP} className="mt-1.5 self-start">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.primaryOnWhite }}>View full block ›</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row items-center" style={{ gap: 8, flexShrink: 0 }}>
        {timerExpanded ? <TimerControl timer={timer} onToggle={onToggleTimer} onReset={onResetTimer} compact /> : null}
        <Pressable
          onPress={onToggleExpanded}
          hitSlop={HITSLOP}
          accessibilityLabel={timerExpanded ? "Hide timer" : "Open timer"}
          className="items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER }}
        >
          <Ionicons name="timer-outline" size={18} color={colors.primaryOnWhite} />
        </Pressable>
      </View>
    </View>
  );
}
