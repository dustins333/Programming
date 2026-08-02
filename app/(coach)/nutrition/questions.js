import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { listTemplateQuestions, addTemplateQuestion, deleteTemplateQuestion } from "../../../lib/nutrition/checkin";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

export default function CheckinQuestions() {
  const insets = useSafeAreaInsets();
  const [questions, setQuestions] = useState(null);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setQuestions(await listTemplateQuestions());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const nextPosition = questions.length > 0 ? Math.max(...questions.map((q) => q.position)) + 1 : 1;
      await addTemplateQuestion(newText.trim(), nextPosition);
      setNewText("");
      await load();
    } catch (err) {
      Alert.alert("Failed to add question", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTemplateQuestion(id);
      await load();
    } catch (err) {
      Alert.alert("Failed to delete question", err.message ?? String(err));
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading check-in questions: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!questions) {
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
    <View className="flex-1 bg-white px-6 py-8" style={{ paddingTop: insets.top + 20 }}>
      <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
        ‹ Back to Nutrition
      </Link>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl text-primary" style={{ fontFamily: fonts.display }}>
          Check-In Questions
        </Text>
        <Link href="/(coach)/nutrition/questionnaire" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>
          Onboarding questionnaire →
        </Link>
      </View>
      <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        This is the master template. Each client gets their own copy — use "Copy questions from
        template" on their nutrition page to apply changes to that client.
      </Text>

      <View className="mb-4 flex-row gap-3">
        <TextInput
          value={newText}
          onChangeText={setNewText}
          placeholder="New question…"
          className="flex-1 rounded-lg border border-stone-300 px-4 py-3"
          style={{ fontFamily: fonts.sans }}
        />
        <Pressable
          onPress={handleAdd}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            Add
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No questions yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
            <Text className="flex-1" style={{ fontFamily: fonts.sans }}>
              {item.question_text}
            </Text>
            <Pressable onPress={() => handleDelete(item.id)}>
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
                Remove
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
    </CoachShell>
  );
}
