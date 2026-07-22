import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise } from "../../../lib/boiseDate";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { getClientQuestions, getCheckinForWeek, submitCheckin } from "../../../lib/nutrition/checkin";
import { fonts, colors } from "../../../lib/theme";

export default function WeeklyCheckin() {
  const { profile } = useAuth();
  const today = todayInBoise();
  const { currentWeek } = computeWeekWindows(today);
  const [questions, setQuestions] = useState(null);
  const [response, setResponse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
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
  }, [profile.id, currentWeek.start]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = questions.map((q) => ({ question: q.question_text, answer: answers[q.id] || "" }));
      const saved = await submitCheckin(profile.id, payload);
      setResponse(saved);
    } catch (err) {
      Alert.alert("Failed to submit", err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

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
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-1 text-2xl text-primary" style={{ fontFamily: fonts.display }}>
        Weekly Check-In
      </Text>
      <Text className="mb-6 text-base text-neutral-500" style={{ fontFamily: fonts.sans }}>
        Week of {currentWeek.start}
      </Text>

      {questions.length === 0 && (
        <Text className="text-neutral-500" style={{ fontFamily: fonts.sans }}>
          No check-in questions set up yet — check with your coach.
        </Text>
      )}

      {response ? (
        <View>
          <Text className="mb-4 text-neutral-700" style={{ fontFamily: fonts.sansMedium }}>
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
              <Text className="mb-1 text-sm text-neutral-700" style={{ fontFamily: fonts.sansMedium }}>
                {q.question_text}
              </Text>
              <TextInput
                value={answers[q.id] || ""}
                onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
                multiline
                className="min-h-[80px] rounded-lg border border-neutral-300 px-4 py-3 text-base"
                style={{ fontFamily: fonts.sans }}
              />
            </View>
          ))}
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
