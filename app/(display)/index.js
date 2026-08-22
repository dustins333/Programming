import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { PressFade } from "../../components/PressFade";
import { useHubBoard } from "../../components/hub/useHubBoard";
import { HubLiveSession } from "../../components/hub/HubLiveSession";
import { HubIdleScreen } from "../../components/hub/HubIdleScreen";
import { toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The wall-mounted gym-floor display (1920x1080 landscape touchscreen).
// Idle until a coach starts a hub session from their phone
// (app/(coach)/spc/live.js); then up to 4 client columns, live via the
// 3-second poll in useHubBoard, each column a touch input surface — tap a
// lift and it expands in place with the keypad docked beneath it. Ending
// from here goes through the hub_end_session RPC; the display account has no
// direct UPDATE on hub_sessions.
//
// The page itself never scrolls (overflow hidden); an overflowing column's
// own lift list scrolls internally instead, so nothing in any other column
// moves.

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function DisplayBoard() {
  const hub = useHubBoard({ idlePoll: true });
  const { hubSession, board, pollError, end } = hub;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const now = useNow();

  const handleEnd = async () => {
    setConfirmEnd(false);
    try {
      await end();
    } catch (e) {
      toastError("Couldn't end the session.", e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, overflow: "hidden" }}>
      {/* Top bar */}
      <View
        style={{
          height: 60,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderBottomColor: "#ece7e1",
          backgroundColor: "white",
        }}
      >
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 21, color: colors.primaryOnWhite }}>Kova{"\n"}Strength</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 19, color: colors.muted, marginLeft: 16 }}>
          {hubSession ? "Live SPC\nsession" : "SPC session\nboard"}
        </Text>
        {pollError ? (
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#8a5a2e", marginLeft: 14 }}>reconnecting…</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 19, color: "#57534e", textAlign: "right" }}>
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP]M)$/i, "\n$1")}
        </Text>
        {hubSession ? (
          confirmEnd ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#57534e", marginRight: 8 }}>End this session?</Text>
              <PressFade onPress={handleEnd} style={{ backgroundColor: "#b23a22", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginRight: 6 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "white" }}>End</Text>
              </PressFade>
              <PressFade onPress={() => setConfirmEnd(false)} style={{ paddingHorizontal: 8, paddingVertical: 7 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>Cancel</Text>
              </PressFade>
            </View>
          ) : (
            <PressFade
              onPress={() => setConfirmEnd(true)}
              style={{ marginLeft: 16, borderRadius: 999, borderWidth: 1, borderColor: "#ece7e1", paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 17, color: colors.muted, textAlign: "center" }}>End{"\n"}session</Text>
            </PressFade>
          )
        ) : null}
      </View>

      {/* Body */}
      {hubSession === undefined ? null : !hubSession ? (
        <HubIdleScreen now={now} />
      ) : !board ? null : (
        <View style={{ flex: 1, padding: 14 }}>
          <HubLiveSession hub={hub} authorId={hubSession.coach_id} authorName={hubSession.coach_name?.split(" ")[0] ?? null} scale="tv" now={now} />
        </View>
      )}
    </View>
  );
}
