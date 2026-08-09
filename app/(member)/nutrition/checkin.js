import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays, dateInBoise } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { getClientQuestions, getCheckinForWeek, submitCheckin, getActiveCheckinReopen } from "../../../lib/nutrition/checkin";
import { listAllPhotos, isPhotoRequirementWeek, hasAllAngles, PHOTO_RECENCY_DAYS } from "../../../lib/nutrition/photos";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { ZoomSchedulerModal } from "../../../components/nutrition/ZoomSchedulerModal";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { formatDateMDY } from "../../../lib/formatDate";
import { toastSuccess } from "../../../lib/toast";
import { notifyCoachOfClient } from "../../../lib/notifications/sendPush";
import { fonts, colors } from "../../../lib/theme";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { KeyboardDoneButton } from "../../../components/KeyboardDoneButton";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

// Matches My Week/My Fitness/My History's shared canvas — the 4 nutrition
// screens were left on plain white, which read as inconsistent with the
// rest of the app once actually seen side by side. Card surfaces inside
// (TaskRow etc.) stay bg-white, same "white card on canvas" pattern those
// other tabs already use.
const CANVAS = "#faf8f6";

function TaskRow({ title, subtitle, done, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-center justify-between rounded-2xl border px-4 py-3.5"
      style={{ borderColor: done ? "#4d6142" : "#ece7e1", borderWidth: done ? 2 : 1, backgroundColor: done ? "#f3f6ef" : "white" }}
    >
      <View className="flex-1 flex-row items-center gap-2.5">
        <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={21} color={done ? "#4d6142" : "#a8a29e"} />
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>{title}</Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#a8a29e" />
    </Pressable>
  );
}

// Radio-button rendering for a single_choice question (migration 0042) —
// used in place of the free-text TextInput below, in both the live and
// reopened-week forms.
function ChoiceQuestion({ question, value, onChange }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {question.question_text}
      </Text>
      {(question.options || []).map((opt) => {
        const selected = value === opt;
        return (
          <Pressable key={opt} onPress={() => onChange(opt)} className="mb-2 flex-row items-center gap-2.5 py-1">
            <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={19} color={selected ? colors.primaryOnWhite : "#a8a29e"} />
            <Text className="text-base" style={{ fontFamily: fonts.sans }}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// scrollViewRef/scrollOffsetRef are optional — only the two form popups
// (check-in questions) actually have TextInputs that need scrolling into
// view; the photo popups pass nothing and this component just falls back
// to its own local (unused-for-scrolling) refs. Either way, the extra
// keyboard-aware bottom padding applies unconditionally — a Modal's own
// fixed maxHeight (85%) plus a short question list means there's often not
// enough scrollable room to reveal a lower field without it, matching
// lib/scrollToKeyboard.js's own "give the ScrollView more room to scroll"
// fix. No tab bar to subtract here — a native Modal presents above the tab
// bar entirely, so the raw occluded height is already correct.
function PopupModal({ visible, title, onClose, children, scrollViewRef: externalScrollViewRef, scrollOffsetRef: externalScrollOffsetRef }) {
  const internalScrollViewRef = useRef(null);
  const internalScrollOffsetRef = useRef(0);
  const scrollViewRef = externalScrollViewRef ?? internalScrollViewRef;
  const scrollOffsetRef = externalScrollOffsetRef ?? internalScrollOffsetRef;
  const keyboardHeight = useKeyboardHeight();
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* House bottom sheet (canvas bg, 22px top radius, warm scrim) — this
          was one of the two member-facing centered-card holdouts. */}
      <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full"
          style={{ maxHeight: "85%", backgroundColor: "#faf8f6", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" }}
        >
          <View className="flex-row items-center justify-between border-b border-stone-200 px-5 py-4">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#78716c" />
            </Pressable>
          </View>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ padding: 20, paddingBottom: 20 + occludedHeight }}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
      <KeyboardDoneButton />
    </Modal>
  );
}

function SkipReasonModal({ visible, onClose, onSubmit }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full rounded-2xl bg-white p-5" style={{ maxWidth: 420 }}>
          <Text className="mb-2" style={{ fontFamily: fonts.sansBold, fontSize: 15 }}>
            Why can't you provide progress pictures this week?
          </Text>
          <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Your coach will see this note along with your check-in.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            inputAccessoryViewID={NUMERIC_DONE_ID}
            placeholder="e.g. traveling this week, will catch up next week"
            className="mb-4 min-h-[80px] rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            style={{ fontFamily: fonts.sans }}
          />
          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => text.trim() && onSubmit(text.trim())}
              disabled={!text.trim()}
              className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                Save
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <KeyboardDoneButton />
    </Modal>
  );
}

export default function WeeklyCheckin() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayInBoise();
  const { currentWeek } = computeWeekWindows(today);
  const access = useNutritionAccess(profile.id);
  useFocusEffect(useCallback(() => access.refetch(), [access.refetch]));

  const [questions, setQuestions] = useState(null);
  const [response, setResponse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [photos, setPhotos] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [photoPopupOpen, setPhotoPopupOpen] = useState(false);
  const [formPopupOpen, setFormPopupOpen] = useState(false);
  const [skipReason, setSkipReason] = useState(null);
  const [skipModalOpen, setSkipModalOpen] = useState(false);

  // A coach-reopened missed week (see CheckinWeekTimeline's "Reopen"
  // action) — a second, independent submission target alongside the live
  // currentWeek above, not a replacement for it.
  const [reopen, setReopen] = useState(null);
  const [reopenAnswers, setReopenAnswers] = useState({});
  const [reopenPhotoPopupOpen, setReopenPhotoPopupOpen] = useState(false);
  const [reopenFormPopupOpen, setReopenFormPopupOpen] = useState(false);
  const [reopenSkipReason, setReopenSkipReason] = useState(null);
  const [reopenSkipModalOpen, setReopenSkipModalOpen] = useState(false);
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [reopenSubmitError, setReopenSubmitError] = useState(null);
  const [reopenSubmitted, setReopenSubmitted] = useState(false);

  // Opened right after a successful submit if the member's answer to a
  // single_choice question matches that question's booking_option (the
  // "Loom or Zoom" question, once a coach sets it up — see migration 0042).
  const [schedulerOpen, setSchedulerOpen] = useState(false);

  // One scrollViewRef/scrollOffsetRef pair per form popup (live + reopened
  // week) — each PopupModal owns its own ScrollView, so a shared ref
  // wouldn't point at the right one. Per-question TextInput refs live in a
  // Map (dynamic-length list, same pattern used elsewhere for a mapped
  // array of fields) so onFocus can scroll that exact question into view.
  const formScrollViewRef = useRef(null);
  const formScrollOffsetRef = useRef(0);
  const scrollFormFieldIntoView = useScrollToKeyboard(formScrollViewRef, formScrollOffsetRef);
  const formAnswerRefs = useRef(new Map());
  const reopenFormScrollViewRef = useRef(null);
  const reopenFormScrollOffsetRef = useRef(0);
  const scrollReopenFormFieldIntoView = useScrollToKeyboard(reopenFormScrollViewRef, reopenFormScrollOffsetRef);
  const reopenFormAnswerRefs = useRef(new Map());

  const load = async () => {
    try {
      const [q, r, p] = await Promise.all([
        getClientQuestions(profile.id),
        getCheckinForWeek(profile.id, currentWeek.start),
        listAllPhotos(profile.id),
      ]);
      setQuestions(q);
      setResponse(r);
      setPhotos(p);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }

    // Isolated from the load above — migration 0028 (check-in reopens) may
    // not be run yet on a given environment, and that shouldn't block the
    // normal current-week check-in from loading.
    try {
      setReopen(await getActiveCheckinReopen(profile.id, today));
    } catch (err) {
      console.error("Failed to load check-in reopen status:", err);
    }
  };

  useEffect(() => {
    if (access.status !== "active") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.status, profile.id, currentWeek.start]);

  const photosRequired = access.client ? isPhotoRequirementWeek(access.client, currentWeek.start) : false;
  // Checked against a rolling recency window (today back PHOTO_RECENCY_DAYS
  // days), not just "since this calendar week's Monday" — a member who
  // already uploaded via the Photos tab (independent of Check-In) shouldn't
  // be asked to do it again just because Check-In didn't know about it.
  const recentPhotos = useMemo(() => (photos ?? []).filter((p) => p.date >= addDays(today, -PHOTO_RECENCY_DAYS)), [photos, today]);
  const photosUploaded = hasAllAngles(recentPhotos);
  const photosSatisfied = !photosRequired || photosUploaded || !!skipReason;
  const formSatisfied = questions ? questions.every((q) => (answers[q.id] || "").trim().length > 0) : false;
  const canFinalize = photosSatisfied && (questions?.length === 0 || formSatisfied);

  const reopenWeekEnd = reopen ? addDays(reopen.week_start, 6) : null;
  const reopenPhotosRequired = access.client && reopen ? isPhotoRequirementWeek(access.client, reopen.week_start) : false;
  // That week's own photos, not a recency window relative to today — a
  // late submission is filed well after the missed week itself, so "in the
  // last 5 days" would almost never match. Anything from that week onward
  // (including a fresh upload made right now, while catching up) counts.
  const reopenRecentPhotos = useMemo(() => (reopen ? (photos ?? []).filter((p) => p.date >= reopen.week_start) : []), [photos, reopen]);
  const reopenPhotosUploaded = hasAllAngles(reopenRecentPhotos);
  const reopenPhotosSatisfied = !reopenPhotosRequired || reopenPhotosUploaded || !!reopenSkipReason;
  const reopenFormSatisfied = questions ? questions.every((q) => (reopenAnswers[q.id] || "").trim().length > 0) : false;
  const reopenCanFinalize = reopenPhotosSatisfied && (questions?.length === 0 || reopenFormSatisfied);

  const answerTriggersBooking = (answersMap) =>
    (questions || []).some((q) => q.question_type === "single_choice" && q.booking_option && answersMap[q.id] === q.booking_option);

  // Same check against an already-submitted response's stored
  // {question, answer} pairs (keyed by question text, not id) — powers the
  // "Schedule your Zoom call" re-entry on the submitted state.
  const responseTriggersBooking = (resp) =>
    (questions || []).some(
      (q) =>
        q.question_type === "single_choice" &&
        q.booking_option &&
        (resp?.answers ?? []).some((a) => a.question === q.question_text && a.answer === q.booking_option)
    );

  // Finalize used to just be silently disabled when the form wasn't ready —
  // no explanation, which read as "the button isn't working." Now the
  // button stays tappable and this builds a specific "go do X" message
  // instead, shown via the existing submitError/reopenSubmitError text.
  const buildReadinessMessage = (answersMap, needsPhotos, photosOk) => {
    const missingCount = (questions || []).filter((q) => !(answersMap[q.id] || "").trim()).length;
    const parts = [];
    if (needsPhotos && !photosOk) parts.push("upload this week's progress photos");
    if (missingCount > 0) parts.push(`answer the ${missingCount} remaining question${missingCount === 1 ? "" : "s"} in the check-in form`);
    if (parts.length === 0) return null;
    return `Before finalizing, ${parts.join(" and ")}.`;
  };

  const handlePhotosUploaded = async () => {
    setPhotoPopupOpen(false);
    try {
      setPhotos(await listAllPhotos(profile.id));
    } catch (err) {
      console.error("Failed to refresh photos:", err);
    }
  };

  const handleReopenPhotosUploaded = async () => {
    setReopenPhotoPopupOpen(false);
    try {
      setPhotos(await listAllPhotos(profile.id));
    } catch (err) {
      console.error("Failed to refresh photos:", err);
    }
  };

  const handleReopenSubmit = async () => {
    if (!reopenCanFinalize) {
      setReopenSubmitError(buildReadinessMessage(reopenAnswers, reopenPhotosRequired, reopenPhotosSatisfied));
      return;
    }
    setReopenSubmitting(true);
    setReopenSubmitError(null);
    try {
      const payload = questions.map((q) => ({ question: q.question_text, answer: reopenAnswers[q.id] || "" }));
      await submitCheckin(profile.id, payload, {
        weekStart: reopen.week_start,
        photosSkipReason: !reopenPhotosUploaded ? reopenSkipReason : null,
      });
      setReopenSubmitted(true);
      setReopen(null);
      toastSuccess("Check-in submitted — your coach will review it!");
      notifyCoachOfClient({
        clientUserId: profile.id,
        title: "Missed check-in submitted",
        body: `${profile.name ?? "A client"} caught up on a reopened check-in.`,
        data: { type: "nutrition_checkin_submitted", url: `/nutrition/clients/${profile.id}` },
      }).catch((err) => console.error("Coach check-in push failed:", err));
      if (answerTriggersBooking(reopenAnswers)) setSchedulerOpen(true);
    } catch (err) {
      setReopenSubmitError(err.message ?? String(err));
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canFinalize) {
      setSubmitError(buildReadinessMessage(answers, photosRequired, photosSatisfied));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = questions.map((q) => ({ question: q.question_text, answer: answers[q.id] || "" }));
      const saved = await submitCheckin(profile.id, payload, { photosSkipReason: !photosUploaded ? skipReason : null });
      setResponse(saved);
      toastSuccess("Check-in submitted — your coach will review it!");
      // Fire-and-forget — the coach side was entirely pull-based before
      // (nothing ever told a coach a check-in landed).
      notifyCoachOfClient({
        clientUserId: profile.id,
        title: "Check-in submitted",
        body: `${profile.name ?? "A client"} submitted their weekly check-in.`,
        data: { type: "nutrition_checkin_submitted", url: `/nutrition/clients/${profile.id}` },
      }).catch((err) => console.error("Coach check-in push failed:", err));
      if (answerTriggersBooking(answers)) setSchedulerOpen(true);
    } catch (err) {
      setSubmitError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1" style={{ backgroundColor: CANVAS }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24 }}>
          <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            Nutrition
          </Text>
          <SegmentedControl
            segments={NUTRITION_TABS}
            activeKey="checkin"
            onSelect={(key) => {
              const seg = NUTRITION_TABS.find((s) => s.key === key);
              if (seg && seg.key !== "checkin") router.push(seg.href);
            }}
          />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your check-in: {loadError}
          </Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!questions || !photos) {
    return <NutritionAccessMessage status="loading" />;
  }

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Nutrition
      </Text>
      <Text className="mb-4 text-base text-stone-500" style={{ fontFamily: fonts.sans }}>
        Week of {formatDateMDY(currentWeek.start)}
      </Text>

      <SegmentedControl
        segments={NUTRITION_TABS}
        activeKey="checkin"
        onSelect={(key) => {
          const seg = NUTRITION_TABS.find((s) => s.key === key);
          if (seg && seg.key !== "checkin") router.push(seg.href);
        }}
      />

      {reopen ? (
        <View className="mb-5 rounded-2xl border px-4 py-3.5" style={{ borderColor: "#b23a22", borderWidth: 1.5, backgroundColor: "#fdf6f2" }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#b23a22" }}>Missed check-in reopened</Text>
          <Text className="mb-3 mt-0.5 text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
            Week of {formatDateMDY(reopen.week_start)} – {formatDateMDY(reopenWeekEnd)} · complete by {formatDateMDY(reopen.expires_at)}
          </Text>

          {reopenPhotosRequired ? (
            <TaskRow
              title="That week's progress photos"
              done={reopenPhotosSatisfied}
              subtitle={reopenPhotosUploaded ? "Submitted" : reopenSkipReason ? `Skipped — ${reopenSkipReason}` : "Tap to upload"}
              onPress={() => setReopenPhotoPopupOpen(true)}
            />
          ) : null}

          {questions.length > 0 ? (
            <TaskRow
              title="Check-in form"
              done={reopenFormSatisfied}
              subtitle={reopenFormSatisfied ? "Ready to submit" : `${questions.length} question${questions.length === 1 ? "" : "s"}`}
              onPress={() => setReopenFormPopupOpen(true)}
            />
          ) : null}

          {reopenSubmitError ? (
            <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              {reopenSubmitError}
            </Text>
          ) : null}

          <Pressable
            onPress={handleReopenSubmit}
            disabled={reopenSubmitting}
            style={!reopenCanFinalize ? { opacity: 0.5 } : undefined}
            className="mt-1 items-center rounded-lg bg-primary py-3 disabled:opacity-50"
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {reopenSubmitting ? "Submitting…" : "Finalize missed check-in"}
            </Text>
          </Pressable>
        </View>
      ) : reopenSubmitted ? (
        <View className="mb-5 rounded-2xl border px-4 py-3.5" style={{ borderColor: "#4d6142", borderWidth: 2, backgroundColor: "#f3f6ef" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#4d6142" }}>
            Missed check-in submitted — thanks for catching up!
          </Text>
        </View>
      ) : null}

      {response ? (
        <View>
          {/* Green, affirmed — the primary path used to be a drab plain line
              while the reopened-exception path got the celebratory card. */}
          <View className="mb-4 rounded-2xl border px-4 py-3.5" style={{ borderColor: "#4d6142", borderWidth: 2, backgroundColor: "#f3f6ef" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#4d6142" }}>
              Submitted {formatDateMDY(dateInBoise(new Date(response.submitted_at)))} ✓ — your coach will review it.
            </Text>
            {responseTriggersBooking(response) ? (
              // The scheduler used to be openable exactly once, right after
              // submit — closing it ("Skip for now") permanently lost the
              // booking. This keeps a way back in for the rest of the week.
              <Pressable onPress={() => setSchedulerOpen(true)} className="mt-2 self-start rounded-lg px-3.5 py-2" style={{ backgroundColor: colors.primary }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                  Schedule your Zoom call
                </Text>
              </Pressable>
            ) : null}
          </View>
          {response.answers.map((a, i) => (
            <View key={i} className="mb-4">
              <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold }}>
                {a.question}
              </Text>
              <Text style={{ fontFamily: fonts.sans }}>{a.answer || "—"}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View>
          {questions.length === 0 && !photosRequired ? (
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
              No check-in questions set up yet — check with your coach.
            </Text>
          ) : null}

          {photosRequired ? (
            <>
              <TaskRow
                title="This week's progress photos"
                done={photosSatisfied}
                subtitle={photosUploaded ? "Submitted" : skipReason ? `Skipped — ${skipReason}` : "Tap to upload"}
                onPress={() => setPhotoPopupOpen(true)}
              />
              {!photosUploaded && !skipReason ? (
                // Surfaced on the task itself — the skip option used to hide
                // inside the upload modal, so a member who couldn't take
                // photos had to open an upload sheet to learn they could
                // decline.
                <Pressable onPress={() => setSkipModalOpen(true)} className="mb-3 self-start" hitSlop={8}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                    I can't provide photos this week
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {questions.length > 0 ? (
            <TaskRow
              title="Check-in form"
              done={formSatisfied}
              subtitle={formSatisfied ? "Ready to finalize" : `${questions.length} question${questions.length === 1 ? "" : "s"}`}
              onPress={() => setFormPopupOpen(true)}
            />
          ) : null}

          {submitError ? (
            <Text className="mb-3 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              {submitError}
            </Text>
          ) : null}

          {questions.length > 0 || photosRequired ? (
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={!canFinalize ? { opacity: 0.5 } : undefined}
              className="mt-2 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
            >
              <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {submitting ? "Finalizing…" : "Finalize Check-In"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <PopupModal visible={photoPopupOpen} title="This week's progress photos" onClose={() => setPhotoPopupOpen(false)}>
        <PhotoUpload userId={profile.id} onUploaded={handlePhotosUploaded} />
        {!photosUploaded ? (
          skipReason ? (
            <View className="mt-4 flex-row items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
              <Text className="flex-1 text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
                Skipped: {skipReason}
              </Text>
              <Pressable onPress={() => setSkipReason(null)} hitSlop={8}>
                <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                  Undo
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setSkipModalOpen(true)} className="mt-4 items-center py-1">
              <Text className="text-xs underline text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                I can't provide photos this week
              </Text>
            </Pressable>
          )
        ) : null}
      </PopupModal>

      <PopupModal
        visible={formPopupOpen}
        title="Check-in form"
        onClose={() => setFormPopupOpen(false)}
        scrollViewRef={formScrollViewRef}
        scrollOffsetRef={formScrollOffsetRef}
      >
        {questions.map((q) =>
          q.question_type === "single_choice" ? (
            <ChoiceQuestion key={q.id} question={q} value={answers[q.id] || ""} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ) : (
            <View key={q.id} className="mb-4">
              <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                {q.question_text}
              </Text>
              <TextInput
                ref={(el) => {
                  if (el) formAnswerRefs.current.set(q.id, el);
                }}
                value={answers[q.id] || ""}
                onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
                onFocus={() => scrollFormFieldIntoView(formAnswerRefs.current.get(q.id))}
                multiline
                inputAccessoryViewID={NUMERIC_DONE_ID}
                className="min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
                style={{ fontFamily: fonts.sans }}
              />
            </View>
          )
        )}
        <Pressable onPress={() => setFormPopupOpen(false)} className="items-center rounded-lg bg-primary py-3">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            Done
          </Text>
        </Pressable>
      </PopupModal>

      <SkipReasonModal
        visible={skipModalOpen}
        onClose={() => setSkipModalOpen(false)}
        onSubmit={(reason) => {
          setSkipReason(reason);
          setSkipModalOpen(false);
          setPhotoPopupOpen(false);
        }}
      />

      {reopen ? (
        <>
          <PopupModal visible={reopenPhotoPopupOpen} title="That week's progress photos" onClose={() => setReopenPhotoPopupOpen(false)}>
            <PhotoUpload userId={profile.id} onUploaded={handleReopenPhotosUploaded} />
            {!reopenPhotosUploaded ? (
              reopenSkipReason ? (
                <View className="mt-4 flex-row items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
                  <Text className="flex-1 text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
                    Skipped: {reopenSkipReason}
                  </Text>
                  <Pressable onPress={() => setReopenSkipReason(null)} hitSlop={8}>
                    <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                      Undo
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setReopenSkipModalOpen(true)} className="mt-4 items-center py-1">
                  <Text className="text-xs underline text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                    I can't provide photos for that week
                  </Text>
                </Pressable>
              )
            ) : null}
          </PopupModal>

          <PopupModal
            visible={reopenFormPopupOpen}
            title="Check-in form"
            onClose={() => setReopenFormPopupOpen(false)}
            scrollViewRef={reopenFormScrollViewRef}
            scrollOffsetRef={reopenFormScrollOffsetRef}
          >
            {questions.map((q) =>
              q.question_type === "single_choice" ? (
                <ChoiceQuestion key={q.id} question={q} value={reopenAnswers[q.id] || ""} onChange={(v) => setReopenAnswers((a) => ({ ...a, [q.id]: v }))} />
              ) : (
                <View key={q.id} className="mb-4">
                  <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                    {q.question_text}
                  </Text>
                  <TextInput
                    ref={(el) => {
                      if (el) reopenFormAnswerRefs.current.set(q.id, el);
                    }}
                    value={reopenAnswers[q.id] || ""}
                    onChangeText={(t) => setReopenAnswers((a) => ({ ...a, [q.id]: t }))}
                    onFocus={() => scrollReopenFormFieldIntoView(reopenFormAnswerRefs.current.get(q.id))}
                    multiline
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    className="min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
                    style={{ fontFamily: fonts.sans }}
                  />
                </View>
              )
            )}
            <Pressable onPress={() => setReopenFormPopupOpen(false)} className="items-center rounded-lg bg-primary py-3">
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                Done
              </Text>
            </Pressable>
          </PopupModal>

          <SkipReasonModal
            visible={reopenSkipModalOpen}
            onClose={() => setReopenSkipModalOpen(false)}
            onSubmit={(reason) => {
              setReopenSkipReason(reason);
              setReopenSkipModalOpen(false);
              setReopenPhotoPopupOpen(false);
            }}
          />
        </>
      ) : null}

      <ZoomSchedulerModal visible={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </ScrollView>
  );
}
