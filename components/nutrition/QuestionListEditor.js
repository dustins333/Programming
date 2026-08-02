import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { fonts, colors } from "../../lib/theme";

// Shared add/rename/reorder/delete list editor for question templates and
// per-client question sets (checkin template, questionnaire template,
// per-client checkin questions all use this one component). `questions` must
// already be sorted by position. Reorder swaps `position` between a row and
// its neighbor via two onUpdate calls rather than needing drag-and-drop.
export function QuestionListEditor({ title, description, questions, onAdd, onUpdate, onDelete, onMove, busy }) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const handleAdd = async () => {
    if (!newText.trim()) return;
    try {
      await onAdd(newText.trim());
      setNewText("");
    } catch (err) {
      Alert.alert("Failed to add question", err.message ?? String(err));
    }
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditText(q.question_text);
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    try {
      await onUpdate(editingId, editText.trim());
      setEditingId(null);
    } catch (err) {
      Alert.alert("Failed to save question", err.message ?? String(err));
    }
  };

  const handleDelete = async (id) => {
    try {
      await onDelete(id);
    } catch (err) {
      Alert.alert("Failed to remove question", err.message ?? String(err));
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    try {
      await onMove(questions[index], questions[targetIndex]);
    } catch (err) {
      Alert.alert("Failed to reorder", err.message ?? String(err));
    }
  };

  return (
    <View>
      {title ? (
        <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {description}
        </Text>
      ) : null}

      <View className="mb-3 flex-row gap-2">
        <TextInput
          value={newText}
          onChangeText={setNewText}
          placeholder="New question…"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          style={{ fontFamily: fonts.sans }}
        />
        <Pressable onPress={handleAdd} disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
            Add
          </Text>
        </Pressable>
      </View>

      {questions.length === 0 ? (
        <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          No questions yet.
        </Text>
      ) : (
        questions.map((q, i) => (
          <View key={q.id} className="mb-2 rounded-lg border border-stone-200 px-3 py-2.5">
            {editingId === q.id ? (
              <View>
                <TextInput
                  value={editText}
                  onChangeText={setEditText}
                  autoFocus
                  multiline
                  className="mb-2 rounded border border-stone-300 px-2.5 py-2 text-sm"
                  style={{ fontFamily: fonts.sans }}
                />
                <View className="flex-row justify-end gap-3">
                  <Pressable onPress={() => setEditingId(null)}>
                    <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable onPress={saveEdit}>
                    <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                      Save
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <View className="mr-1">
                  <Pressable onPress={() => handleMove(i, "up")} disabled={i === 0} hitSlop={6}>
                    <Text style={{ fontSize: 11, color: i === 0 ? "#d6d3d1" : "#78716c" }}>▲</Text>
                  </Pressable>
                  <Pressable onPress={() => handleMove(i, "down")} disabled={i === questions.length - 1} hitSlop={6}>
                    <Text style={{ fontSize: 11, color: i === questions.length - 1 ? "#d6d3d1" : "#78716c" }}>▼</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => startEdit(q)} className="flex-1">
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13.5 }}>{q.question_text}</Text>
                </Pressable>
                <Pressable onPress={() => startEdit(q)} hitSlop={8}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(q.id)} hitSlop={8}>
                  <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}
