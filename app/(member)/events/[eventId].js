import { Text, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { PressFade } from "../../../components/PressFade";
import { EventDetailScreen } from "../../../components/events/EventDetailScreen";
import { fonts, colors } from "../../../lib/theme";

// Reached from the Events list (2+ live events) or straight from a push
// notification. With exactly one live event the tab renders the same detail
// inline instead — see events/index.js — so everything below the back link
// lives in the shared EventDetailScreen.
export default function MemberEventDetail() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <PressFade
        onPress={() => (router.canGoBack() ? router.back() : router.push("/(member)/events"))}
        style={{ marginBottom: 14, alignSelf: "flex-start" }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Events</Text>
      </PressFade>

      <EventDetailScreen eventId={eventId} userId={session?.user?.id} />
    </ScrollView>
  );
}
