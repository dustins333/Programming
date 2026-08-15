// Admin Hours / Ops Hours open this directly from their tile — separate
// hour and minute steppers rather than a raw decimal field, converted on
// save (1h30m -> 1.5) for the numeric(10,2) admin_hours/ops_hours columns.
// Minutes step in quarter-hours so the conversion is always exact
// (.25/.5/.75), never a rounding artifact.
//
// The preset row is the fast path: most logged hours land on one of a
// handful of values, and tapping "1h 30m" beats six taps on a stepper. The
// steppers stay for everything else.
import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts } from "../../lib/theme";
import { PayrollBottomSheet, SheetSaveButton, SheetLabel } from "./PayrollBottomSheet";
import { toastError } from "../../lib/toast";

const MINUTE_STEP = 15;
const PRESETS = [
  { label: "30m", hours: 0, minutes: 30 },
  { label: "1h", hours: 1, minutes: 0 },
  { label: "1h 30m", hours: 1, minutes: 30 },
  { label: "2h", hours: 2, minutes: 0 },
];

function decimalToParts(decimal) {
  const total = Math.round((Number(decimal) || 0) * 60);
  const hours = Math.floor(total / 60);
  const minutes = Math.round((total % 60) / MINUTE_STEP) * MINUTE_STEP;
  return minutes === 60 ? { hours: hours + 1, minutes: 0 } : { hours, minutes };
}

function partsToDecimal(hours, minutes) {
  return Number((hours + minutes / 60).toFixed(2));
}

function formatParts(hours, minutes) {
  if (!hours && !minutes) return "nothing";
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function StepButton({ icon, onPress, muted, label }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      className="items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: muted ? "#ece7e1" : "#e7e5e4",
        backgroundColor: "white",
      }}
    >
      <Text style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: muted ? "#d6cec7" : "#8a5140" }}>{icon}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, onChange, max, step = 1 }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: "#ece7e1", borderRadius: 14, padding: 10, backgroundColor: "#faf8f6" }}>
      <View className="items-center">
        <SheetLabel>{label}</SheetLabel>
      </View>
      <View className="flex-row items-center justify-between">
        <StepButton icon="−" muted={value <= 0} onPress={() => onChange(Math.max(0, value - step))} label={`Fewer ${label.toLowerCase()}`} />
        <Text style={{ fontSize: 26, fontFamily: fonts.sansBold, color: "#2a211c" }}>{value}</Text>
        <StepButton icon="+" muted={value >= max} onPress={() => onChange(Math.min(max, value + step))} label={`More ${label.toLowerCase()}`} />
      </View>
    </View>
  );
}

export function HourMinuteStepperPopup({ visible, onClose, title, subtitle, initialDecimal, onSave }) {
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
    <PayrollBottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} maxHeight="70%">
      <View className="mb-3.5 flex-row" style={{ gap: 10 }}>
        <Stepper label="HOURS" value={hours} onChange={setHours} max={23} />
        <Stepper label="MINUTES" value={minutes} onChange={setMinutes} max={45} step={MINUTE_STEP} />
      </View>

      <View className="mb-3.5 flex-row" style={{ gap: 7 }}>
        {PRESETS.map((p) => {
          const active = p.hours === hours && p.minutes === minutes;
          return (
            <Pressable
              key={p.label}
              onPress={() => {
                setHours(p.hours);
                setMinutes(p.minutes);
              }}
              className="flex-1 items-center"
              style={{
                borderWidth: 1,
                borderColor: active ? "#ead9cd" : "#ece7e1",
                backgroundColor: active ? "#fdf6f2" : "white",
                borderRadius: 99,
                paddingVertical: 7,
              }}
            >
              <Text
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                style={{ fontSize: 11.5, fontFamily: fonts.sansSemiBold, color: active ? "#8a5140" : "#78716c" }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SheetSaveButton onPress={handleSave} disabled={saving} label={saving ? "Saving…" : `Save ${formatParts(hours, minutes)}`} />
    </PayrollBottomSheet>
  );
}
