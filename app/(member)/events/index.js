import { useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { PressFade } from "../../../components/PressFade";
import { EventCard, CARD_BORDER } from "../../../components/events/EventCard";
import { listLiveEventsForUser, listMyResponses } from "../../../lib/programming/events";
import { fonts, colors } from "../../../lib/theme";

export default function MemberEvents() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;

  const [events, setEvents] = useState([]);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const live = await listLiveEventsForUser(userId);
      setEvents(live);
      setResponses(await listMyResponses(userId, live.map((e) => e.id)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Tabs keep this mounted, and an event can close (or a response land)
  // while it sits in the background.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 40 }}
    >
      <View className="mb-5 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primary }}>Events</Text>
        <Image source={require("../../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : loadError ? (
        <View className="rounded-2xl bg-white p-5" style={{ borderWidth: 1, borderColor: CARD_BORDER }}>
          <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            Couldn't load what's on. {loadError}
          </Text>
          <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      ) : events.length === 0 ? (
        // Reachable only in the gap between the last event closing and this
        // screen's own tab disappearing — deliberately says nothing about
        // missing out on anything.
        <View className="rounded-2xl bg-white p-5" style={{ borderWidth: 1, borderColor: CARD_BORDER }}>
          <Text style={{ fontFamily: fonts.sans, color: "#57534e" }}>Nothing on right now. Check back soon.</Text>
        </View>
      ) : (
        events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            response={responses[event.id]}
            onPress={() => router.push(`/(member)/events/${event.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}
