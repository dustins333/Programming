import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { CoachShell } from "../../../../components/CoachShell";
import { PressFade } from "../../../../components/PressFade";
import { useHubBoard } from "../../../../components/hub/useHubBoard";
import { HubLiveSession } from "../../../../components/hub/HubLiveSession";
import { getHubSessionForReview } from "../../../../lib/programming/hubHistory";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { formatTimeInBoise } from "../../../../lib/boiseDate";
import { formatDateShort } from "../../../../lib/formatDate";
import { fonts, colors, type } from "../../../../lib/theme";

// One finished board, reopened. Deliberately the SAME components the live
// board uses (HubLiveSession → HubClientColumn → HubLiftCard) rather than a
// read-only lookalike: a review screen that renders its own version of a lift
// card is a second thing to keep in step, and it would drift.
//
// It is fully writable — sets, notes, ticks, finalize — because the whole
// point is finishing the write-up afterwards. useHubBoard's review mode is
// what makes the sets land on the day the board ran instead of today.

export default function ReviewHubSession() {
  const params = useLocalSearchParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const { profile } = useAuth();
  const [session, setSession] = useState(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    if (!sessionId) return;
    setLoadError(null);
    getHubSessionForReview(sessionId)
      .then(setSession)
      .catch((e) => setLoadError(e.message ?? "Something went wrong."));
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Passed straight through — the hook keys its own effects on the id, so a
  // new object on every render costs nothing.
  const hub = useHubBoard({ idlePoll: false, reviewSession: session ?? null });

  const back = () => (router.canGoBack() ? router.back() : router.push("/(coach)/spc/sessions"));

  if (loadError) {
    return (
      <CoachShell>
        <View style={{ flex: 1, backgroundColor: "#fff", padding: 24 }}>
          <PressFade onPress={back} style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Past sessions</Text>
          </PressFade>
          <Text style={{ fontFamily: fonts.sans, color: "#b23a22" }}>Couldn't load that session: {loadError}</Text>
          <PressFade onPress={load} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      </CoachShell>
    );
  }

  if (session === undefined) {
    return (
      <CoachShell>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  if (session === null) {
    return (
      <CoachShell>
        <View style={{ flex: 1, backgroundColor: "#fff", padding: 24 }}>
          <PressFade onPress={back} style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Past sessions</Text>
          </PressFade>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted }}>That session no longer exists.</Text>
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1 }}>
          <PressFade onPress={back} style={{ marginBottom: 6 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Past sessions</Text>
          </PressFade>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {formatDateShort(session.date)} · {formatTimeInBoise(session.created_at)}
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
            {session.coach_name ? `${session.coach_name} · ` : ""}
            {session.clients.length} client{session.clients.length === 1 ? "" : "s"} · anything you change here saves to that day
          </Text>

          {!hub.board ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <HubLiveSession
              hub={hub}
              authorId={profile?.id}
              authorName={profile?.name?.split(" ")[0] ?? null}
              scale="phone"
            />
          )}
        </ScrollView>
      </View>
    </CoachShell>
  );
}
