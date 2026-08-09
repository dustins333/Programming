import { useState } from "react";
import { View, Text, Pressable, Modal, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";
const OPTIONS = [1, 2, 3, 4, 5];

// A 1-5 rating picker (sleep quality / hunger / energy) — web gets a real
// <select>, native a Pressable that opens a small option list, same
// platform split used by every other dropdown in this app (PhotoCompare's
// DatePicker, PhotoSubmissionsEditor's AngleDropdown).
export function RatingSelect({ label, value, onChangeText, flex }) {
  const [open, setOpen] = useState(false);

  return (
    // Top-aligned (no justify-end) to match TargetField's current layout —
    // TargetField's own target-pill now renders below its input instead of
    // next to the label, so every sibling field in a shared flex-row (e.g.
    // Steps/Hunger/Energy) naturally lines up its label+input at the same
    // top position regardless of whether a sibling has extra pill content
    // beneath it.
    <View className={flex ? "mb-2 flex-1" : "mb-2"}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      {/* Scale anchor — "(1-5)" alone never said which end was which. */}
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} className="mb-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        1 = low · 5 = high
      </Text>
      {isWeb ? (
        <select
          value={value || ""}
          onChange={(e) => onChangeText(e.target.value)}
          style={{ fontFamily: fonts.sans, fontSize: 15, width: "100%", padding: "11px 14px", borderRadius: 8, border: "1px solid #d6d3d1", color: "#44403c", backgroundColor: "white" }}
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
          <Pressable onPress={() => setOpen(true)} className="rounded-lg border border-stone-300 px-4 py-3">
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
    </View>
  );
}
