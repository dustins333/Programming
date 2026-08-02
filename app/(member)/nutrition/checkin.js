import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { getClientQuestions, getCheckinForWeek, submitCheckin } from "../../../lib/nutrition/checkin";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";

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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (access.status !== "active") return;
    (async () => {
      try {
        const [q, r] = await Promise.all([
          getClientQuestions(profile.id),
          getCheckinForWeek(profile.id, currentWeek.start),
        ]);
        setQuestions(q);
        setResponse(r);
      } catch (err) {
        setLoadError(err.message ?? String(err));
      }
    })();
  }, [access.status, profile.id, currentWeek.start]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = questions.map((q) => ({ question: q.question_text, answer: answers[q.id] || "" }));
      const saved = await submitCheckin(profile.id, payload);
      setResponse(saved);
    } catch (err) {
      // The standalone app's submitCheckin also throws when that week
      // requires progress photos and none are uploaded yet (Phase 5) — that
      // error message is safe to surface as-is once it starts firing.
      setSubmitError(err.message ?? String(err));
      Alert.alert("Failed to submit", err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} />;
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your check-in: {loadError}
        </Text>
      </View>
    );
  }

  if (!questions) {
    return <NutritionAccessMessage status="loading" />;
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
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

      {questions.length === 0 && (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No check-in questions set up yet — check with your coach.
        </Text>
      )}

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
        <>
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
          {submitError ? (
            <Text className="mb-3 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              {submitError}
            </Text>
          ) : null}
          {questions.length > 0 && (
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="mb-6 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
            >
              <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {submitting ? "Submitting…" : "Submit Check-In"}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}
