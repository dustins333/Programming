import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { PressFade } from "../../components/PressFade";
import { useHubBoard } from "../../components/hub/useHubBoard";
import { HubLiveSession } from "../../components/hub/HubLiveSession";
import { HubIdleScreen } from "../../components/hub/HubIdleScreen";
import { HubStartModal, HubAddClientModal } from "../../components/hub/HubPickerModals";
import { removeHubClient } from "../../lib/programming/hub";
import { stagedCountForCoach } from "../../lib/programming/hubStaging";
import { toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The wall-mounted gym-floor display (1920x1080 landscape touchscreen).
// A coach starts a session either from their phone (app/(coach)/spc/live.js)
// or from here — tap the idle clock, enter a PIN, pick who's training
// (migration 0083). Clients can be added or dropped while it runs, so a
// no-show or a walk-in doesn't mean ending the session and starting again.
// Then up to 4 client columns, live via the
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
  const { hubSession, board, pollError, end, refreshSession, refreshBoard } = hub;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Set the moment a session ends, when that coach has another group waiting.
  // A count, not the groups themselves: starting still goes through the PIN,
  // so the wall never lists a coach's staged clients before it's earned.
  const [nextStaged, setNextStaged] = useState(null);
  const now = useNow();

  // The 3-second poll would pick these up on its own; refreshing immediately
  // just means the board reacts on the tap instead of a beat later.
  const refresh = async () => {
    const open = await refreshSession();
    if (open) await refreshBoard();
  };

  const handleDropClient = async (userId) => {
    await removeHubClient(userId);
    await refresh();
  };

  const handleEnd = async () => {
    setConfirmEnd(false);
    const endedCoachId = hubSession?.coach_id ?? null;
    const endedCoachName = hubSession?.coach_name ?? null;
    try {
      await end();
      // Best-effort: a failure here costs the prompt, not the end.
      stagedCountForCoach(endedCoachId)
        .then((n) => setNextStaged(n > 0 ? { count: n, coachName: endedCoachName } : null))
        .catch(() => {});
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
        {hubSession && !confirmEnd ? (
          <PressFade
            onPress={() => setAddOpen(true)}
            style={{ marginLeft: 16, borderRadius: 999, borderWidth: 1, borderColor: "#f0ddd2", backgroundColor: "#fdf6f2", paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 17, color: colors.primaryOnWhite, textAlign: "center" }}>
              + Add{"\n"}client
            </Text>
          </PressFade>
        ) : null}
        {hubSession ? (
          confirmEnd ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#57534e", marginRight: 8 }}>
                {hubSession.coach_name ? `End ${hubSession.coach_name.split(" ")[0]}'s session?` : "End this session?"}
              </Text>
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
        <View style={{ flex: 1 }}>
          <HubIdleScreen now={now} onPressClock={() => setStartOpen(true)} />
          {nextStaged ? (
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 34, alignItems: "center" }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 18,
                  backgroundColor: "#fdf6f2",
                  borderWidth: 1,
                  borderColor: "#f0ddd2",
                  borderRadius: 18,
                  paddingLeft: 24,
                  paddingRight: 14,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 18, color: "#7a5c49" }}>
                  {`${nextStaged.coachName ? nextStaged.coachName.split(" ")[0] : "You"} still ${
                    nextStaged.count === 1 ? "have a session" : `have ${nextStaged.count} sessions`
                  } staged today`}
                </Text>
                <PressFade
                  onPress={() => {
                    setNextStaged(null);
                    setStartOpen(true);
                  }}
                  style={{ borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 11 }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "white" }}>Start the next one</Text>
                </PressFade>
                <PressFade onPress={() => setNextStaged(null)} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>Not now</Text>
                </PressFade>
              </View>
            </View>
          ) : null}
        </View>
      ) : !board ? null : (
        <View style={{ flex: 1, padding: 14 }}>
          <HubLiveSession
            hub={hub}
            authorId={hubSession.coach_id}
            authorName={hubSession.coach_name?.split(" ")[0] ?? null}
            scale="tv"
            now={now}
            onDropClient={handleDropClient}
          />
        </View>
      )}

      <HubStartModal
        visible={startOpen}
        onClose={() => setStartOpen(false)}
        onStarted={async () => {
          setStartOpen(false);
          await refresh();
        }}
      />
      <HubAddClientModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onBoardUserIds={(hubSession?.clients ?? []).map((c) => c.user_id)}
        onAdded={async () => {
          setAddOpen(false);
          await refresh();
        }}
      />
    </View>
  );
}
