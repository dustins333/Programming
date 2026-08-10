import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { TimerControl } from "./TimerControl";
import { fonts } from "../lib/theme";

// design_handoff_member_mobile_v5 (3a) — My Fitness's header, promoted from
// the old flat info bar into the same dark hero My Week leads with, so
// the two screens read as one product. It doubles as the program selector:
// the eyebrow's program chip gets a ▾ and opens the picker only when more
// than one program is actually available (a single-program member sees
// plain text and nothing to tap, per the handoff).
//
// Session tabs sit on the hero's bottom edge and are passed in by the
// caller — SPC supplies its own sessions (it has a real choice to make,
// since SPC has no day-of-week routing); group programs don't, because the
// session a member can log is determined by today's weekday. A caller that
// passes no tabs simply drops the row.
const HERO_DARK = "#33251f";
const HERO_CREAM = "#f7f3ee";
const HERO_SAND = "#beac95";
const HERO_OCHRE = "#e0b070";
const CANVAS = "#faf8f6";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export function SessionHeroBar({
  programLabel,
  onPickProgram,
  eyebrowDetail,
  title,
  meta,
  completed,
  onViewBlock,
  timer,
  timerExpanded,
  onToggleExpanded,
  onToggleTimer,
  onResetTimer,
  tabs,
  selectedTab,
  onSelectTab,
}) {
  return (
    <View style={{ backgroundColor: HERO_DARK, borderRadius: 24, overflow: "hidden" }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {onPickProgram ? (
              <PressFade
                onPress={onPickProgram}
                accessibilityLabel="Switch program"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "rgba(247,243,238,0.12)",
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  flexShrink: 1,
                }}
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                  style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, textTransform: "uppercase", color: HERO_SAND }}
                >
                  {programLabel}
                </Text>
                <Ionicons name="chevron-down" size={11} color={HERO_SAND} />
              </PressFade>
            ) : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, textTransform: "uppercase", color: HERO_SAND, flexShrink: 1 }}
              >
                {programLabel}
              </Text>
            )}
            {eyebrowDetail ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, textTransform: "uppercase", color: "rgba(190,172,149,0.7)" }}
              >
                {eyebrowDetail}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {onViewBlock ? (
              <PressFade onPress={onViewBlock} hitSlop={HITSLOP} style={{}}>
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: HERO_OCHRE }}>
                  View full block ›
                </Text>
              </PressFade>
            ) : null}
            {timerExpanded ? <TimerControl timer={timer} onToggle={onToggleTimer} onReset={onResetTimer} compact /> : null}
            <PressFade
              onPress={onToggleExpanded}
              hitSlop={HITSLOP}
              accessibilityLabel={timerExpanded ? "Hide timer" : "Open timer"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(247,243,238,0.25)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="timer-outline" size={16} color={HERO_CREAM} />
            </PressFade>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: HERO_CREAM, flexShrink: 1 }}>
            {title}
          </Text>
          {completed ? (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(233,240,225,0.18)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 }}>
              <Ionicons name="checkmark" size={9} color="#cfe0bd" style={{ marginRight: 3 }} />
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#cfe0bd" }}>
                Finalized
              </Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "rgba(247,243,238,0.62)", marginTop: 3 }}>
            {meta}
          </Text>
        ) : null}
        <View style={{ height: tabs && tabs.length > 1 ? 14 : 18 }} />
      </View>

      {/* Session tabs ride the hero's bottom edge; the active one is canvas-
          colored so it reads as continuous with the page below it. */}
      {tabs && tabs.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 10 }}>
          {tabs.map((tab) => {
            const active = tab.key === selectedTab;
            return (
              <PressFade
                key={tab.key}
                onPress={() => onSelectTab(tab.key)}
                accessibilityLabel={`${tab.label}${tab.completed ? ", completed" : ""}`}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  backgroundColor: active ? CANVAS : "rgba(247,243,238,0.1)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {tab.completed ? (
                    <Ionicons name="checkmark" size={11} color={active ? "#4d6142" : "#cfe0bd"} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.05}
                    style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: active ? "#44403c" : "rgba(247,243,238,0.75)" }}
                  >
                    {tab.label}
                  </Text>
                </View>
                {tab.subtitle ? (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.05}
                    style={{ fontFamily: fonts.sans, fontStyle: "italic", fontSize: 10, color: active ? "#a8a29e" : "rgba(247,243,238,0.5)", marginTop: 1 }}
                  >
                    {tab.subtitle}
                  </Text>
                ) : null}
              </PressFade>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
