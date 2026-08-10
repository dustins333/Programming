import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// The "nothing logged here yet, tap to add" affordance on the member's
// daily-log fields — the same circled "+" the workout builder uses to join
// a superset (components/SupersetConnector.js), reused so one glyph means
// "add" across the app. It replaces the "–" placeholder those fields used
// to show, which read as a value rather than an invitation.
//
// Rendered as an overlay on top of the real TextInput with pointerEvents
// "none", never in place of it: the tap has to land on the input itself so
// the keyboard opens on the very first press. Callers hide it while the
// field is focused (an empty field with the keyboard already up doesn't
// need to be told it's empty).
const CLAY = "#a46a57";

export function AddValueBadge({ size = 26, style }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: CLAY,
        backgroundColor: "#ffffff",
        ...style,
      }}
    >
      <Ionicons name="add" size={Math.round(size * 0.58)} color={CLAY} />
    </View>
  );
}
