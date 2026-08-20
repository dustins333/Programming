import { View, Text } from "react-native";
import { colors, fonts } from "../../lib/theme";

// Lifetime leads, streak second — deliberately. 18 people currently sit on a
// streak of exactly 1 including members with 18-21 lifetime months, and a
// card showing only the streak makes the gym's most consistent people look
// like beginners.
export default function RosterRow({ row, compact }) {
  return (
    <View
      className="flex-row items-center gap-3 border-b py-2.5"
      style={{ borderColor: "#f1efed" }}
    >
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: "#44403c" }}>
          {row.name}
        </Text>
        {row.thisMonth ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted }}>
            {/* Denominator is what this member is COMMITTED to (their
                package), not the bar they were judged against. For staff the
                two differ — the 2x floor is a leniency, not their
                commitment — and showing the floor made a 3x member on 12
                sessions read as "12 of 8". */}
            {row.thisMonth.attendance} of {(row.thisMonth.packageTarget || row.thisMonth.target) * 4}
            {row.thisMonth.qualified
              ? ` | ${row.thisMonth.tier}x group`
              : row.thisMonth.target >= 2
                ? " | missed"
                : " | not eligible"}
          </Text>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.hint }}>not in this month</Text>
        )}
      </View>
      <View style={{ width: 62, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>{row.lifetime}</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: colors.muted }}>months</Text>
      </View>
      <View style={{ width: 58, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: row.current > 0 ? "#4d6142" : colors.hint }}>
          {row.current}
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: colors.muted }}>streak</Text>
      </View>
      {/* Best is the one to drop on a phone: lifetime leads and the current
          streak is the live number, so `best` is the least urgent column. */}
      {!compact ? (
        <View style={{ width: 50, alignItems: "flex-end" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>{row.best}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: colors.muted }}>best</Text>
        </View>
      ) : null}
    </View>
  );
}
