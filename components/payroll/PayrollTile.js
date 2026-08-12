// Generic tile shell for the My Entries grid — reused by Group, Programs
// Written, Welcome, Strategy, Admin Hours, Ops Hours, and SPC. Purely
// presentational: border/checkmark/badge chrome, callers pass their own
// center content as children.
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";

const CHECK_COLOR = "#4d6142";
// Peach (unconfirmed) / sage (confirmed) — the same two soft card tones
// already established elsewhere in the app (the peach "selected session"
// banner and statusColors.onTrack, respectively), not new colors.
export const TILE_BG = { idle: "#fdf6f2", solid: "#eef1e7" };
export const TILE_BORDER = { idle: "#f0ddd2", solid: CHECK_COLOR };

// Every grid tile (Group/SPC/Programs Written/Welcome/Strategy/Admin/Ops)
// used to size itself off its own content (minHeight only) — fine in
// isolation, but two tiles side by side in a row with genuinely different
// content heights (e.g. SPC's label+button+caption vs. Group's
// label+counter) rendered at different heights, so their checkmarks (each
// pinned to its OWN tile's bottom edge) landed at different vertical
// positions on screen. A single static height for every grid tile is what
// makes them line up, per direct ask ("just have to make them all a
// static size, rather than dynamic").
export const TILE_HEIGHT = 136;

// Half-overlapping the tile's bottom edge, per the explicit ask — same
// round checkmark already shipped on My Fitness's exercise-completion
// cards (components/ExerciseCard.js), just repositioned. Sits on its own
// small white backdrop circle, slightly larger than the icon itself — the
// tile's own border passes directly through this exact spot, and without
// something opaque drawn on top the border line visibly cut through the
// middle of the checkmark. A plain white badge floating over the border
// reads as an intentional badge regardless of which tile color is behind
// it, rather than trying to precisely color-match two different
// backgrounds (the tile's own fill above the line, the page canvas below
// it) with one flat circle.
//
// onPress is optional and usually absent: on the entry grid this is a pure
// status indicator (hollow = entered, solid = the whole day has been
// submitted via the sticky footer button), not a per-tile save button as it
// originally was. Rendering a non-interactive View in that case matters —
// a Pressable that visibly does nothing when tapped reads as broken.
export function TileCheckmark({ solid, onPress }) {
  const icon = (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#44403c",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      }}
    >
      <Ionicons name={solid ? "checkmark-circle" : "checkmark-circle-outline"} size={34} color={CHECK_COLOR} />
    </View>
  );
  const position = { position: "absolute", bottom: -20, left: 0, right: 0, alignItems: "center", zIndex: 2 };
  if (!onPress) {
    return (
      <View pointerEvents="none" style={position} accessibilityLabel={solid ? "Submitted" : "Entered — not submitted yet"}>
        {icon}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }} style={position}>
      {icon}
    </Pressable>
  );
}

// Small numbered badge, top-right — "how many of this repeatable thing
// (SPC sessions, Other line items) have already been logged for this
// date," tap to see the list.
export function TileBadge({ count, onPress }) {
  if (!count) return null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={`${count} logged — view details`}
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        minWidth: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
        borderWidth: 2,
        borderColor: colors.canvas,
      }}
    >
      <Text style={{ color: "white", fontSize: 12, fontFamily: fonts.sansBold }}>{count}</Text>
    </Pressable>
  );
}

// checkState: "none" (nothing entered, no checkmark at all) | "hollow"
// (entered and saved, but the day hasn't been submitted yet) | "solid" (the
// day has been submitted). Solid also switches the tile's own border to the
// same olive — border-only "completed" convention already used app-wide (My
// Fitness), not a background fill.
export function PayrollTile({ children, checkState = "none", onCheckPress, badgeCount, onBadgePress, style, onPress, height = TILE_HEIGHT }) {
  const solid = checkState === "solid";
  const content = (
    <View
      style={[
        {
          position: "relative",
          borderWidth: solid ? 2 : 1,
          borderColor: solid ? TILE_BORDER.solid : TILE_BORDER.idle,
          borderRadius: 18,
          backgroundColor: solid ? TILE_BG.solid : TILE_BG.idle,
          // Horizontal padding is tighter than the vertical: two tiles side
          // by side on a 375pt phone leave ~113pt of text width at 16, and
          // captions like "Add another session" measured 114 — truncating by
          // under a pixel. 12 buys the headroom without the tiles reading as
          // cramped.
          paddingHorizontal: 12,
          paddingTop: 16,
          // Always reserves the checkmark's space, even when there's no
          // checkmark to show. A tile that skipped it got a taller inner
          // box, so its centered content sat lower than the tile beside it
          // — the same "these don't line up" problem the fixed TILE_HEIGHT
          // above was added to solve, just via padding instead.
          paddingBottom: 28,
          height,
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
        },
        style,
      ]}
    >
      {badgeCount ? <TileBadge count={badgeCount} onPress={onBadgePress} /> : null}
      {children}
      {checkState !== "none" ? <TileCheckmark solid={solid} onPress={onCheckPress} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {content}
    </Pressable>
  );
}
