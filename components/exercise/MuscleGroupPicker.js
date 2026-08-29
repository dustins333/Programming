import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MUSCLE_GROUPS, MUSCLE_SUB_GROUPS, muscleGroupLabel } from "../../lib/programming/exercises";
import { fonts, colors } from "../../lib/theme";
import { PICKER_BORDER, ROW_RULE, CHIP_BORDER, INK } from "./tokens";

// One collapsed row per top-level group, opening to that group's own
// options. A flat wall of every muscle value would be ~23 chips with no
// structure; this keeps the closed state to eight scannable rows while
// still showing, on each row, what's already picked underneath it.
//
// The first chip in a section is always the top-level group itself, so
// "just chest" stays a valid answer — that's what everything tagged before
// sub-groups existed holds, and it's a legitimate choice for an exercise
// that genuinely doesn't split.
//
// Extracted out of ExerciseFormModal in the v1 library handoff so the form,
// which is now assembled from four cards, isn't 900 lines of one file.
export function MuscleGroupPicker({ selected, onToggle }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleSection = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View style={{ borderWidth: 1, borderColor: PICKER_BORDER, borderRadius: 10, backgroundColor: "#fff", overflow: "hidden" }}>
      {MUSCLE_GROUPS.map((section, i) => {
        const subs = MUSCLE_SUB_GROUPS[section];
        const options = [section, ...subs];
        const picked = options.filter((o) => selected.includes(o));
        const isOpen = expanded.has(section);
        return (
          <View key={section} style={i > 0 ? { borderTopWidth: 1, borderTopColor: ROW_RULE } : undefined}>
            <Pressable
              onPress={() => toggleSection(section)}
              accessibilityLabel={`${muscleGroupLabel(section)} options`}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 13 }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{
                    fontFamily: fonts.sansBold,
                    fontSize: 10.5,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: picked.length ? colors.primaryOnWhite : "#78716c",
                  }}
                >
                  {muscleGroupLabel(section)}
                </Text>
                {picked.length ? (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 1 }}
                  >
                    {picked.map(muscleGroupLabel).join(", ")}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={isOpen ? "chevron-down" : "chevron-forward"} size={14} color="#a8a29e" />
            </Pressable>
            {isOpen ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 13, paddingBottom: 12 }}>
                {options.map((o) => {
                  const active = selected.includes(o);
                  const isSectionItself = o === section;
                  return (
                    <Pressable
                      key={o}
                      onPress={() => onToggle(o)}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.primary : CHIP_BORDER,
                        backgroundColor: active ? colors.primary : "#fff",
                        borderRadius: 99,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.15}
                        style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "#fff" : INK }}
                      >
                        {isSectionItself && subs.length > 0 ? `${muscleGroupLabel(section)} (general)` : muscleGroupLabel(o)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
