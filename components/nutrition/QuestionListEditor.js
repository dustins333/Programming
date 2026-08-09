import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";
import { confirmRemoveQuestion } from "../../lib/confirmDialog";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

// Shared add/rename/reorder/delete list editor for question templates and
// per-client question sets (checkin template, questionnaire template,
// per-client checkin questions all use this one component). `questions` must
// already be sorted by position. Reorder swaps `position` between a row and
// its neighbor via two onUpdate calls rather than needing drag-and-drop.
//
// `choicesEnabled` opts a caller into the multiple-choice/booking-trigger
// editing UI (migration 0042) — only the two weekly check-in question lists
// (template + per-client) pass this; the questionnaire editors don't, and
// stay exactly as before. When on, `onUpdate` is called with a fields object
// ({question_text, question_type, options, booking_option}) instead of a
// bare string — callers not opting in still receive an equivalent object
// (just {question_text}), so existing onUpdate handlers that already do
// `updateXQuestion(id, fields)` need no changes.
export function QuestionListEditor({ title, description, questions, onAdd, onUpdate, onDelete, onMove, busy, choicesEnabled }) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editType, setEditType] = useState("text");
  const [editOptions, setEditOptions] = useState([]);
  const [editBookingOption, setEditBookingOption] = useState(null);
  const [newOptionText, setNewOptionText] = useState("");

  const handleAdd = async () => {
    if (!newText.trim()) return;
    try {
      await onAdd(newText.trim());
      setNewText("");
    } catch (err) {
      toastError("Failed to add question", err);
    }
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditText(q.question_text);
    setEditType(q.question_type || "text");
    setEditOptions(q.options || []);
    setEditBookingOption(q.booking_option || null);
    setNewOptionText("");
  };

  const handleAddOption = () => {
    const text = newOptionText.trim();
    if (!text || editOptions.includes(text)) return;
    setEditOptions((o) => [...o, text]);
    setNewOptionText("");
  };

  const handleRemoveOption = (opt) => {
    setEditOptions((o) => o.filter((x) => x !== opt));
    setEditBookingOption((b) => (b === opt ? null : b));
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    const isChoice = choicesEnabled && editType === "single_choice";
    try {
      await onUpdate(editingId, {
        question_text: editText.trim(),
        question_type: isChoice ? "single_choice" : "text",
        options: isChoice ? editOptions : null,
        booking_option: isChoice ? editBookingOption : null,
      });
      setEditingId(null);
    } catch (err) {
      toastError("Failed to save question", err);
    }
  };

  const handleDelete = async (id, text) => {
    const proceed = await confirmRemoveQuestion(text);
    if (!proceed) return;
    try {
      await onDelete(id);
    } catch (err) {
      toastError("Failed to remove question", err);
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    try {
      await onMove(questions[index], questions[targetIndex]);
    } catch (err) {
      toastError("Failed to reorder", err);
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
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  className="mb-2 rounded border border-stone-300 px-2.5 py-2 text-sm"
                  style={{ fontFamily: fonts.sans }}
                />

                {choicesEnabled ? (
                  <View className="mb-2">
                    <Pressable
                      onPress={() => setEditType(editType === "single_choice" ? "text" : "single_choice")}
                      className="mb-2 flex-row items-center gap-2"
                      hitSlop={4}
                    >
                      <Ionicons
                        name={editType === "single_choice" ? "checkbox" : "square-outline"}
                        size={16}
                        color={editType === "single_choice" ? colors.primaryOnWhite : "#a8a29e"}
                      />
                      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>
                        Multiple choice (radio buttons)
                      </Text>
                    </Pressable>

                    {editType === "single_choice" ? (
                      <View className="rounded-lg bg-stone-50 p-2.5">
                        {editOptions.length === 0 ? (
                          <Text className="mb-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                            No options yet — add at least one below.
                          </Text>
                        ) : (
                          editOptions.map((opt) => (
                            <View key={opt} className="mb-1.5 flex-row items-center gap-2">
                              <Pressable
                                onPress={() => setEditBookingOption((b) => (b === opt ? null : opt))}
                                className="flex-1 flex-row items-center gap-2"
                                hitSlop={4}
                              >
                                <Ionicons
                                  name={editBookingOption === opt ? "radio-button-on" : "radio-button-off"}
                                  size={15}
                                  color={editBookingOption === opt ? "#4d6142" : "#a8a29e"}
                                />
                                <Text className="flex-1 text-xs" style={{ fontFamily: fonts.sans }}>
                                  {opt}
                                </Text>
                              </Pressable>
                              <Pressable onPress={() => handleRemoveOption(opt)} hitSlop={6}>
                                <Ionicons name="close" size={14} color="#a8a29e" />
                              </Pressable>
                            </View>
                          ))
                        )}
                        <View className="mt-1 flex-row gap-2">
                          <TextInput
                            value={newOptionText}
                            onChangeText={setNewOptionText}
                            placeholder="Add option…"
                            onSubmitEditing={handleAddOption}
                            className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
                            style={{ fontFamily: fonts.sans }}
                          />
                          <Pressable onPress={handleAddOption} className="rounded border border-stone-300 px-2.5 py-1.5">
                            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium }}>
                              Add
                            </Text>
                          </Pressable>
                        </View>
                        <Text className="mt-1.5 text-[10px] text-stone-400" style={{ fontFamily: fonts.sans }}>
                          Tap an option's circle to make it open the Zoom scheduler when a client picks it.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

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
                  {q.question_type === "single_choice" ? (
                    <Text className="mt-0.5 text-[10px] text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Choices: {(q.options || []).join(" / ")}
                      {q.booking_option ? ` · "${q.booking_option}" opens Zoom scheduler` : ""}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable onPress={() => startEdit(q)} hitSlop={8}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(q.id, q.question_text)} hitSlop={8}>
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
