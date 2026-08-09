import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getOnboardingStatus, submitQuestionnaire, logObjectiveTrackingDay } from "../../../lib/nutrition/onboarding";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { supabase } from "../../../lib/supabase/client";
import { formatDateMDY } from "../../../lib/formatDate";
import { notifyCoachOfClient } from "../../../lib/notifications/sendPush";
import { fonts, colors } from "../../../lib/theme";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

function StatusBadge({ done }) {
  return (
    <Text className="text-lg" style={{ color: done ? "#4d6142" : "#d6d3d1" }}>
      {done ? "✓" : "○"}
    </Text>
  );
}

function TaskButton({ label, detail, done, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-lg border-l-4 p-4"
      style={{ borderLeftColor: done ? "#4d6142" : colors.primary, backgroundColor: done ? "#faf8f6" : "white", borderWidth: 1, borderColor: "#ece7e1" }}
    >
      <View className="flex-1 pr-3">
        <Text style={{ fontFamily: fonts.sansMedium }}>{label}</Text>
        <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          {detail}
        </Text>
      </View>
      <StatusBadge done={done} />
    </Pressable>
  );
}

function QuestionnairePanel({ userId, questions, response, onSubmitted }) {
  const [values, setValues] = useState(() => Object.fromEntries(questions.map((q) => [q.id, ""])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (response) {
    return (
      <View>
        <Text className="mb-1 text-xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Questionnaire
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Submitted {formatDateMDY(response.submitted_at.slice(0, 10))}
        </Text>
        {response.answers.map((a, i) => (
          <View key={i} className="mb-3">
            <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold }}>
              {a.question}
            </Text>
            <Text style={{ fontFamily: fonts.sans }}>{a.answer || "—"}</Text>
          </View>
        ))}
      </View>
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const answers = questions.map((q) => ({ question: q.question_text, answer: values[q.id] || "" }));
      await submitQuestionnaire(userId, answers);
      await onSubmitted();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Text className="mb-4 text-xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Onboarding Questionnaire
      </Text>
      {questions.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          Your coach hasn't set up your intake questions yet.
        </Text>
      ) : (
        questions.map((q) => (
          <View key={q.id} className="mb-4">
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              {q.question_text}
            </Text>
            <TextInput
              value={values[q.id]}
              onChangeText={(t) => setValues((v) => ({ ...v, [q.id]: t }))}
              multiline
              inputAccessoryViewID={NUMERIC_DONE_ID}
              className="min-h-[70px] rounded-lg border border-stone-300 px-4 py-3 text-base"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
        ))
      )}
      {questions.length > 0 ? (
        <Pressable onPress={handleSubmit} disabled={submitting} className="items-center rounded-lg bg-primary py-3.5 disabled:opacity-50">
          <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {submitting ? "Submitting…" : "Submit"}
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text className="mt-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function DayForm({ date, initialValues, onSaved }) {
  const [values, setValues] = useState({
    protein_g: initialValues?.protein_g?.toString() ?? "",
    carb_g: initialValues?.carb_g?.toString() ?? "",
    fat_g: initialValues?.fat_g?.toString() ?? "",
    fiber_g: initialValues?.fiber_g?.toString() ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const saved = Boolean(initialValues);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSaved(date, values);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="mb-3 rounded-lg border border-stone-200 p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansMedium }}>{formatDateMDY(date)}</Text>
        {saved ? (
          <Text className="text-sm" style={{ fontFamily: fonts.sans, color: "#4d6142" }}>
            Saved ✓
          </Text>
        ) : null}
      </View>
      <View className="mb-2 flex-row gap-2">
        <TrackingField label="Protein (g)" value={values.protein_g} onChangeText={(t) => setValues((v) => ({ ...v, protein_g: t }))} />
        <TrackingField label="Carb (g)" value={values.carb_g} onChangeText={(t) => setValues((v) => ({ ...v, carb_g: t }))} />
      </View>
      <View className="mb-2 flex-row gap-2">
        <TrackingField label="Fat (g)" value={values.fat_g} onChangeText={(t) => setValues((v) => ({ ...v, fat_g: t }))} />
        <TrackingField label="Fiber (g)" value={values.fiber_g} onChangeText={(t) => setValues((v) => ({ ...v, fiber_g: t }))} />
      </View>
      <Pressable onPress={handleSubmit} disabled={submitting} className="mt-1 self-start rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
        <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {submitting ? "Saving…" : saved ? "Update" : "Save"}
        </Text>
      </Pressable>
      {error ? (
        <Text className="mt-1 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function TrackingField({ label, value, onChangeText }) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        inputAccessoryViewID={NUMERIC_DONE_ID}
        className="rounded-lg border border-stone-300 px-3 py-2 text-base"
        style={{ fontFamily: fonts.sans }}
      />
    </View>
  );
}

function ObjectiveTrackingPanel({ status, onLogged }) {
  return (
    <View>
      <Text className="mb-1 text-xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Objective Tracking
      </Text>
      {status.trackingCount > 0 ? (
        <Text className="mb-1 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: status.loggedCount >= status.trackingCount ? "#4d6142" : colors.primaryOnWhite }}>
          {status.loggedCount} of {status.trackingCount} days logged
        </Text>
      ) : null}
      <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Log what you'd normally eat on each assigned date below — no targets to hit, just an honest baseline. You can
        come back and update any day's numbers any time before your coach reviews them.
      </Text>
      {status.trackingDates.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          Your coach hasn't assigned any tracking dates yet.
        </Text>
      ) : (
        status.trackingDates.map((d) => (
          <DayForm key={d.id} date={d.date} initialValues={status.logsByDate[d.date]} onSaved={onLogged} />
        ))
      )}
    </View>
  );
}

const TASKS = [
  { key: "questionnaire", label: "Questionnaire", detail: "A few questions to help your coach get to know you" },
  { key: "tracking", label: "Objective Tracking", detail: "Log a few normal days so your coach can set a real baseline" },
  { key: "photos", label: "Starting Photos", detail: "Front, side, and back" },
];

export default function NutritionOnboarding() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const access = useNutritionAccess(profile.id);
  const [status, setStatus] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // KeyboardDoneButton floats above the keyboard on iOS (app/_layout.js) —
  // extra bottom padding when it's showing keeps it from covering the
  // questionnaire answer field. See lib/scrollToKeyboard.js.
  const keyboardHeight = useKeyboardHeight();
  const extraKeyboardPadding = keyboardHeight > 0 ? DONE_BAR_HEIGHT : 0;

  // Tracks the readyForReview phase across reloads so completing the last
  // task fires exactly one "ready for review" push to the assigned coach —
  // before this, every coach-side onboarding signal was pull-only.
  const wasReadyRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [onboardingStatus, { data: questionRows }] = await Promise.all([
        getOnboardingStatus(profile.id),
        supabase.from("client_questionnaire_questions").select("*").eq("client_id", profile.id).order("position"),
      ]);
      setStatus(onboardingStatus);
      setQuestions(questionRows ?? []);

      const isReady = Boolean(onboardingStatus?.phases?.readyForReview);
      if (wasReadyRef.current === false && isReady) {
        notifyCoachOfClient({
          clientUserId: profile.id,
          title: "Onboarding ready for review",
          body: `${profile.name ?? "A client"} finished their nutrition onboarding — review and set their targets.`,
          data: { type: "nutrition_onboarding_ready", url: `/nutrition/clients/${profile.id}` },
        }).catch((err) => console.error("Coach onboarding push failed:", err));
      }
      wasReadyRef.current = isReady;
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogDay = async (date, values) => {
    await logObjectiveTrackingDay(profile.id, date, values);
    await load();
  };

// Belt-and-suspenders: normal navigation to this screen only happens via
  // NutritionAccessMessage's "Continue onboarding" button, which already
  // only shows once status is "onboarding" (i.e. sent) — but a stale
  // bookmark/deep link could still land here directly for a "pending"
  // client, so this loads status/questions unconditionally and needs its
  // own gate too rather than trusting the caller.
  if (access.status !== "loading" && access.status !== "onboarding") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          {loadError}
        </Text>
      </View>
    );
  }

  if (!status || !questions) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (activeTask) {
    return (
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 32 + extraKeyboardPadding }}>
        <Pressable onPress={() => setActiveTask(null)} className="mb-4 self-start">
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </Pressable>
        {activeTask === "questionnaire" ? (
          <QuestionnairePanel userId={profile.id} questions={questions} response={status.response} onSubmitted={load} />
        ) : activeTask === "tracking" ? (
          <ObjectiveTrackingPanel status={status} onLogged={handleLogDay} />
        ) : (
          <View>
            <Text className="mb-2 text-xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              Starting Photos
            </Text>
            <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Front, side, and back — these give your coach a real starting point.
            </Text>
            <PhotoUpload userId={profile.id} onUploaded={load} />
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 32 + extraKeyboardPadding }}>
      <Pressable
        onPress={() => router.push("/(member)")}
        className="mb-4 self-start"
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Welcome, {profile.name}.
      </Text>
      <Text className="mb-5 text-stone-500" style={{ fontFamily: fonts.sans }}>
        Please complete these tasks to finish your onboarding.
      </Text>

      {status.phases.readyForReview ? (
        <View className="mb-4 rounded-lg border px-4 py-3" style={{ borderColor: "#dbe8cf", backgroundColor: "#eef1e7" }}>
          <Text style={{ fontFamily: fonts.sans, color: "#4d6142" }}>
            All done — your coach will review your info and set your targets soon.
          </Text>
        </View>
      ) : null}

      <View className="gap-3">
        {/* Objective Tracking is hidden entirely when the coach assigned no
            days — zero days means the phase was deliberately skipped (it
            auto-counts as complete, see lib/nutrition/onboarding.js), not
            an empty task for the member to puzzle over. */}
        {TASKS.filter((task) => task.key !== "tracking" || status.trackingCount > 0).map((task) => (
          <TaskButton
            key={task.key}
            label={task.label}
            detail={task.detail}
            done={status.phases[task.key]}
            onPress={() => setActiveTask(task.key)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
