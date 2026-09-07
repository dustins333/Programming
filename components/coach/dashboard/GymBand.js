import { View, Text } from "react-native";
import { PressFade } from "../../PressFade";
import { Eyebrow } from "./DashboardParts";
import { fonts, colors } from "../../../lib/theme";

// "In the gym" — the one block on the coach dashboard the redesign was told
// to leave alone. It ships on the phone exactly as it did before; `wide` adds
// the desktop variant, which is the same four figures in one row.
//
// That matching set is the headline fix of design_handoff_coach_dashboard:
// the desktop used to show sessions / nutrition / PRs / unread, a different
// question entirely, so the two screens disagreed about how the gym was doing.
//
// A figure that failed to load renders as an en dash, never 0 — getGymWeek
// returns null for exactly this reason. Every tile opens the list behind it,
// so each one gets a faint fill to say it's a button; four bare numbers in a
// dark band read as a readout nobody discovers is tappable.

const TILES = [
  { key: "sessionsToday", field: "sessions", label: "sessions today" },
  { key: "sessionsWeek", field: "sessionsWeek", label: "sessions this week" },
  { key: "membersWeek", field: "membersWeek", label: "girls in this week" },
  // The only one that lights up. The other three are a picture of the week;
  // this is the one a coach picks up the phone about.
  { key: "membersNotSeen", field: "membersNotSeen", label: "girls not in this week", alert: true },
];

function Figure({ value, label, alert, wide, onPress }) {
  const missing = value === null || value === undefined;
  const lit = alert && !missing && value > 0;
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={`${label}: open the list`}
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: wide ? "flex-start" : "center",
        justifyContent: "center",
        paddingVertical: wide ? 16 : 11,
        paddingHorizontal: wide ? 18 : 6,
        borderRadius: wide ? 14 : 13,
        backgroundColor: "rgba(247,243,238,.055)",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: wide ? 38 : 26,
          lineHeight: wide ? 40 : 30,
          color: missing ? "rgba(247,243,238,.35)" : lit ? "#e8a288" : "#f7f3ee",
        }}
      >
        {missing ? "–" : value}
      </Text>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.15}
        style={{
          fontFamily: fonts.sans,
          fontSize: wide ? 12 : 10.5,
          color: "rgba(247,243,238,.62)",
          textAlign: wide ? "left" : "center",
          marginTop: wide ? 5 : 3,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

export function GymBand({ gym, wide, note, onOpen }) {
  const tiles = TILES.map((t) => (
    <Figure key={t.key} value={gym?.[t.field]} label={t.label} alert={t.alert} wide={wide} onPress={() => onOpen(t.key)} />
  ));

  return (
    <View
      style={{
        backgroundColor: colors.ink,
        borderRadius: wide ? 20 : 18,
        paddingVertical: wide ? 18 : 14,
        paddingHorizontal: wide ? 20 : 12,
        overflow: "hidden",
      }}
    >
      {/* Corner warmth only. The desktop band has room for a 190px blob; at
          the phone's ~347px width that circle covered the whole third column
          and read as a hard-edged block rather than a glow. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: wide ? -50 : -62,
          top: wide ? -60 : -74,
          width: wide ? 190 : 132,
          height: wide ? 190 : 132,
          borderRadius: 99,
          backgroundColor: wide ? "rgba(190,172,149,.11)" : "rgba(190,172,149,.07)",
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: wide ? 13 : 10,
        }}
      >
        <Eyebrow color={wide ? colors.tertiary : "rgba(247,243,238,.5)"} size={wide ? 10 : 9.5} style={{ letterSpacing: wide ? 1.4 : 1.1 }}>
          IN THE GYM
        </Eyebrow>
        {wide && note ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(247,243,238,.5)" }}>{note}</Text>
        ) : null}
      </View>

      {wide ? (
        <View style={{ flexDirection: "row", gap: 12 }}>{tiles}</View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>{tiles.slice(0, 2)}</View>
          <View style={{ flexDirection: "row", gap: 8 }}>{tiles.slice(2)}</View>
        </View>
      )}
    </View>
  );
}
