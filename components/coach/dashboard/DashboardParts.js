import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { TONE_INK } from "../../../lib/programming/dashboardModel";
import { fonts, colors } from "../../../lib/theme";

// The shared vocabulary of the coach dashboard (design_handoff_coach_dashboard).
//
// Both views render these; `wide` is the only difference between them. That
// is the point — the redesign exists because the phone and the desktop had
// drifted into saying different things, and two copies of a stat tile is how
// that happens again.
//
// Every module used to lead with its own 10px brand-coloured eyebrow, and
// with five of them nothing was findable. One header treatment now: icon
// chip, title, subline, right link.

export const CARD_BORDER = "#e1dad1";
export const DIVIDER = "#ece7e1";
export const ROW_DIVIDER = "#f4f1ec";
export const NEUTRAL_TILE = { bg: colors.canvas, border: "#ebe5de" };
export const TINT_TILE = { bg: "#fdece5", border: "#f6ddd3" };
export const CHIP_BG = "#f4e7e0";
export const CHEVRON = "#c9c4bd";
export const HINT = "#a8a29e";

// Two layers on purpose in the design: a tight one that seats the card and a
// broad one that lifts it off the canvas. RN can only express one, so this is
// the broad one — the same approximation every other card in this app makes.
export const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14 };

// A figure that failed to load is an en dash, never 0. "0 due now" is a
// number a coach would act on, and a broken query must not be able to say it.
export const showFigure = (v) => (v === null || v === undefined ? "–" : String(v));

export function Eyebrow({ children, color = HINT, size = 10, style }) {
  return (
    <Text maxFontSizeMultiplier={1.1} style={[{ fontFamily: fonts.sansBold, fontSize: size, letterSpacing: 1.2, color }, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------- card shell */

export function ModuleCard({ wide, style, children }) {
  return (
    <View
      style={{
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingVertical: wide ? 16 : 12,
        paddingHorizontal: wide ? 18 : 12,
        ...CARD_SHADOW,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

// `divider` is off for Group: its own rows carry top borders, and two rules
// stacked read as a mistake.
export function ModuleHeader({ icon, title, subline, linkLabel, onLink, wide, divider = true }) {
  const chip = wide ? 30 : 26;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: wide ? 12 : 9,
        paddingBottom: divider ? (wide ? 13 : 10) : 0,
        marginBottom: divider ? (wide ? 14 : 10) : 4,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: DIVIDER,
      }}
    >
      <View
        style={{
          width: chip,
          height: chip,
          borderRadius: wide ? 9 : 8,
          backgroundColor: CHIP_BG,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={wide ? 16 : 14} color={colors.primaryOnWhite} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: wide ? 19 : 17, lineHeight: wide ? 21 : 19, color: colors.text }}>
          {title}
        </Text>
        {subline ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: wide ? 12 : 10.5, color: colors.muted, marginTop: 1 }}>
            {subline}
          </Text>
        ) : null}
      </View>
      {linkLabel ? (
        <PressFade onPress={onLink} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: wide ? 12.5 : 11, color: colors.primaryOnWhite }}>
            {linkLabel}
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- sub-tile */

// Only ONE tile per section is tinted. Everything carried a fill before and
// nothing stood out; a fill now means "this is the one". Tone still colours
// the FIGURE on the neutral tiles, so the reading order survives.
export function SubTile({ tile, wide, onPress }) {
  const skin = tile.tinted ? TINT_TILE : NEUTRAL_TILE;
  const label = wide && tile.wideLabel ? tile.wideLabel : tile.label;
  const missing = tile.figure === null || tile.figure === undefined;
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={`${label}: ${showFigure(tile.figure)}`}
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: skin.bg,
        borderWidth: 1,
        borderColor: skin.border,
        borderRadius: wide ? 13 : 10,
        paddingVertical: wide ? 13 : 8,
        paddingHorizontal: wide ? 14 : 8,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.15}
        style={{
          fontFamily: fonts.display,
          fontSize: wide ? 30 : 21,
          lineHeight: wide ? 32 : 23,
          color: missing ? CHEVRON : (TONE_INK[tile.tone] ?? TONE_INK.plain),
        }}
      >
        {showFigure(tile.figure)}
        {tile.suffix ? (
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: wide ? 13 : 11, color: colors.muted }}>{tile.suffix}</Text>
        ) : null}
      </Text>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansSemiBold, fontSize: wide ? 13 : 10, color: colors.text, marginTop: wide ? 4 : 2 }}
      >
        {label}
      </Text>
      {/* The third line is desktop-only: at phone density it turns a row of
          four tiles into a wall of 10px grey. */}
      {wide && tile.caption ? (
        <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 2 }}>
          {tile.caption}
        </Text>
      ) : null}
    </PressFade>
  );
}

export function SubTileRow({ tiles, wide, onOpen }) {
  return (
    <View style={{ flexDirection: "row", gap: wide ? 11 : 6 }}>
      {tiles.map((tile) => (
        <SubTile key={tile.key} tile={tile} wide={wide} onPress={() => onOpen(tile)} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ group rows */

export function GroupProgramRow({ row, wide, first, last, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: wide ? 12 : 9,
        paddingTop: wide ? 13 : 9,
        paddingBottom: last ? (wide ? 4 : 3) : wide ? 13 : 9,
        borderTopWidth: 1,
        borderTopColor: ROW_DIVIDER,
      }}
    >
      <View style={{ width: wide ? 8 : 7, height: wide ? 8 : 7, borderRadius: 99, backgroundColor: TONE_INK[row.tone] ?? TONE_INK.good }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: wide ? 14 : 12.5, color: colors.text }}>
          {row.name}
        </Text>
        <Text numberOfLines={wide ? 1 : 2} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: wide ? 11.5 : 10.5, color: colors.muted, marginTop: wide ? 2 : 1 }}>
          {row.detail}
        </Text>
      </View>
      {/* Desktop has the width for the roster size; the phone doesn't, and
          it's the least load-bearing thing in the row. */}
      {wide && row.clientCount !== null ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted }}>
          {row.clientCount} {row.clientCount === 1 ? "client" : "clients"}
        </Text>
      ) : null}
      <Text
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: wide ? 12 : 10.5,
          color: TONE_INK[row.tone] ?? TONE_INK.good,
          // Fixed column on desktop so the countdowns line up down the card
          // instead of drifting with the length of each program's name.
          ...(wide ? { width: 56, textAlign: "right" } : null),
        }}
      >
        {row.trailing}
      </Text>
      <Ionicons name="chevron-forward" size={wide ? 15 : 14} color={CHEVRON} />
    </PressFade>
  );
}

/* --------------------------------------------------------------- count row */

// Library review and Documents on the phone. Notifications rather than
// modules — they vanish entirely at zero rather than rendering an empty
// section, which is the one exception to "a section with a 0 still renders".
export function CountRow({ count, title, subtitle, wide, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: wide ? 12 : 10,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingVertical: wide ? 16 : 12,
        paddingHorizontal: wide ? 18 : 12,
        ...CARD_SHADOW,
      }}
    >
      <View
        style={{
          minWidth: wide ? 28 : 26,
          height: wide ? 24 : 22,
          paddingHorizontal: wide ? 8 : 7,
          borderRadius: 999,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: wide ? 12 : 11, color: "white" }}>
          {count}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: wide ? 14 : 13, color: colors.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: wide ? 11.5 : 10.5, color: colors.muted, marginTop: wide ? 2 : 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={wide ? 16 : 15} color={CHEVRON} />
    </PressFade>
  );
}
