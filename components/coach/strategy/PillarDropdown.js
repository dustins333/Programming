import { useState } from "react";
import { View, Text, Pressable, Modal, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { T } from "./ui";
import { fonts } from "../../../lib/theme";
import { PILLARS } from "../../../lib/programming/strategySessions";

// The pillar the coach locks in on save. Same shape as components/OptionPicker
// (web: a real <select>, which on a phone opens the OS picker; native: a
// field that opens a modal list), sized for this screen: 52 tall, 15pt,
// thumb-sized rows.
//
// Starts blank on purpose. The AI's suggestion is marked in the list, but
// the coach has to choose, so a saved pillar is always her decision.

function label(p, suggested) {
  return p.value === suggested ? `${p.label} (suggested)` : p.label;
}

export function PillarDropdown({ value, onChange, suggested, invalid, disabled }) {
  const [open, setOpen] = useState(false);
  const borderColor = invalid ? "#b23a22" : value ? T.clay : T.inputBorder;
  const selected = PILLARS.find((p) => p.value === value);

  if (Platform.OS === "web") {
    return (
      <View style={{ position: "relative", opacity: disabled ? 0.6 : 1 }}>
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label="Her pillar"
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            border: `1.5px solid ${borderColor}`,
            backgroundColor: "#fff",
            padding: "0 44px 0 14px",
            fontFamily: value ? fonts.sansSemiBold : fonts.sans,
            fontSize: 15,
            color: value ? T.ink : T.ink4,
            appearance: "none",
            WebkitAppearance: "none",
            MozAppearance: "none",
          }}
        >
          <option value="" disabled>
            Choose her pillar
          </option>
          {PILLARS.map((p) => (
            <option key={p.value} value={p.value}>
              {label(p, suggested)}
            </option>
          ))}
        </select>
        <View pointerEvents="none" style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}>
          <Ionicons name="chevron-down" size={18} color={T.ink3} />
        </View>
      </View>
    );
  }

  return (
    <>
      <PressFade
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel="Her pillar"
        style={{
          height: 52,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: "#fff",
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontFamily: value ? fonts.sansSemiBold : fonts.sans, fontSize: 15, color: value ? T.ink : T.ink4 }}
        >
          {selected ? selected.label : "Choose her pillar"}
        </Text>
        <Ionicons name="chevron-down" size={18} color={T.ink3} />
      </PressFade>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, borderRadius: 18, backgroundColor: "#fff", padding: 8 }}>
            {PILLARS.map((p) => (
              <PressFade
                key={p.value}
                onPress={() => {
                  onChange(p.value);
                  setOpen(false);
                }}
                style={{
                  minHeight: 48,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: p.value === value ? T.clayTint : "transparent",
                }}
              >
                <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: T.ink }}>{label(p, suggested)}</Text>
                {p.value === value ? <Ionicons name="checkmark" size={18} color={T.clayText} /> : null}
              </PressFade>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
