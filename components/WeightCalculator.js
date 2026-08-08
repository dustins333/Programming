import { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";
import { SegmentedControl } from "./SegmentedControl";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";
import { KeyboardDoneButton } from "./KeyboardDoneButton";

const CARD_BORDER = "#ece7e1";

// The gym only actually has 35 lb barbells, plus whatever specialty bars
// (trap bar, safety squat bar, etc.) — those don't have one fixed weight,
// so "Specialty" just opens a plain typed-in field instead of a preset list.
const BAR_MODES = [
  { key: "barbell", label: "Barbell (35 lb)" },
  { key: "specialty", label: "Specialty" },
];

const PLATE_WEIGHTS = [45, 35, 25, 10, 5, 2.5];

const KEYPAD_ROWS = [
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["C", "0", ".", "+"],
];

// Strips float noise (2.5 + 2.5 -> "5", not "5.00") without losing real
// fractional plate weights.
function formatNum(n) {
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(2)).toString();
}

// A plain running-total calculator (enter, operator, enter, =, chain
// further) — this is the "adding up the plates myself" case, just with a
// keypad instead of mental math.
function StandardCalc({ onInsert }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [pendingOp, setPendingOp] = useState(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const applyOp = (a, b, op) => {
    switch (op) {
      case "+":
        return a + b;
      case "−":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? 0 : a / b;
      default:
        return b;
    }
  };

  const pressDigit = (d) => {
    if (waitingForOperand) {
      setDisplay(d === "." ? "0." : d);
      setWaitingForOperand(false);
      return;
    }
    if (d === "." && display.includes(".")) return;
    setDisplay(display === "0" && d !== "." ? d : display + d);
  };

  const pressOperator = (op) => {
    const value = parseFloat(display) || 0;
    if (stored !== null && pendingOp && !waitingForOperand) {
      const result = applyOp(stored, value, pendingOp);
      setStored(result);
      setDisplay(formatNum(result));
    } else {
      setStored(value);
    }
    setPendingOp(op);
    setWaitingForOperand(true);
  };

  const pressEquals = () => {
    if (pendingOp === null || stored === null) return;
    const value = parseFloat(display) || 0;
    const result = applyOp(stored, value, pendingOp);
    setDisplay(formatNum(result));
    setStored(null);
    setPendingOp(null);
    setWaitingForOperand(true);
  };

  const pressClear = () => {
    setDisplay("0");
    setStored(null);
    setPendingOp(null);
    setWaitingForOperand(false);
  };

  const pressBackspace = () => {
    if (waitingForOperand) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  };

  const currentValue = parseFloat(display) || 0;

  return (
    <View>
      <View className="mb-3 items-end rounded-xl bg-white px-4 py-4" style={{ borderWidth: 1, borderColor: CARD_BORDER }}>
        {pendingOp ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
            {formatNum(stored)} {pendingOp}
          </Text>
        ) : null}
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 32, color: "#44403c" }}>{display}</Text>
      </View>

      <View style={{ gap: 8 }}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} className="flex-row" style={{ gap: 8 }}>
            {row.map((key) => {
              const isOp = key === "÷" || key === "×" || key === "−" || key === "+";
              const isClear = key === "C";
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    if (isClear) pressClear();
                    else if (isOp) pressOperator(key);
                    else pressDigit(key);
                  }}
                  className="flex-1 items-center justify-center rounded-xl"
                  style={{
                    height: 52,
                    backgroundColor: isOp ? colors.primary : isClear ? "#f1efed" : "white",
                    borderWidth: isOp || isClear ? 0 : 1,
                    borderColor: CARD_BORDER,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 18, color: isOp ? "white" : "#44403c" }}>{key}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View className="flex-row" style={{ gap: 8 }}>
          <Pressable onPress={pressBackspace} className="flex-1 items-center justify-center rounded-xl" style={{ height: 52, backgroundColor: "#f1efed" }}>
            <Ionicons name="backspace-outline" size={18} color="#78716c" />
          </Pressable>
          <Pressable onPress={pressEquals} className="flex-1 items-center justify-center rounded-xl" style={{ height: 52, backgroundColor: "#f1efed" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 18, color: "#44403c" }}>=</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => onInsert(currentValue)} className="mt-3 items-center justify-center rounded-xl" style={{ height: 50, backgroundColor: colors.primary }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "white" }}>Insert {formatNum(currentValue)}</Text>
      </Pressable>
    </View>
  );
}

// Tap the bar, then tap each plate exactly as it's loaded — no per-side
// doubling, since that was confusing the point of clicking through the
// actual plates: each tap is worth its own face value, and a member loading
// two 45s per side just taps 45 four times.
function PlateCalc({ onInsert }) {
  const [barMode, setBarMode] = useState("barbell");
  const [specialtyWeight, setSpecialtyWeight] = useState("");
  const [plateStack, setPlateStack] = useState([]); // one entry per plate tapped, oldest first

  const barWeight = barMode === "barbell" ? 35 : parseFloat(specialtyWeight) || 0;

  const addPlate = (w) => setPlateStack((prev) => [...prev, w]);
  const undoLast = () => setPlateStack((prev) => prev.slice(0, -1));
  const clearPlates = () => setPlateStack([]);

  const plateTotal = plateStack.reduce((sum, w) => sum + w, 0);
  const total = barWeight + plateTotal;
  const counts = plateStack.reduce((acc, w) => {
    acc[w] = (acc[w] || 0) + 1;
    return acc;
  }, {});

  return (
    <View>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", marginBottom: 8 }}>Bar</Text>
      <View className="flex-row" style={{ gap: 8 }}>
        {BAR_MODES.map((bar) => {
          const active = barMode === bar.key;
          return (
            <Pressable
              key={bar.key}
              onPress={() => setBarMode(bar.key)}
              className="flex-1 items-center justify-center rounded-xl"
              style={{ height: 44, backgroundColor: active ? colors.primary : "white", borderWidth: 1, borderColor: active ? colors.primary : CARD_BORDER }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: active ? "white" : "#44403c" }}>{bar.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {barMode === "specialty" ? (
        <TextInput
          value={specialtyWeight}
          onChangeText={setSpecialtyWeight}
          placeholder="Bar weight"
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          placeholderTextColor="#a8a29e"
          className="mt-2 text-center"
          style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c", height: 44, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10 }}
        />
      ) : null}

      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c", marginTop: 16, marginBottom: 8 }}>Plates (tap each one you load)</Text>
      <View className="mb-2 flex-row flex-wrap" style={{ gap: 8 }}>
        {PLATE_WEIGHTS.map((w) => (
          <Pressable key={w} onPress={() => addPlate(w)} className="items-center justify-center rounded-xl" style={{ width: "31%", height: 56, backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>{w}</Text>
            {counts[w] ? (
              <View className="mt-1 rounded-full px-2" style={{ backgroundColor: "#fdece5" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#b23a22" }}>×{counts[w]}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View className="mb-3 flex-row justify-end" style={{ gap: 16 }}>
        <Pressable onPress={undoLast} disabled={plateStack.length === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: plateStack.length === 0 ? "#d6d3d1" : colors.primaryOnWhite }}>Undo</Text>
        </Pressable>
        <Pressable onPress={clearPlates} disabled={plateStack.length === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: plateStack.length === 0 ? "#d6d3d1" : colors.primaryOnWhite }}>Clear plates</Text>
        </Pressable>
      </View>

      <View className="mb-3 items-center rounded-xl bg-white px-4 py-4" style={{ borderWidth: 1, borderColor: CARD_BORDER }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Total</Text>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 32, color: "#44403c" }}>{formatNum(total)}</Text>
      </View>

      <Pressable onPress={() => onInsert(total)} className="items-center justify-center rounded-xl" style={{ height: 50, backgroundColor: colors.primary }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "white" }}>Insert {formatNum(total)}</Text>
      </Pressable>
    </View>
  );
}

// Bottom-sheet weight helper opened from the calculator icon that appears
// next to a focused weight field in SessionLogger.js. Two modes: a plain
// arithmetic keypad (Standard) and a bar+plates tally (Plate) — see
// SessionLogger.js for how the weight field's icon dismisses the native
// keyboard and opens this in its place.
export function WeightCalculator({ visible, onClose, onInsert }) {
  const [mode, setMode] = useState("standard");

  const handleInsert = (value) => {
    onInsert(value);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pressable onPress={onClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ maxHeight: "85%", width: "100%", backgroundColor: "#faf8f6", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 28 }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#44403c" }}>Weight calculator</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} className="items-center justify-center" style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4" }}>
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          <SegmentedControl
            segments={[
              { key: "standard", label: "Standard" },
              { key: "plate", label: "Plate" },
            ]}
            activeKey={mode}
            onSelect={setMode}
          />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{mode === "standard" ? <StandardCalc onInsert={handleInsert} /> : <PlateCalc onInsert={handleInsert} />}</ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </Modal>
  );
}
