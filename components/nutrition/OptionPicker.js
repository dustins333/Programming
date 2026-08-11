import { useState } from "react";
import { View, Text, Pressable, Modal, Platform, ScrollView } from "react-native";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";

// Web: a real <select>. Native: a Pressable that opens a modal option list —
// RN has no <select> equivalent. This is the house pattern, previously
// hand-rolled separately in PhotoCompare's DatePicker and
// PhotoSubmissionsEditor's AngleDropdown; both now render through this.
//
// The list always scrolls: a client with a lot of progress photos used to
// overflow the modal with no way to reach the older dates.
export function OptionPicker({ options, value, onChange, placeholder = "Select…", align = "left" }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  if (isWeb) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: fonts.sans,
          fontSize: 12.5,
          width: "100%",
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid #d9d4cd",
          color: "#44403c",
          backgroundColor: "white",
          textAlign: align,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="rounded border border-stone-300 px-2 py-1.5">
        <Text numberOfLines={1} className="text-center text-xs" style={{ fontFamily: fonts.sansMedium }}>
          {selected ? selected.label : placeholder} ▾
        </Text>
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

// ‹ [picker] › — a dropdown for jumping straight to an option, flanked by
// arrows for stepping one at a time. `options` is in display order; stepping
// follows that same order.
export function OptionStepper({ options, value, onChange, placeholder, align }) {
  const index = options.findIndex((o) => o.value === value);
  const atStart = index <= 0;
  const atEnd = index < 0 || index >= options.length - 1;
  return (
    <View className="flex-row items-center justify-center gap-3">
      <Pressable onPress={() => !atStart && onChange(options[index - 1].value)} disabled={atStart} hitSlop={8}>
        <Text style={{ color: atStart ? "#d6d3d1" : colors.primaryOnWhite, fontFamily: fonts.sansMedium }}>‹</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <OptionPicker options={options} value={value} onChange={onChange} placeholder={placeholder} align={align} />
      </View>
      <Pressable onPress={() => !atEnd && onChange(options[index + 1].value)} disabled={atEnd} hitSlop={8}>
        <Text style={{ color: atEnd ? "#d6d3d1" : colors.primaryOnWhite, fontFamily: fonts.sansMedium }}>›</Text>
      </Pressable>
    </View>
  );
}
