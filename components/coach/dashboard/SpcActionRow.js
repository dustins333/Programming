import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { CHEVRON } from "./DashboardParts";
import { fonts, colors } from "../../../lib/theme";

// The primary action inside the SPC section: get a board on the wall.
//
// Live-state aware, because the two questions are different. With nothing
// running it's "start or stage one"; with a board up it's "get me back to the
// one I'm running" — which is also how a coach finds out somebody else
// already started one. Same rule LiveSessionStrip used, which this replaces
// on the dashboard.
//
// Copy is Terra's: "Start / stage a session", not "Start a live session".

const IDLE_BG = "#fdf6f2";
const IDLE_BORDER = "#f0ddd2";

function idleSubline(stagedCount) {
  if (stagedCount === null || stagedCount === undefined) return "SPC or LLYL, on the wall";
  if (stagedCount === 0) return "Nothing staged · SPC or LLYL, on the wall";
  return `${stagedCount} staged for later · SPC or LLYL, on the wall`;
}

export function SpcActionRow({ session, stagedCount, wide, onPress, onStageAnother }) {
  const live = Boolean(session);
  const count = session?.clients?.length ?? 0;
  const coach = session?.coach_name ? session.coach_name.split(" ")[0] : null;
  const chip = wide ? 34 : 28;

  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: wide ? 12 : 10,
        backgroundColor: live ? colors.ink : IDLE_BG,
        borderWidth: live ? 0 : 1,
        borderColor: IDLE_BORDER,
        borderRadius: wide ? 14 : 12,
        paddingVertical: wide ? 14 : 11,
        paddingHorizontal: wide ? 15 : 12,
        marginBottom: wide ? 13 : 9,
      }}
    >
      <View
        style={{
          width: chip,
          height: chip,
          borderRadius: 99,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: live ? "rgba(247,243,238,.14)" : "white",
          borderWidth: live ? 0 : 1,
          borderColor: IDLE_BORDER,
        }}
      >
        <Ionicons name={live ? "radio" : "barbell-outline"} size={wide ? 19 : 16} color={live ? "#f7f3ee" : colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sansBold, fontSize: wide ? 15 : 13.5, color: live ? "#f7f3ee" : colors.text }}
        >
          {live ? `Board running · ${count} client${count === 1 ? "" : "s"}` : "Start / stage a session"}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={{
            fontFamily: fonts.sans,
            fontSize: wide ? 12 : 10.5,
            color: live ? "rgba(247,243,238,.6)" : colors.muted,
            marginTop: wide ? 2 : 1,
          }}
        >
          {live ? `${coach ? `${coach} is running it · ` : ""}open the board` : idleSubline(stagedCount)}
        </Text>
      </View>
      {/* A running board already has one destination on the row itself, so the
          second action is only worth its width where there is width. */}
      {live && wide && onStageAnother ? (
        <PressFade
          onPress={onStageAnother}
          style={{ borderWidth: 1, borderColor: "rgba(247,243,238,.28)", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 15 }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#f7f3ee" }}>Stage another</Text>
        </PressFade>
      ) : (
        <Ionicons name="chevron-forward" size={wide ? 16 : 15} color={live ? "rgba(247,243,238,.55)" : CHEVRON} />
      )}
    </PressFade>
  );
}
