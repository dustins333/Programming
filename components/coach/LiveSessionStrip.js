import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { PressFade } from "../PressFade";
import { getOpenHubSession } from "../../lib/programming/hub";
import { fonts, colors, type } from "../../lib/theme";

// The dashboard's door into the live board. It became a daily thing and was
// four taps deep (Dashboard → SPC → Live Sessions → Start now); this is one.
//
// It's live-state-aware because the two questions a coach has here are
// different: with nothing running it's "get me to the roster", and with a
// board up it's "get me back to the one I'm running" — which is also how you
// find out that someone else already started one.
//
// Idle sends you to `?tab=start` rather than the screen's own default, which
// is the Stage tab: staging is a different job, it's still one tap away on
// the left segment, and it's the one tab that can't offer LLYL.

const LIVE_BG = "#33251f";
const IDLE_BORDER = "#f0ddd2";
const IDLE_BG = "#fdf6f2";

export function useOpenHubSession(enabled = true) {
  const [session, setSession] = useState(undefined); // undefined = unknown

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setSession(null);
        return;
      }
      let cancelled = false;
      // Its own catch: a coach without SPC access is refused by RLS, and a
      // dashboard must never fail over one optional strip.
      getOpenHubSession()
        .then((s) => !cancelled && setSession(s))
        .catch(() => !cancelled && setSession(null));
      return () => {
        cancelled = true;
      };
    }, [enabled])
  );

  return session;
}

export function LiveSessionStrip({ session, compact = false }) {
  const live = Boolean(session);
  const count = session?.clients?.length ?? 0;
  const coach = session?.coach_name ? session.coach_name.split(" ")[0] : null;

  return (
    <PressFade
      onPress={() => router.push(live ? "/(coach)/spc/live" : "/(coach)/spc/live?tab=start")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        borderRadius: compact ? 14 : 16,
        paddingVertical: compact ? 13 : 15,
        paddingHorizontal: compact ? 13 : 16,
        backgroundColor: live ? LIVE_BG : IDLE_BG,
        borderWidth: live ? 0 : 1,
        borderColor: IDLE_BORDER,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 99,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: live ? "rgba(247,243,238,.14)" : "white",
          borderWidth: live ? 0 : 1,
          borderColor: IDLE_BORDER,
        }}
      >
        <Ionicons name={live ? "radio" : "barbell-outline"} size={18} color={live ? "#f7f3ee" : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sansBold, fontSize: 15, color: live ? "#f7f3ee" : "#2a211c" }}
        >
          {live ? `Board running · ${count} client${count === 1 ? "" : "s"}` : "Start a live session"}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={{
            fontFamily: fonts.sans,
            fontSize: type.caption,
            color: live ? "rgba(247,243,238,.6)" : colors.muted,
            marginTop: 2,
          }}
        >
          {live
            ? `${coach ? `${coach} is running it · ` : ""}Open the board`
            : "SPC or LLYL, on the wall"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={live ? "rgba(247,243,238,.55)" : "#c9c4bd"} />
    </PressFade>
  );
}
