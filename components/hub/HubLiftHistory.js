import { ScrollView, Text, View } from "react-native";
import { DockPill } from "./HubDock";
import { SetBubbleRow } from "./HubSetBubbles";
import { fonts, colors } from "../../lib/theme";

// This block's history for one lift, in the dock — the same corner and the
// same footprint the keypad and calculator use, so the sets being entered
// stay on screen above it. That is the entire point: this is the view a
// coach makes a call from mid-set, not a place you navigate to.
//
// Modelled on the paper SPC sheet (app/(coach)/spc/print/[blockId].web.js),
// whose grid runs Main Session | Sets | Reps | Rest | Week 1 | Week 2 | …
// with coach and date under each week column. Weeks read most-recent-first
// because the question is almost always "what did she do last time".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Plain ISO string arithmetic — never `new Date(iso)`, which reads back as
// the previous day for anyone west of UTC (this app's standing rule).
export function monthDay(iso) {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${Number(d)}`;
}

export function HubHistoryStrip({ onBackToKeypad, weekCount }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: colors.muted, marginBottom: 10 }}>
        {weekCount > 0
          ? "Every week of the block, most recent first."
          : "No other week of this block has this lift logged yet."}
      </Text>
      <DockPill label="‹ Back to keypad" tone="filled" onPress={onBackToKeypad} />
    </View>
  );
}

export function HubHistoryPanel({ weeks, tracksWeight = true, height = 194 }) {
  return (
    <ScrollView style={{ height }} showsVerticalScrollIndicator={false}>
      {(weeks ?? []).map((week) => (
        <View
          key={week.workoutId}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#f0ddd2",
            backgroundColor: "#fdf6f2",
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 9,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: colors.primaryOnWhite }}>
              {week.weekNumber != null ? `WEEK ${week.weekNumber}` : "EARLIER"}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginLeft: 8 }}>{monthDay(week.date)}</Text>
          </View>
          <View style={{ marginTop: 2 }}>
            <SetBubbleRow sets={week.sets} tracksWeight={tracksWeight} size="sm" tone="plain" />
          </View>
          {week.note ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: "#57534e", marginTop: 6 }}>
              {week.note}
              {week.noteAuthor ? <Text style={{ color: colors.muted }}> — {week.noteAuthor}</Text> : null}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
