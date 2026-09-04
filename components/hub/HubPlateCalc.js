import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { PressFade } from "../PressFade";
import { DockPill } from "./HubDock";
import { PLATE_WEIGHTS, formatNum } from "../WeightCalculator";
import { listSpecialtyBars } from "../../lib/equipment/specialtyBars";
import { fonts, colors } from "../../lib/theme";

// The plate calculator, docked. Same semantics as components/WeightCalculator
// (bar first, then tap each plate as it is actually loaded — each tap adds
// that plate's FACE VALUE, no per-side doubling, which Terra corrected the
// first version on), reusing that file's plate list and bar rules so the two
// can't disagree about what this gym has on the floor.
//
// What differs is only where it lives: WeightCalculator is a bottom-sheet
// Modal, which on this board would cover the sets it is filling in and float
// over the other three clients' columns. This one takes the KEYPAD's place
// inside its own column — same corner, same footprint, `‹ Keypad` back.
//
// Specialty is a `›` because it opens the coach-configured bar list rather
// than switching modes, matching the member app.

function SpecialtyPicker({ visible, bars, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center" }}>
        <Pressable
          onPress={() => {}}
          style={{ width: 320, maxHeight: "70%", borderRadius: 18, backgroundColor: colors.canvas, padding: 16 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#292524", marginBottom: 10 }}>Specialty bar</Text>
          <ScrollView>
            {bars.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
                No specialty bars configured yet — an admin can add them in Settings → Equipment.
              </Text>
            ) : null}
            {bars.map((bar) => (
              <PressFade
                key={`${bar.name}-${bar.weight}`}
                onPress={() => onSelect(bar)}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#292524" }}>
                  {bar.name} <Text style={{ color: colors.muted }}>({bar.weight} lb)</Text>
                </Text>
              </PressFade>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useHubPlateCalc() {
  const [barMode, setBarMode] = useState("none");
  const [specialtyBars, setSpecialtyBars] = useState([]);
  const [selectedBar, setSelectedBar] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [stack, setStack] = useState([]);

  useEffect(() => {
    listSpecialtyBars()
      .then(setSpecialtyBars)
      .catch(() => setSpecialtyBars([])); // display-only context; never blocks the pad
  }, []);

  const barWeight = barMode === "barbell" ? 35 : barMode === "specialty" ? selectedBar?.weight ?? 0 : 0;
  const total = stack.reduce((sum, w) => sum + w, barWeight);
  const counts = useMemo(
    () =>
      stack.reduce((acc, w) => {
        acc[w] = (acc[w] || 0) + 1;
        return acc;
      }, {}),
    [stack]
  );

  return {
    barMode,
    setBarMode,
    specialtyBars,
    selectedBar,
    setSelectedBar,
    showPicker,
    setShowPicker,
    stack,
    setStack,
    total,
    counts,
    reset: () => {
      setStack([]);
      setBarMode("none");
    },
  };
}

export function HubPlateCalcStrip({ calc, onInsert, onBackToKeypad }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 8 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8, color: colors.muted }}>TOTAL</Text>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 26, color: "#292524", marginLeft: 8 }}>{formatNum(calc.total)}</Text>
      </View>
      <View style={{ marginBottom: 8 }}>
        <DockPill label="‹ Keypad" onPress={onBackToKeypad} />
      </View>
      <DockPill label={`Insert ${formatNum(calc.total)}`} tone="filled" onPress={() => onInsert(calc.total)} />
    </View>
  );
}

export function HubPlateCalcGrid({ calc, width = 260 }) {
  const gap = 6;
  const plateWidth = (width - gap * 2) / 3;
  const barButton = (key, label, chevron) => {
    const active = calc.barMode === key;
    return (
      <PressFade
        key={key}
        onPress={() => (key === "specialty" ? calc.setShowPicker(true) : calc.setBarMode(key))}
        style={{
          flex: 1,
          height: 34,
          marginLeft: key === "none" ? 0 : gap,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.primary : "white",
          borderWidth: 1,
          borderColor: active ? colors.primary : "#e0d9d1",
        }}
      >
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "white" : "#44403c" }}>
          {label}
          {chevron ? " ›" : ""}
        </Text>
      </PressFade>
    );
  };

  return (
    <View style={{ width }}>
      <View style={{ flexDirection: "row", marginBottom: gap }}>
        {barButton("none", "None")}
        {barButton("barbell", "35 lb")}
        {barButton("specialty", calc.selectedBar && calc.barMode === "specialty" ? `${calc.selectedBar.weight} lb` : "Spec", true)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {PLATE_WEIGHTS.map((w, i) => (
          <PressFade
            key={w}
            onPress={() => calc.setStack((prev) => [...prev, w])}
            onLongPress={() => calc.setStack((prev) => prev.slice(0, -1))}
            style={{
              width: plateWidth,
              height: 40,
              marginLeft: i % 3 === 0 ? 0 : gap,
              marginBottom: gap,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#e0d9d1",
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#44403c" }}>{w}</Text>
            {calc.counts[w] ? (
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: "#b23a22", marginLeft: 4 }}>×{calc.counts[w]}</Text>
            ) : null}
          </PressFade>
        ))}
        <PressFade
          onPress={() => calc.setStack((prev) => prev.slice(0, -1))}
          disabled={calc.stack.length === 0}
          style={{
            width: plateWidth,
            height: 40,
            marginLeft: gap,
            marginBottom: gap,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: "#e0d9d1",
            opacity: calc.stack.length === 0 ? 0.4 : 1,
          }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted }}>Undo</Text>
        </PressFade>
      </View>

      <SpecialtyPicker
        visible={calc.showPicker}
        bars={calc.specialtyBars}
        onSelect={(bar) => {
          calc.setSelectedBar(bar);
          calc.setBarMode("specialty");
          calc.setShowPicker(false);
        }}
        onClose={() => calc.setShowPicker(false)}
      />
    </View>
  );
}
