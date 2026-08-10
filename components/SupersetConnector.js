import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// The link/unlink control that sits between two adjacent exercise rows in
// the group and SPC web builders. Used to be a bare 10px grey "+" glyph
// that nobody could find; it's a real circular button now, and it doubles
// as the visual join between the two rows of a superset (filled + a
// connecting spine) rather than only being a way to create one.
export function SupersetConnector({ linked, onLink, onUnlink }) {
  return (
    <View className="items-center" style={{ marginVertical: 5 }}>
      {/* Spine behind the button — only drawn for a real superset, so a
          linked pair reads as one block instead of two stacked cards. It
          deliberately overhangs the row (negative top/bottom) so the part
          that isn't covered by the 26px circle actually reaches both cards'
          borders; sized flush to the gap it would be invisible. */}
      {linked ? (
        <View style={{ position: "absolute", top: -6, bottom: -6, width: 3, backgroundColor: "#a46a57" }} />
      ) : null}
      <Pressable
        onPress={linked ? onUnlink : onLink}
        hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
        accessibilityLabel={linked ? "Unlink this superset" : "Link into a superset with the next exercise"}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: "#a46a57",
          backgroundColor: linked ? "#a46a57" : "#ffffff",
        }}
      >
        <Ionicons name={linked ? "link" : "add"} size={15} color={linked ? "#ffffff" : "#a46a57"} />
      </Pressable>
    </View>
  );
}
