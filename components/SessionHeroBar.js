import { View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";

// My Fitness's session header (design_handoff_member_lift_v1).
//
// This was a dark hero in v5, matching My Week's. The lift-tracking handoff
// draws it light — an eyebrow, the session name in brand terracotta, and
// "Full block ›" — and takes the session stopwatch out of it entirely
// (nobody used it, and it competed with rest, which is now the only timer in
// the app). With the timer gone the dark block had nothing left on its right
// side, so it goes back to being a plain page header and the dark hero stays
// My Week's alone.
//
// It doubles as the program selector: the eyebrow's program chip gets a ▾
// and opens the picker only when more than one program is actually
// available. A single-program member sees plain text with nothing to tap.
//
// Session tabs are passed in by the caller — SPC supplies its own sessions
// (it has a real choice to make, having no day-of-week routing); group
// programs don't, because the session a member can log is determined by
// today's weekday. A caller that passes no tabs simply drops the row.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const MUTED = "#a8a29e";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export function SessionHeroBar({
  programLabel,
  onPickProgram,
  eyebrowDetail,
  title,
  meta,
  completed,
  onViewBlock,
  onOpenSettings,
  tabs,
  selectedTab,
  onSelectTab,
}) {
  const eyebrow = [programLabel, eyebrowDetail].filter(Boolean).join(" · ").toUpperCase();

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {onPickProgram ? (
            <PressFade
              onPress={onPickProgram}
              accessibilityLabel="Switch program"
              style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: MUTED, flexShrink: 1 }}
              >
                {eyebrow}
              </Text>
              <Ionicons name="chevron-down" size={11} color={MUTED} />
            </PressFade>
          ) : (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: MUTED }}
            >
              {eyebrow}
            </Text>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.15}
              style={{ fontFamily: fonts.display, fontSize: 29, lineHeight: 33, color: colors.primary, flexShrink: 1 }}
            >
              {title}
            </Text>
            {completed ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#eef1e7",
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  flexShrink: 0,
                }}
              >
                <Ionicons name="checkmark" size={9} color="#4d6142" style={{ marginRight: 3 }} />
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#4d6142" }}>
                  Finalized
                </Text>
              </View>
            ) : null}
          </View>
          {meta ? (
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: MUTED, marginTop: 3 }}>
              {meta}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0, paddingTop: 2 }}>
          {onViewBlock ? (
            <PressFade onPress={onViewBlock} hitSlop={HITSLOP} style={{}}>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: colors.primaryOnWhite }}>
                Full block ›
              </Text>
            </PressFade>
          ) : null}
          {onOpenSettings ? (
            <PressFade onPress={onOpenSettings} hitSlop={HITSLOP} accessibilityLabel="Settings" style={{}}>
              <Ionicons name="settings-outline" size={20} color="#78716c" />
            </PressFade>
          ) : null}
          {/* Same 34px round mark every other member tab header carries. */}
          <Image source={require("../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
        </View>
      </View>

      {tabs && tabs.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
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
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? colors.primary : CARD_BORDER,
                  backgroundColor: active ? "#fdf6f2" : CANVAS,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {tab.completed ? <Ionicons name="checkmark" size={11} color="#4d6142" /> : null}
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.05}
                    style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: active ? colors.primaryOnWhite : "#78716c" }}
                  >
                    {tab.label}
                  </Text>
                </View>
                {tab.subtitle ? (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.05}
                    style={{ fontFamily: fonts.sans, fontStyle: "italic", fontSize: 10, color: MUTED, marginTop: 1 }}
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
