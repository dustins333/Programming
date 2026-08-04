import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts } from "../../lib/theme";

// Shared active↔completed toggle for milestones — one checkbox, same
// element either direction: unchecked/gray reads "not done yet", tapping it
// flips color + label immediately (no confirm popup, since completing or
// reopening a milestone is freely reversible). Used by both the per-slot
// edit modal (active only) and the History popup (both directions).
export function MilestoneCompleteCheckbox({ completed, onToggle, busy }) {
  return (
    <Pressable onPress={onToggle} disabled={busy} className="flex-row items-center gap-2" hitSlop={8}>
      <View
        className="items-center justify-center rounded border"
        style={{ width: 18, height: 18, borderColor: completed ? "#4d6142" : "#d6d3d1", backgroundColor: completed ? "#4d6142" : "transparent" }}
      >
        {completed ? <Ionicons name="checkmark" size={13} color="white" /> : null}
      </View>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: completed ? "#4d6142" : "#78716c" }}>
        {busy ? "…" : completed ? "Completed" : "Mark complete"}
      </Text>
    </Pressable>
  );
}
