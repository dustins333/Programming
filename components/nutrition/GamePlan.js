import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { updateGamePlan } from "../../lib/nutrition/coachClient";
import { fonts, colors } from "../../lib/theme";

export function GamePlan({ userId, initialGamePlan }) {
  const [text, setText] = useState(initialGamePlan ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateGamePlan(userId, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      Alert.alert("Failed to save game plan", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Freeform game plan, visible to the client…"
        className="mb-2 min-h-[100px] rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans, textAlignVertical: "top" }}
      />
      <View className="flex-row items-center gap-2">
        <Pressable onPress={handleSave} disabled={busy} className="self-start rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
          <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {busy ? "Saving…" : "Save game plan"}
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
