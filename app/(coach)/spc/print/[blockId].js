import { View, Text } from "react-native";
import { fonts } from "../../../../lib/theme";

// Print/export is web-only (spec's SPC print template is meant for a real
// printer via the browser) — coaches do this from the web build, same
// precedent as the drag-and-drop builder.
export default function SpcBlockPrintNative() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-8">
      <Text className="text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
        Open this block on the web app to export/print.
      </Text>
    </View>
  );
}
