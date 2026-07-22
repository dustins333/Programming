import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";
import { todayInBoise } from "../../../lib/boiseDate";
import { fonts } from "../../../lib/theme";

export function NewSpcBlockModal({ visible, defaultLengthWeeks, onClose, onSubmit }) {
  const [startDate, setStartDate] = useState(todayInBoise());
  const [lengthWeeks, setLengthWeeks] = useState(String(defaultLengthWeeks ?? 4));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setStartDate(todayInBoise());
      setLengthWeeks(String(defaultLengthWeeks ?? 4));
    }
  }, [visible, defaultLengthWeeks]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ startDate, lengthWeeks: Number(lengthWeeks) || 4 });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="mb-4 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            New SPC block
          </Text>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Start date (YYYY-MM-DD)
          </Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-07-20"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Block length (weeks)
          </Text>
          <TextInput
            value={lengthWeeks}
            onChangeText={setLengthWeeks}
            keyboardType="numeric"
            className="mb-6 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !startDate || !lengthWeeks}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Creating…" : "Create block"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
