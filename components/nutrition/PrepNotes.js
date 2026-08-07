import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { toastError } from "../../lib/toast";
import { updatePrepNotes } from "../../lib/nutrition/onboarding";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

export function PrepNotes({ userId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updatePrepNotes(userId, notes);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      toastError("Failed to save notes", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        multiline
        inputAccessoryViewID={NUMERIC_DONE_ID}
        placeholder="Tracking mistakes noticed, foods to flag, talking points for the first check-in call…"
        className="mb-2 min-h-[90px] rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans, textAlignVertical: "top" }}
      />
      <View className="flex-row items-center gap-2">
        <Pressable onPress={handleSave} disabled={busy} className="self-start rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
          <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {busy ? "Saving…" : "Save notes"}
          </Text>
        </Pressable>
        {saved ? (
          <Text className="text-sm" style={{ fontFamily: fonts.sans, color: "#4d6142" }}>
            Saved
          </Text>
        ) : null}
      </View>
    </View>
  );
}
