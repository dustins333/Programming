import { useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { PressFade } from "../../../components/PressFade";
import { EventDetailView } from "../../../components/events/EventDetailView";
import { CARD_BORDER } from "../../../components/events/EventCard";
import { getLiveEventDetail, getMyResponse, submitResponse, cancelResponse } from "../../../lib/programming/events";
import { confirmCancelEventResponse } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";

// Data loading and the API calls live here; the view itself is
// components/events/EventDetailView.js so the coach's Preview button renders
// exactly what a member gets.
export default function MemberEventDetail() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams();
  const userId = session?.user?.id;

  const [event, setEvent] = useState(null);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const [{ event: row, items: itemRows, questions: questionRows }, response] = await Promise.all([
        getLiveEventDetail(eventId),
        getMyResponse(eventId, userId),
      ]);
      if (!row) throw new Error("This event isn't available any more.");
      setEvent(row);
      setItems(itemRows);
      setQuestions(questionRows);
      setExisting(response);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSubmit = async (payload) => {
    if (event.response_type === "order" && payload.orderTotal === 0) {
      toastError("Pick at least one item first.");
      return;
    }
    setSubmitting(true);
    try {
      await submitResponse({
        eventId,
        userId,
        guestCount: payload.guestCount,
        answers: payload.answers,
        lineItems: payload.lineItems,
      });
      toastSuccess(existing ? "Updated." : event.response_type === "order" ? "Order placed." : "Signed up.");
      await load();
    } catch (err) {
      toastError("Couldn't send that", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const confirmed = await confirmCancelEventResponse(event.title);
    if (!confirmed) return;
    try {
      await cancelResponse(eventId, userId);
      toastSuccess("Cancelled.");
      await load();
    } catch (err) {
      toastError("Couldn't cancel", err);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

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

      {loadError ? (
        <View
          style={{ borderRadius: 18, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", padding: 16 }}
        >
          <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            {loadError}
          </Text>
          <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      ) : (
        <EventDetailView
          event={event}
          items={items}
          questions={questions}
          response={existing}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={submitting}
        />
      )}
    </ScrollView>
  );
}
