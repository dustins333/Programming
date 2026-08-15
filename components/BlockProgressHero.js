import { View, Text } from "react-native";
import { fonts } from "../lib/theme";

// design_handoff_member_block_v1 (13a) — the dark band that carries the block
// as a whole: which block, which week of how many, and how much of the
// commitment is behind her.
//
// "9 of 18 sessions done" counts against the membership (weeks × her own
// sessions_per_week), not against what the coach has published so far —
// otherwise the total would shrink and grow as sessions get written, which is
// exactly the moving target the handoff's counting rule exists to avoid.
const HERO_DARK = "#33251f";
const HERO_CREAM = "#f7f3ee";
const HERO_OLIVE = "#8fa87c";

// `footer` overrides the default line — the coach preview counts published
// sessions rather than completed ones, since a shared block has no single
// person's completion to report.
export function BlockProgressHero({ title, done, total, footer }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <View
      style={{
        backgroundColor: HERO_DARK,
        borderRadius: 22,
        paddingHorizontal: 19,
        paddingVertical: 17,
        marginBottom: 22,
        overflow: "hidden",
        shadowColor: HERO_DARK,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 26,
        elevation: 6,
      }}
    >
      {/* Decorative circle bleeding off the top-right, same as My Week's hero. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -46, top: -52, width: 158, height: 158, borderRadius: 79, backgroundColor: "rgba(190,172,149,0.12)" }}
      />
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 27, color: HERO_CREAM, marginBottom: 11 }}
      >
        {title}
      </Text>
      <View style={{ height: 6, borderRadius: 99, backgroundColor: "rgba(247,243,238,0.15)", overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: HERO_OLIVE }} />
      </View>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(247,243,238,0.6)", marginTop: 9 }}>
        {footer ?? `${done} of ${total} sessions done`}
      </Text>
    </View>
  );
}
