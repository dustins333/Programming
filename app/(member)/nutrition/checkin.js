import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { getClientQuestions, getCheckinForWeek, submitCheckin, getActiveCheckinReopen } from "../../../lib/nutrition/checkin";
import { listAllPhotos, isPhotoRequirementWeek, hasAllAngles, PHOTO_RECENCY_DAYS } from "../../../lib/nutrition/photos";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { formatDateMDY } from "../../../lib/formatDate";
import { fonts, colors } from "../../../lib/theme";

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

function PopupModal({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white" style={{ maxHeight: "85%" }}>
          <View className="flex-row items-center justify-between border-b border-stone-100 px-5 py-4">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#78716c" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>{children}</ScrollView>
        </View>
      </View>
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
    } catch (err) {
      setReopenSubmitError(err.message ?? String(err));
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = questions.map((q) => ({ question: q.question_text, answer: answers[q.id] || "" }));
      const saved = await submitCheckin(profile.id, payload, { photosSkipReason: !photosUploaded ? skipReason : null });
      setResponse(saved);
    } catch (err) {
      setSubmitError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} />;
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your check-in: {loadError}
        </Text>
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
        Week of {currentWeek.start}
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
            disabled={reopenSubmitting || !reopenCanFinalize}
            className="mt-1 items-center rounded-lg bg-primary py-3 disabled:opacity-50"
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {reopenSubmitting ? "Submitting…" : "Submit missed check-in"}
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
          <Text className="mb-4 text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Submitted {new Date(response.submitted_at).toLocaleDateString()}
          </Text>
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
            <TaskRow
              title="This week's progress photos"
              done={photosSatisfied}
              subtitle={photosUploaded ? "Submitted" : skipReason ? `Skipped — ${skipReason}` : "Tap to upload"}
              onPress={() => setPhotoPopupOpen(true)}
            />
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
              disabled={submitting || !canFinalize}
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

      <PopupModal visible={formPopupOpen} title="Check-in form" onClose={() => setFormPopupOpen(false)}>
        {questions.map((q) => (
          <View key={q.id} className="mb-4">
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              {q.question_text}
            </Text>
            <TextInput
              value={answers[q.id] || ""}
              onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
              multiline
              className="min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
        ))}
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

          <PopupModal visible={reopenFormPopupOpen} title="Check-in form" onClose={() => setReopenFormPopupOpen(false)}>
            {questions.map((q) => (
              <View key={q.id} className="mb-4">
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  {q.question_text}
                </Text>
                <TextInput
                  value={reopenAnswers[q.id] || ""}
                  onChangeText={(t) => setReopenAnswers((a) => ({ ...a, [q.id]: t }))}
                  multiline
                  className="min-h-[80px] rounded-lg border border-stone-300 px-4 py-3 text-base"
                  style={{ fontFamily: fonts.sans }}
                />
              </View>
            ))}
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
    </ScrollView>
  );
}
