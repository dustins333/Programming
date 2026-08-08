// Admin Hours / Ops Hours tiles open this directly (no counter on the tile
// itself) — separate hour/minute steppers instead of a raw decimal field,
// converted to a decimal on Save (e.g. 1h30m -> 1.5) for the numeric(10,2)
// admin_hours/ops_hours columns. Minutes step in quarter-hours so the
// decimal conversion is always exact (.25/.5/.75), never a rounding
// artifact.
import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { PayrollBottomSheet, SheetSaveButton } from "./PayrollBottomSheet";
import { toastError } from "../../lib/toast";

const MINUTE_STEP = 15;

function decimalToParts(decimal) {
  const total = Math.round((Number(decimal) || 0) * 60);
  const hours = Math.floor(total / 60);
  const minutes = Math.round((total % 60) / MINUTE_STEP) * MINUTE_STEP;
  return minutes === 60 ? { hours: hours + 1, minutes: 0 } : { hours, minutes };
}

function partsToDecimal(hours, minutes) {
  return Number((hours + minutes / 60).toFixed(2));
}

function Stepper({ label, value, onChange, max, step = 1 }) {
  return (
    <View className="items-center" style={{ width: 110 }}>
      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        hitSlop={10}
        className="mb-1 items-center justify-center rounded-full"
        style={{ width: 40, height: 40, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white" }}
      >
        <Ionicons name="chevron-up" size={18} color={colors.primaryOnWhite} />
      </Pressable>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 30, color: "#44403c" }}>{String(value).padStart(2, "0")}</Text>
      <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <Pressable
        onPress={() => onChange(Math.max(0, value - step))}
        hitSlop={10}
        className="items-center justify-center rounded-full"
        style={{ width: 40, height: 40, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white" }}
      >
        <Ionicons name="chevron-down" size={18} color={colors.primaryOnWhite} />
      </Pressable>
    </View>
  );
}

export function HourMinuteStepperPopup({ visible, onClose, title, initialDecimal, onSave }) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const parts = decimalToParts(initialDecimal);
    setHours(parts.hours);
    setMinutes(parts.minutes);
  }, [visible, initialDecimal]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(partsToDecimal(hours, minutes));
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={title} maxHeight="60%">
      <View className="mb-4 flex-row items-center justify-center" style={{ gap: 12 }}>
        <Stepper label="hours" value={hours} onChange={setHours} max={23} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 26, color: "#a8a29e", marginTop: 8 }}>:</Text>
        <Stepper label="minutes" value={minutes} onChange={setMinutes} max={45} step={MINUTE_STEP} />
      </View>
      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : "Save"} />
    </PayrollBottomSheet>
  );
}
