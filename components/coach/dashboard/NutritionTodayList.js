import { View, Text } from "react-native";
import { SheetRow, SheetEmpty } from "./DashboardSheet";
import { fonts, colors } from "../../../lib/theme";

// Who put something in today, and what they weighed. The list behind the
// Nutrition section's "Logged today" tile on both dashboards — it was
// phone-only before, which is exactly the kind of drift this redesign is
// closing.
//
// Today's weigh-in only means something against the trend it sits in, so the
// average, today's number and the gap between them read as one group on the
// right edge. They used to sit on opposite sides of the row, with the 7-day
// average buried in the subtitle, which made the comparison a scan across the
// full width of the phone.
//
// Column labels are a single header above the list rather than a pair on
// every row: repeating them cost enough width to truncate real client names
// ("Lauren Bottelbe…"), and a table only needs its headings once. Units are
// dropped for the same reason — every number here is lb.
//
// The average is over the same 7-day window used everywhere else in the app,
// which includes today, so the delta is slightly conservative: today's number
// is one seventh of the figure it's measured against.

// Sized off measured text, not guessed: the widest real client name
// ("Lauren Bottelberghe") needs 156px and these columns are what's left over.
const WEIGH_COL = 44;
const DELTA_COL = 38;
const WEIGH_GAP = 6;

function roundWeight(w) {
  return w === null || w === undefined ? null : Math.round(w * 10) / 10;
}

function Header() {
  const label = {
    fontFamily: fonts.sansBold,
    fontSize: 8.5,
    color: "#a8a29e",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "right",
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: WEIGH_GAP, paddingBottom: 5 }}>
      <View style={{ flex: 1, minWidth: 0 }} />
      <Text maxFontSizeMultiplier={1} style={{ ...label, width: WEIGH_COL }}>
        7d avg
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ ...label, width: WEIGH_COL }}>
        Today
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ ...label, width: DELTA_COL }}>
        +/−
      </Text>
      {/* matches SheetRow's chevron so the columns line up with the rows */}
      <View style={{ width: 15 }} />
    </View>
  );
}

function Trailing({ avgWeight, weightToday }) {
  const avg = roundWeight(avgWeight);
  const today = roundWeight(weightToday);
  const delta = avg !== null && today !== null ? Math.round((today - avg) * 10) / 10 : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: WEIGH_GAP }}>
      <Text maxFontSizeMultiplier={1.1} style={{ width: WEIGH_COL, textAlign: "right", fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
        {avg !== null ? avg.toFixed(1) : "—"}
      </Text>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ width: WEIGH_COL, textAlign: "right", fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.text }}
      >
        {today !== null ? today.toFixed(1) : "—"}
      </Text>
      <Text
        maxFontSizeMultiplier={1.1}
        style={{
          width: DELTA_COL,
          textAlign: "right",
          fontFamily: fonts.sansSemiBold,
          fontSize: 12.5,
          // Down is olive, up is clay — the same pairing the nutrition
          // dashboard's own weight-change line already uses.
          color: delta === null ? "#c9c4bd" : delta < 0 ? "#4d6142" : delta > 0 ? "#8a5a2e" : colors.muted,
        }}
      >
        {delta === null ? "—" : delta === 0 ? "0.0" : `${delta < 0 ? "↓" : "↑"}${Math.abs(delta).toFixed(1)}`}
      </Text>
    </View>
  );
}

export function NutritionTodayList({ nutritionToday, onOpenClient }) {
  if (!nutritionToday) return <SheetEmpty>Couldn't load today's nutrition.</SheetEmpty>;
  if (nutritionToday.rows.length === 0) return <SheetEmpty>No one has logged anything yet today.</SheetEmpty>;
  return (
    <>
      <Header />
      {nutritionToday.rows.map((r) => (
        <SheetRow
          key={r.userId}
          title={r.name}
          // "still logging" only shows on open days — it explains why a
          // number might still move, where "finalized" on all the rest would
          // just be noise.
          detail={r.finalized ? null : "still logging"}
          trailing={<Trailing avgWeight={r.avgWeight} weightToday={r.weightToday} />}
          onPress={() => onOpenClient(r.userId)}
        />
      ))}
    </>
  );
}
