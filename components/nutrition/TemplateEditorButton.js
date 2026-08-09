import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { QuestionListEditor } from "./QuestionListEditor";
import { KeyboardDoneButton } from "../KeyboardDoneButton";
import { fonts, colors } from "../../lib/theme";

// A question template (weekly check-in / onboarding questionnaire) collapsed
// behind a button — clicking it pops the editor open in a modal instead of
// the list sitting permanently expanded on the page.
export function TemplateEditorButton({ label, description, questions, onAdd, onUpdate, onDelete, onMove, choicesEnabled }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="flex-row items-center justify-between rounded-xl border border-stone-200 px-4 py-3.5">
        <View>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{label}</Text>
          <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>Manage →</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-4">
          <View className="w-full max-w-md rounded-2xl bg-white" style={{ maxHeight: "85%" }}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <QuestionListEditor
                title={label}
                description={description}
                questions={questions}
                onAdd={onAdd}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onMove={onMove}
                choicesEnabled={choicesEnabled}
              />
            </ScrollView>
            <View className="flex-row justify-end border-t border-stone-100 p-4">
              <Pressable onPress={() => setOpen(false)} className="rounded-lg bg-primary px-4 py-3">
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <KeyboardDoneButton />
      </Modal>
    </>
  );
}
