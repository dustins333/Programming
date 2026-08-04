import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from "react-native-svg";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts } from "../../lib/theme";

// design_handoff_v2_settings_nutrition, Screen 3b — a distinct branded
// "shareable board" for social media, separate from the plain utility
// PhotoCompare widget used everywhere else. The mock's header uses a CSS
// `linear-gradient(160deg, ...)` background; there's no gradient library in
// this app (expo-linear-gradient isn't installed, and adding a new native
// dependency here isn't worth the risk — see CLAUDE.md's "pod install"
// gotcha for what that costs on the next physical-device build). Instead
// this reuses react-native-svg, already a proven cross-platform dependency
// (TrendChart), to paint a real gradient behind the header — no new
// dependency, works identically on web and native.
const GRADIENT_STOPS = [
  { offset: "0%", color: "#fbeee4" },
  { offset: "55%", color: "#f6ded0" },
  { offset: "100%", color: "#f0cdb8" },
];

function weeksBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const days = (new Date(`${endDate}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000;
  return Math.max(0, Math.round(days / 7));
}

function longDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function dateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const endYear = new Date(`${endDate}T12:00:00`).getFullYear();
  return startDate === endDate ? `${longDate(startDate)}, ${endYear}` : `${longDate(startDate)} → ${longDate(endDate)}, ${endYear}`;
}

function Pane({ slot, url }) {
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          aspectRatio: 3 / 4,
          borderRadius: 12,
          backgroundColor: "#f1efed",
          overflow: "hidden",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        {slot && url ? (
          <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#c9c4bd" }}>No photo</Text>
          </View>
        )}
      </View>
      <Text className="mt-2 text-center" numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#8a3a24" }}>
        {slot ? formatDateMDY(slot.date) : "—"}
      </Text>
      <Text className="text-center" style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#a8574a" }}>
        {slot?.weight != null ? `${slot.weight} lb` : ""}
      </Text>
    </View>
  );
}

function Stat({ value, label, color }) {
  return (
    <View className="items-center px-6">
      <Text style={{ fontFamily: fonts.display, fontSize: 26, color }}>{value}</Text>
      <Text className="mt-1 text-center" style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.6, color: "#a8a29e", textTransform: "uppercase" }}>
        {label}
      </Text>
    </View>
  );
}

// `slots`: up to 3 entries of {date, weight} | null, oldest-first — the
// caller (photo-compare.js) owns date selection; this component just
// renders whatever 3 dates it's handed, with their signed photo URLs.
// Adherence is deliberately never shown here (per the README: a coach might
// not want a bad adherence number ending up on a client's social post) —
// only the two positive/neutral stats below.
export function PhotoCompareBoard({ clientName, slots, urls }) {
  const dated = slots.filter(Boolean);
  const withWeight = dated.filter((s) => s.weight != null);
  const first = withWeight[0];
  const last = withWeight[withWeight.length - 1];
  const totalChange = first && last && first !== last ? Math.round((last.weight - first.weight) * 10) / 10 : null;
  const isLoss = totalChange !== null && totalChange < 0;
  const weeks = dated.length > 0 ? weeksBetween(dated[0].date, dated[dated.length - 1].date) : null;

  return (
    <View style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "#e8d3c2", shadowColor: "#44403c", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 18 }}>
      <View style={{ padding: 24 }}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <SvgLinearGradient id="boardHeaderGradient" x1="0" y1="0" x2="1" y2="0.4">
              {GRADIENT_STOPS.map((s) => (
                <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#boardHeaderGradient)" />
        </Svg>

        <View className="mb-5 flex-row items-start justify-between">
          <View className="flex-row items-center gap-2.5">
            <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, borderWidth: 2, borderColor: "white", backgroundColor: "#fff" }}>
              <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 30, height: 30, borderRadius: 15 }} />
            </View>
            <View>
              <Text style={{ fontFamily: fonts.display, fontSize: 15, color: "#8a3a24", letterSpacing: 0.3 }}>KOVA STRENGTH</Text>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 1, color: "#a8574a", textTransform: "uppercase" }}>
                Real results, real women
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#8a3a24" }}>{clientName}</Text>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#a8574a" }}>{dateRangeLabel(dated[0]?.date, dated[dated.length - 1]?.date)}</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          {slots.map((slot, i) => (
            <Pane key={i} slot={slot} url={slot ? urls[slot.date] : null} />
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: "white", borderTopWidth: 3, borderTopColor: "#a46a57", paddingVertical: 18 }}>
        <View className="flex-row items-center justify-center">
          <Stat value={totalChange !== null ? `${totalChange} lb` : "—"} label="Total change" color={totalChange !== null ? (isLoss ? "#4d6142" : "#a46a57") : "#a8a29e"} />
          <View style={{ width: 1, height: 34, backgroundColor: "#ece7e1" }} />
          <Stat value={weeks !== null ? weeks : "—"} label="Weeks" color="#a46a57" />
        </View>
      </View>
    </View>
  );
}
