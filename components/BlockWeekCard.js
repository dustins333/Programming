import { View, Text } from "react-native";
import { PressFade } from "./PressFade";
import { fonts, colors, type } from "../lib/theme";

// design_handoff_member_block_v1 (13a) — one container per week of the
// block, tinted by how that week went, holding one tile per session.
//
// The two rules this encodes, both from the handoff:
//
//  1. A week is counted against the member's own weekly commitment
//     (client_program_assignments.sessions_per_week), never against how many
//     sessions the coach happened to publish. A 3× member who trained twice
//     is "1 missed"; a 2× member who trained twice is "Complete" even with an
//     untouched third session sitting on screen. The shortfall is the number
//     shown — never a ratio.
//
//  2. Nothing unpublished is drawn. A week with no published sessions isn't
//     rendered at all (the caller drops it), and a week that's published only
//     two of three keeps its tiles at full width by padding the row with an
//     empty spacer rather than letting two tiles stretch.
//
// Tiles say "Session N", never the coach's title: a title is optional, and a
// grid that alternates between named and unnamed tiles reads as broken. The
// title lives on the session itself, in the sheet.

// bg / border / label / status, per week status.
//
// "This week" is deliberately NOT another tint: the mock gave it a peach fill
// (#fdf6f2) that sat a shade away from the pale red of a short week, so the
// two read as the same state at a glance. It's a white card with a solid 2px
// clay border instead — "you are here" as an outline rather than a wash, which
// is the same selected-state language the rest of the app already uses, and
// unmistakable against both the olive and the red.
const WEEK_TONES = {
  complete: { bg: "#f2f5ed", border: "#dde5d3", borderWidth: 1, label: "#4d6142", status: "#6f8161", tile: "#dde5d3" },
  short: { bg: "#fcf1ee", border: "#f2d9d2", borderWidth: 1, label: "#a5432c", status: "#b9705c", tile: "#f2d9d2" },
  current: { bg: "#ffffff", border: "#a46a57", borderWidth: 3, label: "#8a5140", status: "#8a5140", tile: "#ebdcd3" },
  upcoming: { bg: "#f6f4f1", border: "#e9e5e0", borderWidth: 1, label: colors.muted, status: colors.muted, tile: "#e9e5e0" },
  // Coach preview: no adherence to report (a group block is shared, so
  // there's no one person's completion to colour it by), so every week reads
  // plain and only "this week" is marked.
  neutral: { bg: "#fdfbf8", border: "#ece7e1", borderWidth: 1, label: colors.muted, status: colors.muted, tile: "#ece7e1" },
};

const MISSED_BORDER = "#e3b8ac";
const MISSED_TEXT = "#b9705c";
const CLAY = "#a46a57";
const INK = "#44403c";
const MUTED = colors.muted;

// "Complete" / "1 missed" / "This week" / "Coming up". The shortfall is
// spelled out rather than shown as "2 of 3" — a ratio invites a 2× member to
// read her own complete week as incomplete.
export function weekStatusLabel(status, missed) {
  if (status === "complete") return "Complete";
  if (status === "short") return `${missed} missed`;
  if (status === "current") return "This week";
  if (status === "neutral") return "";
  return "Coming up";
}

function SessionTile({ label, tone, state, onPress }) {
  const missed = state === "missed";
  const today = state === "today";
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={`${label}${missed ? ", not logged" : today ? ", today" : ""}`}
      style={{
        flex: 1,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 8,
        alignItems: "center",
        backgroundColor: missed ? "transparent" : today ? CLAY : "#fff",
        borderWidth: missed ? 1.5 : 1,
        borderStyle: missed ? "dashed" : "solid",
        borderColor: missed ? MISSED_BORDER : today ? CLAY : tone.tile,
        ...(today
          ? { shadowColor: CLAY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 3 }
          : null),
      }}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: 12,
          color: missed ? MISSED_TEXT : today ? "#fff" : state === "upcoming" ? MUTED : INK,
        }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

// sessions: [{ key, label, state: "done" | "missed" | "today" | "upcoming", onPress }]
// slots: how many tiles a full week of this program holds — the row is padded
// out to it so an unpublished session leaves a gap rather than widening its
// siblings.
export function BlockWeekCard({ weekNumber, status, missed, sessions, slots }) {
  const tone = WEEK_TONES[status] ?? WEEK_TONES.upcoming;
  const spacers = Math.max(0, (slots ?? sessions.length) - sessions.length);
  return (
    <View
      style={{
        backgroundColor: tone.bg,
        borderWidth: tone.borderWidth,
        borderColor: tone.border,
        borderRadius: 18,
        paddingHorizontal: 11,
        paddingTop: 11,
        paddingBottom: 13,
        marginBottom: 11,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 3, marginBottom: 8 }}>
        {/* The current week's label steps up a size with the thicker border —
            small, but it's what stops the card reading as one more tint. */}
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: status === "current" ? 12 : type.eyebrow, letterSpacing: 1.2, color: tone.label }}
        >
          WEEK {weekNumber}
        </Text>
        {/* The current week states itself as a filled chip rather than a
            second grey word — with no tint behind the card, the status is
            what has to carry "you are here". */}
        {status === "current" ? (
          <View style={{ backgroundColor: CLAY, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.5, color: "#fff" }}>
              THIS WEEK
            </Text>
          </View>
        ) : (
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: tone.status }}>
            {weekStatusLabel(status, missed)}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {sessions.map((s) => (
          <SessionTile key={s.key} label={s.label} tone={tone} state={s.state} onPress={s.onPress} />
        ))}
        {Array.from({ length: spacers }, (_, i) => (
          <View key={`spacer-${i}`} style={{ flex: 1 }} />
        ))}
      </View>
    </View>
  );
}
