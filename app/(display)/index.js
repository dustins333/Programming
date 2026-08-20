import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { PressFade } from "../../components/PressFade";
import { useHubBoard } from "../../components/hub/useHubBoard";
import { HubLiveSession } from "../../components/hub/HubLiveSession";
import { toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The wall-mounted gym-floor display (1920x1080 landscape touchscreen).
// Idle until a coach starts a hub session from their phone
// (app/(coach)/spc/live.js); then up to 4 client columns, live via the
// 3-second poll in useHubBoard, each column a touch input surface (tap a
// lift -> big entry pad). Ending from here goes through the hub_end_session
// RPC — the display account has no direct UPDATE on hub_sessions.
//
// Page never scrolls (overflow hidden); an overflowing column's own lift
// list scrolls internally instead (see HubClientColumn's FlatList).

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.muted }}>
      {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </Text>
  );
}

export default function DisplayBoard() {
  const hub = useHubBoard({ idlePoll: true });
  const { hubSession, board, pollError, end } = hub;
  const [confirmEnd, setConfirmEnd] = useState(false);

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
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderBottomColor: "#ece7e1",
          backgroundColor: "white",
        }}
      >
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 30, height: 30, borderRadius: 15, marginRight: 10 }} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: colors.primaryOnWhite }}>Kova Strength</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginLeft: 12 }}>
          {hubSession ? "Live SPC session" : "SPC session board"}
        </Text>
        {pollError ? (
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#8a5a2e", marginLeft: 12 }}>reconnecting…</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Clock />
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
              style={{ marginLeft: 16, borderRadius: 999, borderWidth: 1, borderColor: "#ece7e1", paddingHorizontal: 14, paddingVertical: 7 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>End session</Text>
            </PressFade>
          )
        ) : null}
      </View>

      {/* Body */}
      {hubSession === undefined ? null : !hubSession ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 20, opacity: 0.9 }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primary }}>Waiting for a session</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.bodyLg, color: colors.muted, marginTop: 8 }}>
            A coach can start one from their phone — SPC → Live session.
          </Text>
        </View>
      ) : !board ? null : (
        <View style={{ flex: 1, padding: 12 }}>
          <HubLiveSession hub={hub} authorId={hubSession.coach_id} scale="tv" />
        </View>
      )}
    </View>
  );
}
