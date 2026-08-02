import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { getClient } from "../../../../../../lib/nutrition/clients";
import { listQuestionnaireQuestions, copyQuestionnaireTemplateToClient } from "../../../../../../lib/nutrition/onboarding";
import { supabase } from "../../../../../../lib/supabase/client";
import { HighlightableAnswer } from "../../../../../../components/nutrition/HighlightableAnswer";
import { CoachShell } from "../../../../../../components/CoachShell";
import { formatDateMDY } from "../../../../../../lib/formatDate";
import { fonts, colors } from "../../../../../../lib/theme";

export default function OnboardingQuestionnaire() {
  const { userId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [response, setResponse] = useState(null);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [clientRow, questionRows, { data: responseRow }] = await Promise.all([
        getClient(userId),
        listQuestionnaireQuestions(userId),
        supabase.from("questionnaire_responses").select("*").eq("client_id", userId).maybeSingle(),
      ]);
      setClient(clientRow);
      setQuestions(questionRows);
      setResponse(responseRow);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      await copyQuestionnaireTemplateToClient(userId);
      await load();
    } catch (err) {
      Alert.alert("Failed to copy questions", err.message ?? String(err));
    } finally {
      setCopying(false);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!client || !questions) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 700 }}>
        <Link href={`/(coach)/nutrition/clients/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ {client.name}
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Questionnaire
        </Text>
        {response?.submitted_at ? (
          <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            Submitted {formatDateMDY(response.submitted_at.slice(0, 10))}
          </Text>
        ) : (
          <View className="mb-6" />
        )}

        {response ? (
          response.answers.map((a, i) => (
            <View key={i} className="mb-4">
              <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold }}>
                {a.question}
              </Text>
              <HighlightableAnswer text={a.answer || "—"} ranges={response.highlights?.[i]} />
            </View>
          ))
        ) : questions.length === 0 ? (
          <View>
            <Text className="mb-3 text-stone-500" style={{ fontFamily: fonts.sans }}>
              No questions on file for this client.
            </Text>
            <Pressable onPress={handleCopy} disabled={copying} className="self-start rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
              <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {copying ? "Copying…" : "Copy questions from template"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            Not submitted yet.
          </Text>
        )}
      </ScrollView>
    </CoachShell>
  );
}
