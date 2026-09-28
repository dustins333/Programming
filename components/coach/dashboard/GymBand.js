import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
//
// The arrows in the header step back through past weeks (useGymWeekBrowse).
// A past week drops "sessions today", which means nothing once the week is
// over, and its labels say "that week" instead of "this week".

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

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Week of Sep 1": the Monday the band's figures are counted from.
function weekOfLabel(weekStart) {
  const [, month, day] = weekStart.split("-").map(Number);
  return `Week of ${MONTH_SHORT[month - 1]} ${day}`;
}

function Arrow({ icon, label, disabled, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={label}
      style={{
        width: 26,
        height: 26,
        borderRadius: 99,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(247,243,238,.08)",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons name={icon} size={15} color="#f7f3ee" />
    </PressFade>
  );
}

export function GymBand({ browse, wide, onOpen }) {
  const { gym, weekStart, past, canOlder, older, newer } = browse;
  const tiles = TILES.filter((t) => !(past && t.key === "sessionsToday")).map((t) => (
    <Figure
      key={t.key}
      value={gym?.[t.field]}
      label={past ? t.label.replace("this week", "that week") : t.label}
      alert={t.alert}
      wide={wide}
      onPress={() => onOpen(t.key)}
    />
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
          and read as a hard-edged block rather than a glow.
          It sits in its own clipped layer: hanging off the band's edge made the band
          itself scrollable on web, so focusing a week arrow slid the whole
          band 50px sideways. This layer is exactly the band's size, holds
          nothing focusable, and so never scrolls. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" }}>
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
      </View>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Arrow icon="chevron-back" label="Previous week" disabled={!canOlder} onPress={older} />
          <Text
            maxFontSizeMultiplier={1.15}
            style={{ fontFamily: fonts.sans, fontSize: wide ? 11.5 : 11, color: "rgba(247,243,238,.62)", minWidth: wide ? 86 : 78, textAlign: "center" }}
          >
            {past ? weekOfLabel(weekStart) : "This week"}
          </Text>
          <Arrow icon="chevron-forward" label="Next week" disabled={!past} onPress={newer} />
        </View>
      </View>

      {wide || past ? (
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
