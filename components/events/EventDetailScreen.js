import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, Platform, ScrollView } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { PressFade } from "../PressFade";
import { EventDetailView } from "./EventDetailView";
import { CARD_BORDER } from "./EventCard";
import { getLiveEventDetail, getMyResponse, submitResponse, cancelResponse } from "../../lib/programming/events";
import { markEventSeen } from "../../lib/programming/eventSeen";
import { clearBag } from "../../lib/programming/eventBag";
import { confirmCancelEventResponse, confirmLeaveUnsentBag } from "../../lib/confirmDialog";
import { toastError, toastSuccess, showToast } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// Loading, the API calls and the error/retry state for one event, so the two
// places a member can reach an event render exactly the same thing:
//   - app/(member)/events/[eventId].js — pushed from the list, or from a push
//   - app/(member)/events/index.js — inline, when there's only one live event
// The host owns its own ScrollView, header and back affordance; this owns
// everything below that. EventDetailView itself owns the form state.
export function EventDetailScreen({ eventId, userId, header = null, contentContainerStyle }) {
  const [event, setEvent] = useState(null);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // An unsent bag, and how many items are in it. Refs for the navigation
  // listeners, which are registered once and must read the current value.
  const navigation = useNavigation();
  const bagRef = useRef({ dirty: false, count: 0 });
  const [bagDirty, setBagDirty] = useState(false);
  const leavingRef = useRef(false);
  const handleBagDirtyChange = useCallback((dirty, count) => {
    bagRef.current = { dirty, count };
    setBagDirty(dirty);
  }, []);

  // Leaving with an unsent bag. The bag is already saved on the device, so
  // none of this can lose anything; it's a reminder that nothing is ORDERED
  // until she submits.
  //   - Back out of the pushed event: a real "Leave anyway?" confirm.
  //   - Switch tabs: a tab switch can't be cleanly held up, so a toast plus
  //     the dot on the Events tab instead.
  // `blur` fires before the tab navigator pops this stack to top, so by the
  // time that pop reaches beforeRemove she has already left, and asking her
  // to confirm on a screen she can no longer see would be a trap.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const offFocus = navigation.addListener("focus", () => {
      leavingRef.current = false;
    });
    const offBlur = navigation.addListener("blur", () => {
      const wasLeaving = leavingRef.current;
      leavingRef.current = true;
      if (bagRef.current.dirty && !wasLeaving) {
        showToast("Your bag hasn't been sent yet. It's saved for when you come back.", { type: "info" });
      }
    });
    const offRemove = navigation.addListener("beforeRemove", (e) => {
      if (!bagRef.current.dirty || leavingRef.current) return;
      e.preventDefault();
      confirmLeaveUnsentBag(bagRef.current.count).then((ok) => {
        if (!ok) return;
        leavingRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return () => {
      offFocus();
      offBlur();
      offRemove();
    };
  }, [navigation]);

  // Closing or reloading the browser tab. Mobile browsers mostly ignore this,
  // which is fine: the bag survives either way.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !bagDirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [bagDirty]);

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
      toastError(existing ? "Your bag is empty. To take back your order, use Cancel my order." : "Add something to your bag first.");
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
      // Cleared before the refetch, so the reseed finds nothing to restore.
      if (event.response_type === "order") await clearBag(userId, eventId);
      toastSuccess(
        event.response_type === "order" ? (existing ? "Order updated." : "Order sent.") : existing ? "Updated." : "Signed up."
      );
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
      await clearBag(userId, eventId);
      toastSuccess("Cancelled.");
      await load();
    } catch (err) {
      toastError("Couldn't cancel", err);
    }
  };

  if (loading) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={contentContainerStyle}>
        {header}
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScrollView>
    );
  }

  if (loadError) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={contentContainerStyle}>
        {header}
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", padding: 16 }}>
          <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            {loadError}
          </Text>
          <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </View>
      </ScrollView>
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
      bagUserId={userId}
      onBagDirtyChange={handleBagDirtyChange}
      header={header}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
