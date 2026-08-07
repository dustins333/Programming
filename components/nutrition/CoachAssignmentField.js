import { View, Text, Pressable, Platform } from "react-native";
import { fonts } from "../../lib/theme";

const isWeb = Platform.OS === "web";

// Same web-<select>/native-pill-row split as SPC's own CoachDropdown
// (app/(coach)/spc/[userId].js) — shared here since nutrition coach
// assignment needed the identical control in two places (the Objective
// Tracking onboarding step, and Client Settings) rather than duplicating
// the markup twice. Not a literal reuse of SPC's version since that one
// isn't exported — same pattern, small enough not to be worth extracting
// a single shared component across both modules.
export function CoachAssignmentField({ value, coaches, onChange, label = "Assigned coach" }) {
  return (
    <View>
      {label ? (
        <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
      ) : null}
      {isWeb ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            height: 40,
            padding: "0 14px",
            borderRadius: 8,
            border: "1px solid #d9d4cd",
            color: "#44403c",
            backgroundColor: "white",
            maxWidth: 220,
          }}
        >
          <option value="">Unassigned</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </select>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => onChange(null)}
            className={`rounded-full border px-3.5 py-2.5 ${!value ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={!value ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              Unassigned
            </Text>
          </Pressable>
          {coaches.map((coach) => (
            <Pressable
              key={coach.id}
              onPress={() => onChange(coach.id)}
              className={`rounded-full border px-3.5 py-2.5 ${value === coach.id ? "border-primary bg-primary" : "border-stone-300"}`}
            >
              <Text className={value === coach.id ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                {coach.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
