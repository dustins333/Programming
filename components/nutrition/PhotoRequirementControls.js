import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { setPhotoFrequency, clearPhotoFrequency, requirePhotosNextCheckin, clearPhotosNextCheckin } from "../../lib/nutrition/photos";
import { todayInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

const FREQUENCIES = [
  { key: null, label: "Off" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Biweekly" },
  { key: "monthly", label: "Monthly" },
  { key: "bimonthly", label: "Bimonthly" },
];

// Recurring cadence (anchored to whenever it's set) plus a one-off "require
// pictures at the next check-in" flag — same two mechanisms the standalone
// app's PhotoRequirementControls exposes, minus its "upcoming weeks" popup
// (a nice-to-have preview, not load-bearing — the cadence/flag are what
// actually gate check-in submission, see lib/nutrition/photos.js's
// isPhotoRequirementWeek).
export function PhotoRequirementControls({ userId, client, onChanged }) {
  const [busy, setBusy] = useState(false);
  const flagged = !!client.photo_requirement_next_checkin;

  const handleFrequency = async (freq) => {
    setBusy(true);
    try {
      if (freq) await setPhotoFrequency(userId, freq, todayInBoise());
      else await clearPhotoFrequency(userId);
      await onChanged();
    } catch (err) {
      Alert.alert("Failed to update", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleFlag = async () => {
    setBusy(true);
    try {
      if (flagged) await clearPhotosNextCheckin(userId);
      else await requirePhotosNextCheckin(userId, todayInBoise());
      await onChanged();
    } catch (err) {
      Alert.alert("Failed to update", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text className="mb-1.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
        Recurring schedule
      </Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {FREQUENCIES.map((f) => {
          const active = (client.photo_frequency ?? null) === f.key;
          return (
            <Pressable
              key={f.label}
              onPress={() => handleFrequency(f.key)}
              disabled={busy}
              className="rounded-full border px-3 py-1.5"
              style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? colors.primary : "transparent" }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: active ? "white" : "#57534e" }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={toggleFlag} disabled={busy} className="self-start rounded px-3 py-1.5" style={{ backgroundColor: flagged ? "#e7e5e4" : colors.primary }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: flagged ? "#44403c" : "white" }}>
          {busy ? "Saving…" : flagged ? "✓ Required for next check-in — cancel" : "Require pictures at next check-in"}
        </Text>
      </Pressable>
    </View>
  );
}
