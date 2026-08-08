// Native's stand-in for a real <select> — RN has no built-in dropdown, so
// this renders a select-looking field (label + chevron) that opens a
// centered Modal listing the options as tappable rows. Extracted from
// app/(coach)/announcements/index.js (its own date/time pickers) so a
// second caller (PayrollOtherRow) doesn't duplicate it — web callers keep
// using a real <select> directly, this is native-only.
import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";

export function NativePickerField({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-1 flex-row items-center justify-between rounded-lg border border-stone-300 px-3 py-2.5"
        style={{ backgroundColor: "white" }}
      >
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans, color: selected ? "#44403c" : "#a8a29e", flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#a8a29e" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-white p-2" style={{ maxHeight: "70%" }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="rounded-xl px-4 py-3"
                  style={o.value === value ? { backgroundColor: "#fdf6f2" } : undefined}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, color: o.value === value ? colors.primaryOnWhite : "#44403c" }}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
