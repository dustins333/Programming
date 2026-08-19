import { View, Text } from "react-native";
import { fonts, colors, type } from "../../lib/theme";

// Shared anatomy for the session sheet (design_handoff_member_block_v1,
// screens 13b-13e and 14a-14d). Kept in one file so the sheet and the
// full-screen block variants can't drift into two different-looking
// descriptions of the same session.
//
// Row anatomy, per the handoff: position chip, lift name, prescription.
// Nothing else — no history, no last-time weights. Those belong in the logger
// where she's actually comparing against them.

export const SHEET_CANVAS = "#faf8f6";
export const CARD_BORDER = "#ece7e1";
export const ROW_DIVIDER = "#f4efe9";
export const INK = "#44403c";
export const INK_DEEP = "#2a211c";
export const MUTED = colors.muted;
export const FAINT = "#c9c4bd";
export const CLAY = "#a46a57";
export const BRAND_TEXT = "#8a5140";
export const OLIVE = "#4d6142";
export const DASHED_EMPTY = "#ddd6cd";

export const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.045,
  shadowRadius: 14,
  elevation: 2,
};

// The four states a session can be in, and the pill that names each one.
export const SESSION_STATES = {
  today: { bg: "#fdf6f2", border: "#f0dbd0", text: BRAND_TEXT },
  backlog: { bg: "#fcf1ee", border: "#f2d9d2", text: "#b9705c" },
  logged: { bg: "#f2f5ed", border: "#dde5d3", text: OLIVE },
  future: { bg: "#f6f4f1", border: "#e9e5e0", text: colors.muted },
};

export function StatePill({ state, label }) {
  const tone = SESSION_STATES[state] ?? SESSION_STATES.future;
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.6, color: tone.text }}>
        {label}
      </Text>
    </View>
  );
}

export function SheetEyebrow({ children, color = MUTED, style }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.1}
      style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1, textTransform: "uppercase", color, ...style }}
    >
      {children}
    </Text>
  );
}

// The numbered square at the head of every exercise row — "1", or "3a"/"3b"
// for the two halves of a superset.
export function PositionChip({ label }) {
  return (
    <View style={{ width: 23, height: 23, borderRadius: 8, backgroundColor: "#f5f1ec", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color: colors.muted }}>
        {label}
      </Text>
    </View>
  );
}

// A run of exercises sharing one card. A superset gets its own card with a
// header describing how it runs; consecutive singles are merged into one card
// so the sheet reads as a handful of blocks rather than a row per lift.
export function ExerciseGroupCard({ superset, rounds, children }) {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: superset ? "#f0e0d8" : CARD_BORDER,
        borderRadius: 18,
        overflow: "hidden",
        marginBottom: 10,
        ...CARD_SHADOW,
      }}
    >
      {superset ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#fdf6f2", paddingHorizontal: 15, paddingTop: 9, paddingBottom: 7 }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.9, color: BRAND_TEXT }}>
            SUPERSET
          </Text>
          {rounds ? (
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
              {rounds} rounds
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// One lift, read-only: chip, name, prescription. Used by the today and future
// states, where there's nothing logged to show.
export function ExerciseRow({ position, name, detail, last }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 15,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: ROW_DIVIDER,
      }}
    >
      <PositionChip label={position} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: INK }}>
          {name}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: MUTED, marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// One lift as it was actually performed. The lift and its prescription take
// their own line with the set values in a full-width row beneath, indented to
// the name column — structural, not decorative: a four- or five-set lift
// crushes the lift name if the sets have to share the line with it.
//
// sets: [{ reps, weight }] — a null/blank entry renders as the missed box.
export function LoggedExerciseRow({ position, name, detail, sets, last }) {
  return (
    <View style={{ paddingHorizontal: 15, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: ROW_DIVIDER }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: sets.length > 0 ? 9 : 0 }}>
        <PositionChip label={position} />
        <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 14, color: INK }}>
          {name}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: MUTED, flexShrink: 0 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {sets.length > 0 ? (
        // flex: 1 per set, so three or five fit the same width.
        <View style={{ flexDirection: "row", gap: 6, paddingLeft: 35 }}>
          {sets.map((set, i) => {
            const missed = set == null || (set.reps == null && set.weight == null);
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 9,
                  paddingVertical: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: missed ? "#fcf1ee" : "#f6f4f1",
                  borderWidth: missed ? 1.5 : 0,
                  borderStyle: missed ? "dashed" : "solid",
                  borderColor: "#e3b8ac",
                }}
              >
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: missed ? "#b9705c" : INK_DEEP }}>
                  {missed ? "–" : (set.reps ?? "–")}
                </Text>
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: missed ? type.caption : 12.5, color: missed ? "#b9705c" : INK_DEEP }}>
                  {missed ? "missed" : set.weight != null ? `${set.weight} lb` : "–"}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        // Nothing logged for this lift at all — one pill rather than a row of
        // identical empty boxes.
        <View style={{ alignSelf: "flex-end", marginTop: -22, backgroundColor: "#fcf1ee", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: "#b9705c" }}>
            Missed
          </Text>
        </View>
      )}
    </View>
  );
}
