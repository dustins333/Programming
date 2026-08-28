import { useCallback, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { PressFade } from "../PressFade";
import { EventDetailView } from "./EventDetailView";
import { CARD_BORDER } from "./EventCard";
import { getLiveEventDetail, getMyResponse, submitResponse, cancelResponse } from "../../lib/programming/events";
import { markEventSeen } from "../../lib/programming/eventSeen";
import { confirmCancelEventResponse } from "../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// Loading, the API calls and the error/retry state for one event, so the two
// places a member can reach an event render exactly the same thing:
//   - app/(member)/events/[eventId].js — pushed from the list, or from a push
//   - app/(member)/events/index.js — inline, when there's only one live event
// The host owns its own ScrollView, header and back affordance; this owns
// everything below that. EventDetailView itself owns the form state.
export function EventDetailScreen({ eventId, userId }) {
  const [event, setEvent] = useState(null);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !eventId) return;
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
      // Clears the tab badge for this event however she got here — a push
      // deep link never passes through the list screen.
      markEventSeen(eventId);
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
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", padding: 16 }}>
        <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
          {loadError}
        </Text>
        <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </PressFade>
      </View>
    );
  }

  return (
    <EventDetailView
      event={event}
      items={items}
      questions={questions}
      response={existing}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      submitting={submitting}
    />
  );
}
