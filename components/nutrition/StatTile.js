import { useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { fonts } from "../../lib/theme";
import { useScrollToKeyboard } from "../../lib/scrollToKeyboard";
import { AddValueBadge } from "./AddValueBadge";

// design_handoff_member_mobile_v5 (1g) — the weight and sleep tiles. Value
// in Protest Strike with the unit in Montserrat beside it.
// `footer` carries the tile's own extra content — weight's "▼ 1.2 vs last
// week" line, sleep's quality rating.
//
// On the entry screen the tile keeps its solid card treatment whether or not
// anything's logged (per direct feedback — the dashed-until-logged version
// read as an unfinished box rather than an empty one, next to the macro
// dials whose white centers stay solid either way). "Not logged yet" is
// carried by the circled "+" in place of the value instead.
//
// `readOnly` (Weekly's expanded past days) keeps the original dashed-empty
// look: there's no "+" to offer there, so the dash is the only thing left
// saying that day went unlogged.
const DASHED_EMPTY = "#ddd6cd";
const CARD_BORDER = "#ece7e1";

export function StatTile({ eyebrow, value, unit, onChangeText, footer, readOnly, scrollViewRef, scrollOffsetRef }) {
  const fieldRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const empty = value === "" || value === null || value === undefined;
  const dashed = readOnly && empty;
  return (
    <View
      ref={fieldRef}
      style={{
        flex: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: dashed ? "transparent" : "#fff",
        borderWidth: dashed ? 1.5 : 1,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: dashed ? DASHED_EMPTY : CARD_BORDER,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: "#a8a29e" }}
      >
        {eyebrow}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
        {readOnly ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
            style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 24, color: empty ? "#c9c4bd" : "#44403c" }}
          >
            {empty ? "–" : value}
          </Text>
        ) : (
          <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              onFocus={() => {
                setFocused(true);
                scrollFieldIntoView(fieldRef.current);
              }}
              onBlur={() => setFocused(false)}
              keyboardType="decimal-pad"
              placeholderTextColor="#c9c4bd"
              autoComplete="off"
              accessibilityLabel={eyebrow}
              maxFontSizeMultiplier={1.15}
              style={{
                // react-native-web won't shrink an <input> below its intrinsic
                // content width without an explicit minWidth — without this the
                // row overflows the tile and pushes the unit outside it (sleep's
                // "hrs" landed off-screen entirely at phone width).
                minWidth: 0,
                fontFamily: fonts.display,
                fontSize: 24,
                color: "#44403c",
                paddingVertical: 2,
              }}
            />
            {empty && !focused ? (
              <AddValueBadge size={28} style={{ position: "absolute", left: 0, pointerEvents: "none" }} />
            ) : null}
          </View>
        )}
        {unit ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", paddingBottom: 5 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {footer ? <View style={{ marginTop: 6 }}>{footer}</View> : null}
    </View>
  );
}
