// Generic tile shell for the Log grid — reused by Group, Programs Written,
// Welcome, Strategy, Admin Hours, Ops Hours, SPC, and (in panel form) the
// Other row. Purely presentational: the caller passes a state and the
// pieces, this owns the chrome.
//
// One anatomy, everywhere: label (+ optional count chip) pinned top-left,
// value pinned bottom-left, control bottom-right, and one caption line
// whose height is ALWAYS reserved whether or not that tile has a caption.
// The previous version centered each tile's whole stack, so a tile with a
// caption sat at a visibly different height from the one beside it — and
// the checkmark, pinned to each tile's own bottom edge, landed at a
// different y as a result. Reserving the caption slot is what makes a fixed
// TILE_HEIGHT hold without a `paddingBottom: 28` zone kept clear for a
// floating badge.
//
// State is carried by the tile's own fill and border — never a badge
// hovering over the edge on its own white backdrop circle, which is what
// made this screen read as unfinished. Submitted tiles get a small inline
// tick in the top-right corner; it is not a button and hasn't been one
// since the day-submit rework (data autosaves as it's entered, the sticky
// footer button submits the whole day).
import { View, Text, Pressable } from "react-native";
import { fonts } from "../../lib/theme";

export const TILE_HEIGHT = 112;
export const TILE_RADIUS = 16;
// Height of the always-reserved caption line, plus the gap above it.
const CAPTION_HEIGHT = 15;
const CAPTION_GAP = 6;

// "empty"     — nothing entered yet
// "entered"   — entered and autosaved, but the day hasn't been submitted
// "submitted" — the day this tile belongs to has been submitted
//
// Both non-empty tones are already in the app: peach is the selected-session
// banner, sage is statusColors.onTrack. Neither is a new color.
const TONES = {
  empty: {
    bg: "#ffffff",
    border: "#ece7e1",
    borderWidth: 1,
    label: "#78716c",
    value: "#d6cec7",
    caption: "#b5aea7",
    control: { border: "#e7e5e4", bg: "#ffffff", fg: "#8a5140" },
    chip: "#a46a57",
  },
  entered: {
    bg: "#fdf6f2",
    border: "#f0ddd2",
    borderWidth: 1,
    label: "#78716c",
    value: "#2a211c",
    caption: "#8a5140",
    control: { border: "#ead9cd", bg: "#ffffff", fg: "#8a5140" },
    chip: "#a46a57",
  },
  submitted: {
    bg: "#eef1e7",
    border: "#4d6142",
    borderWidth: 1,
    label: "#5f6b53",
    value: "#2f3a27",
    caption: "#4d6142",
    control: { border: "#cbd6bd", bg: "#f7faf3", fg: "#4d6142" },
    chip: "#4d6142",
  },
};

// The muted half of a +/- pair when decrementing isn't possible — deliberately
// still tappable-looking-but-quiet rather than removed, so the pair doesn't
// reflow when the count crosses 1.
export const CONTROL_DISABLED = { border: "#ece7e1", bg: "#ffffff", fg: "#d6cec7" };

export function tileTone(state) {
  return TONES[state] || TONES.empty;
}

// Resolves the three states from what a tile actually knows: does it hold
// anything, and has its day been submitted. Every tile on the Log screen
// reads the same way because they all come through here.
export function tileState(hasData, daySubmitted) {
  if (!hasData) return "empty";
  return daySubmitted ? "submitted" : "entered";
}

// Small count pill beside the label — "how many of this repeatable thing
// (SPC sessions, Other line items) are logged for this date." Tapping opens
// the list. It sits inline in the label row rather than floating over the
// corner, so it can't collide with the tick.
export function TileChip({ count, tone, onPress }) {
  if (!count) return null;
  const pill = (
    <View
      style={{
        minWidth: 17,
        height: 17,
        borderRadius: 99,
        backgroundColor: tone.chip,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 5,
      }}
    >
      <Text style={{ color: "white", fontSize: 10, fontFamily: fonts.sansBold }}>{count}</Text>
    </View>
  );
  if (!onPress) return pill;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={`${count} logged — view details`}>
      {pill}
    </Pressable>
  );
}

// The submitted-state tick. 11px, inline, no backdrop — at this size and
// weight it reads as a status mark rather than something to press.
function TileTick({ tone }) {
  return <Text style={{ fontSize: 11, color: tone.caption, fontFamily: fonts.sansSemiBold }}>✓</Text>;
}

// Round control button (the +/- pair, SPC's add). `variant="square"` gives
// the rounded-square used by the hours tiles' pencil, so a control that
// opens a sheet doesn't look like a control that increments a number.
export function TileButton({ icon, onPress, tone, variant = "round", accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 29,
        height: 29,
        borderRadius: variant === "square" ? 9 : 99,
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {typeof icon === "string" ? (
        <Text style={{ fontSize: variant === "square" ? 12 : 15, fontFamily: fonts.sansSemiBold, color: tone.fg }}>{icon}</Text>
      ) : (
        icon
      )}
    </Pressable>
  );
}

// The tile's big number. A string is styled for you; pass a node when the
// value needs its own composition (the hours tiles' "1h 30m").
function TileValue({ value, tone }) {
  if (typeof value !== "string" && typeof value !== "number") return value;
  return <Text style={{ fontSize: 30, fontFamily: fonts.sansBold, color: tone.value, lineHeight: 30 }}>{value}</Text>;
}

// `children` switches the tile into panel mode: the label row still renders
// (so the chip and tick stay consistent with every other tile) but the body
// is whatever the caller draws, and the height is content-driven. That's
// what the full-width Other row uses.
export function PayrollTile({
  state = "empty",
  label,
  chipCount,
  onChipPress,
  value,
  control,
  caption,
  onPress,
  style,
  height = TILE_HEIGHT,
  children,
}) {
  const tone = tileTone(state);
  const isPanel = children != null;

  const body = (
    <View
      style={[
        {
          borderWidth: tone.borderWidth,
          borderColor: tone.border,
          borderRadius: TILE_RADIUS,
          backgroundColor: tone.bg,
          paddingTop: 11,
          paddingHorizontal: 12,
          paddingBottom: isPanel ? 12 : 9,
          ...(isPanel ? null : { height }),
        },
        style,
      ]}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6, flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: tone.label, flexShrink: 1 }}>
            {label}
          </Text>
          <TileChip count={chipCount} tone={tone} onPress={onChipPress} />
        </View>
        {state === "submitted" ? <TileTick tone={tone} /> : null}
      </View>

      {isPanel ? (
        children
      ) : (
        <>
          <View style={{ flex: 1 }} />
          <View className="flex-row items-end justify-between">
            <TileValue value={value} tone={tone} />
            <View className="flex-row items-center" style={{ gap: 6 }}>
              {control}
            </View>
          </View>
          <View style={{ height: CAPTION_HEIGHT, marginTop: CAPTION_GAP, justifyContent: "center" }}>
            {typeof caption === "string" ? (
              <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: tone.caption }}>
                {caption}
              </Text>
            ) : (
              caption
            )}
          </View>
        </>
      )}
    </View>
  );

  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}
