import { useState } from "react";
import { View, Text, Pressable, Modal, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { FIELD_MIN_HEIGHT } from "./TargetField";

const isWeb = Platform.OS === "web";
const OPTIONS = [1, 2, 3, 4, 5];

// A 1-5 rating picker (sleep quality / hunger / energy) — web gets a real
// <select>, native a Pressable that opens a small option list, same
// platform split used by every other dropdown in this app (PhotoCompare's
// DatePicker, PhotoSubmissionsEditor's AngleDropdown).
export function RatingSelect({ label, value, onChangeText, flex }) {
  const [open, setOpen] = useState(false);

  return (
    // Structure has to mirror TargetField exactly — label, then the control,
    // then any extra caption — or a shared flex-row (Sleep/Sleep quality,
    // Steps/Hunger/Energy) renders this control lower than its neighbours.
    // The "1 = low · 5 = high" scale anchor used to sit *between* the label
    // and the control, which pushed this box ~18px down while TargetField's
    // box stayed put; that was the misalignment, not the target pills. It
    // now renders below the control, where TargetField's own pill goes.
    <View className={flex ? "mb-2 flex-1" : "mb-2"}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      {isWeb ? (
        <select
          value={value || ""}
          onChange={(e) => onChangeText(e.target.value)}
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            width: "100%",
            // Matching TargetField's box height exactly (see
            // FIELD_MIN_HEIGHT) — padding alone never lands a <select> and a
            // TextInput on the same rendered height.
            height: FIELD_MIN_HEIGHT,
            boxSizing: "border-box",
            padding: "0 14px",
            borderRadius: 8,
            border: "1px solid #d6d3d1",
            color: "#44403c",
            backgroundColor: "white",
          }}
        >
          <option value="">—</option>
          {OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <>
          <Pressable onPress={() => setOpen(true)} className="justify-center rounded-lg border border-stone-300 px-4" style={{ minHeight: FIELD_MIN_HEIGHT }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 15 }}>{value || "—"}</Text>
          </Pressable>
          <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
            <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
              <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-white p-2">
                {OPTIONS.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => {
                      onChangeText(String(n));
                      setOpen(false);
                    }}
                    className="rounded-xl px-4 py-3"
                    style={String(n) === String(value) ? { backgroundColor: "#fdf6f2" } : undefined}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, color: String(n) === String(value) ? colors.primaryOnWhite : "#44403c" }}>{n}</Text>
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
      {/* Scale anchor — "(1-5)" alone never said which end was which. Sits
          below the control, in the same slot TargetField's target pill uses. */}
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        1 = low · 5 = high
      </Text>
    </View>
  );
}
