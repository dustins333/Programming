import { View, Text } from "react-native";
import { htmlToPlainText } from "../lib/richText";
import { fonts, colors, statusColors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";

// Native fallback. Read-only ON PURPOSE rather than a plain-text box:
// editing a formatted document through a plain TextInput would silently
// flatten its bullets and underlining the moment it saved, which is exactly
// the bug this whole feature exists to fix. Documents are authored on the
// web build (which is what every real user is on anyway), so this is a
// dead-end nobody should reach rather than a capability worth degrading.
export function RichTextEditor({ initialValue, initialFormat }) {
  const preview = initialFormat === "html" ? htmlToPlainText(initialValue ?? "") : String(initialValue ?? "");
  return (
    <View>
      <View style={{ backgroundColor: statusColors.needsAction.bg, borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: statusColors.needsAction.text, fontSize: 13 }}>
          Open this on a computer to edit the wording.
        </Text>
      </View>
      <View style={{ borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, padding: 14, backgroundColor: "white" }}>
        <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {preview || "Nothing written yet."}
        </Text>
      </View>
    </View>
  );
}
