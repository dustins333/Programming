import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts } from "../lib/theme";

// Standing reassurance at the top of any long free-text form backed by
// lib/formDraft.js. Shown unconditionally rather than only after the first
// save, because the point is to tell someone it's safe to close the form
// BEFORE they risk it — the failure this replaced was a member typing a
// full check-in, closing the app, and finding it gone with no trace.
export function DraftNotice({ restored }) {
  return (
    <View
      className="mb-4 flex-row items-start gap-2 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: "#f3f6ef", borderColor: "#4d6142", borderWidth: 1 }}
    >
      <Ionicons name={restored ? "refresh-circle" : "save-outline"} size={16} color="#4d6142" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-xs" style={{ fontFamily: fonts.sans, color: "#44403c" }}>
        {restored
          ? "Picked up where you left off — your saved answers are below."
          : "Saved as you type. You can close this and come back before submitting."}
      </Text>
    </View>
  );
}
