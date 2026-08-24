import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { useHubBoard } from "../../../components/hub/useHubBoard";
import { HubLiveSession } from "../../../components/hub/HubLiveSession";
import { HubSessionSetup } from "../../../components/hub/HubSessionSetup";
import { HubPinCard } from "../../../components/hub/HubPinCard";
import { HubAddClientModal } from "../../../components/hub/HubPickerModals";
import { removeHubClient } from "../../../lib/programming/hub";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { toastError } from "../../../lib/toast";
import { fonts, colors, type } from "../../../lib/theme";

// The coach's side of the SPC Live Session Hub: pick up to 4 clients + which
// session each is doing, start it (the wall display picks it up within ~5s),
// then run/edit the same live board from the phone — enter any client's
// reps/weights, tick lifts, reorder on the fly, finalize, end.
//
// One universal file, no .web.js sibling: the spc Stack layout already
// scopes it, and HubLiveSession itself branches phone-vs-desktop width.
export default function SpcLiveSession() {
  const { profile } = useAuth();
  const hub = useHubBoard({ idlePoll: true });
  const { hubSession, board, pollError, end, refreshSession, refreshBoard } = hub;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const handleStarted = async () => {
    await refreshSession();
    await refreshBoard();
  };

  // Add and drop mid-session, so a no-show or a walk-in doesn't mean ending
  // the session and building it again (migration 0083). No PIN on this side:
  // the coach is already signed in.
  const handleDropClient = async (userId) => {
    await removeHubClient(userId);
    await handleStarted();
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    try {
      await end();
      setConfirmEnd(false);
    } catch (e) {
      toastError("Couldn't end the session.", e);
    } finally {
      setEnding(false);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 28, flexGrow: 1 }}>
        <View className="mb-4 flex-row items-center justify-between">
          <View style={{ flex: 1 }}>
            <PressFade onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc"))} style={{ marginBottom: 6 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
            </PressFade>
            <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              Live session
            </Text>
          </View>
          {hubSession && !confirmEnd ? (
            <PressFade
              onPress={() => setAddOpen(true)}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: "#f0ddd2", backgroundColor: "#fdf6f2", paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>+ Add client</Text>
            </PressFade>
          ) : null}
          {hubSession ? (
            confirmEnd ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <PressFade
                  onPress={handleEnd}
                  disabled={ending}
                  style={{ backgroundColor: "#b23a22", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 6, opacity: ending ? 0.5 : 1 }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "white" }}>{ending ? "Ending…" : "End it"}</Text>
                </PressFade>
                <PressFade onPress={() => setConfirmEnd(false)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>Keep going</Text>
                </PressFade>
              </View>
            ) : (
              <PressFade
                onPress={() => setConfirmEnd(true)}
                style={{ borderRadius: 999, borderWidth: 1, borderColor: "#ece7e1", paddingHorizontal: 14, paddingVertical: 8 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>End session</Text>
              </PressFade>
            )
          ) : null}
        </View>

        {pollError && hubSession ? (
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#8a5a2e", marginBottom: 8 }}>Reconnecting…</Text>
        ) : null}

        {hubSession === undefined ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !hubSession ? (
          <View>
            <HubSessionSetup profile={profile} onStarted={handleStarted} />
            <HubPinCard />
          </View>
        ) : !board ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={{ flex: 1, minHeight: 480 }}>
            <HubLiveSession
              hub={hub}
              authorId={profile?.id ?? null}
              authorName={profile?.name?.split(" ")[0] ?? null}
              scale="phone"
              onDropClient={handleDropClient}
            />
          </View>
        )}

        <HubAddClientModal
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onBoardUserIds={(hubSession?.clients ?? []).map((c) => c.user_id)}
          onAdded={async () => {
            setAddOpen(false);
            await handleStarted();
          }}
        />
      </ScrollView>
    </CoachShell>
  );
}
