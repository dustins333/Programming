import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { formatDateMD } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";
const MUTED = "#a8a29e";

// Steps through a program's (or an SPC client's) blocks on the coach preview.
//
// A stepper rather than the tab row the SPC client page uses: this screen is
// built to be read on a phone between clients, and a client with a dozen
// blocks would wrap that row into three lines of pills. Arrows cost two taps
// to reach a neighbouring block, which is the only move that actually comes
// up — "what did we do last block" and "what's queued next".
//
// Blocks arrive oldest-first; the arrows read left = earlier, right = later.
export function BlockPicker({ blocks, selectedId, onSelect, today }) {
  if (!blocks || blocks.length <= 1) return null;

  const index = blocks.findIndex((b) => b.id === selectedId);
  const block = blocks[index];
  if (!block) return null;

  const atOldest = index <= 0;
  const atNewest = index >= blocks.length - 1;
  const isCurrent = block.block_start_date <= today && today <= block.block_end_date;

  const Arrow = ({ dir, disabled }) => (
    <PressFade
      onPress={() => !disabled && onSelect(blocks[index + (dir === "back" ? -1 : 1)].id)}
      disabled={disabled}
      hitSlop={10}
      accessibilityLabel={dir === "back" ? "Earlier block" : "Later block"}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={dir === "back" ? "chevron-back" : "chevron-forward"} size={16} color="#57534e" />
    </PressFade>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Arrow dir="back" disabled={atOldest} />
      <View style={{ flex: 1, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#44403c" }}>
            {block.label ?? `Block ${index + 1}`}
          </Text>
          {isCurrent ? (
            <View style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.4, color: "#fff" }}>
                CURRENT
              </Text>
            </View>
          ) : null}
        </View>
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11, color: MUTED, marginTop: 2 }}>
          {formatDateMD(block.block_start_date)} – {formatDateMD(block.block_end_date)}
        </Text>
      </View>
      <Arrow dir="forward" disabled={atNewest} />
    </View>
  );
}

// The hero's context clause. "Week 3 of 6" is only true of the block you're
// actually in — a finished or not-yet-started block needs to say which it is
// rather than borrow the current one's week count.
export function blockHeroTitle({ block, label, weeks, currentWeek, today }) {
  const name = label ?? "Block";
  if (block.block_end_date < today) return `${name} | Finished ${formatDateMD(block.block_end_date)}`;
  if (block.block_start_date > today) return `${name} | Starts ${formatDateMD(block.block_start_date)}`;
  return `${name} | Week ${currentWeek} of ${weeks}`;
}
