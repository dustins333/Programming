import { View, Text } from "react-native";
import { colors, fonts } from "../../lib/theme";

// A stat tile. `share` is an optional percentage line — always a share of the
// month's TOTAL members, never of the committed group, so the 3x and 2x
// tiles add up to the committed tile rather than to 100%.
export default function StatTile({ label, value, tone = "plain", hint, share }) {
  const bg = tone === "good" ? "#eef1e7" : tone === "brand" ? "#fdf6f2" : "#fff";
  const border = tone === "good" ? "#cfdcc2" : tone === "brand" ? "#f0ddd2" : "#ece7e1";
  return (
    <View
      className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: bg, borderColor: border, flexGrow: 1, flexBasis: 130, minWidth: 130 }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, color: colors.muted }}>
        {label.toUpperCase()}
      </Text>
      <View className="flex-row items-baseline gap-2">
        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: "#44403c", marginTop: 2 }}>{value}</Text>
        {share ? (
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: tone === "good" ? "#4d6142" : colors.muted }}>
            {share}
          </Text>
        ) : null}
      </View>
      {hint ? <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted }}>{hint}</Text> : null}
    </View>
  );
}
