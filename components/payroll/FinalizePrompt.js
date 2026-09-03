import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fonts } from "../../lib/theme";
import { formatDateRange } from "../../lib/formatDate";

// The standing "you still owe a payroll submission" banner. See
// lib/payroll/finalizePrompt.js for when it appears; this only renders what
// that decides.
//
// It links to My Pay carrying the period, NOT to the Log tab: finalizing is
// a review action, and the whole design of that screen is that a coach
// reads the full breakdown before signing off. Landing them back on the
// entry grid would leave them hunting for the button.
export function FinalizePrompt({ prompt, style }) {
  const router = useRouter();
  if (!prompt) return null;

  const { periodStart, periodEnd, overdue } = prompt;

  return (
    <Pressable
      onPress={() => router.push(`/(coach)/payroll/report?period=${periodStart}`)}
      style={({ pressed }) => ({
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: overdue ? "#e0b6a5" : "#f0ddd2",
        backgroundColor: "#fdf1ea",
        paddingVertical: 13,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        opacity: pressed ? 0.85 : 1,
        ...style,
      })}
    >
      <Ionicons name="alert-circle" size={21} color="#b23a22" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#b23a22" }} numberOfLines={1}>
          {overdue ? "Payroll not submitted" : "Payroll due today"}
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 2 }} numberOfLines={1}>
          {formatDateRange(periodStart, periodEnd)} | tap to review and finalize
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#b23a22" />
    </Pressable>
  );
}
