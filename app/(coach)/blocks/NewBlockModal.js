import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function NewBlockModal({ visible, programs, onClose, onSubmit }) {
  const [groupProgramId, setGroupProgramId] = useState(null);
  const [startDate, setStartDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setGroupProgramId(programs?.[0]?.id ?? null);
      setStartDate(todayISO());
    }
  }, [visible, programs]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ groupProgramId, startDate });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <Text className="mb-4 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            New block
          </Text>

          <Text className="mb-1 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Program
          </Text>
          <View className="mb-4 flex-row gap-2">
            {(programs ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setGroupProgramId(p.id)}
                className={`rounded-full border px-3 py-1.5 ${
                  groupProgramId === p.id ? "border-primary bg-primary" : "border-neutral-300"
                }`}
              >
                <Text
                  className={groupProgramId === p.id ? "text-white" : "text-neutral-700"}
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {p.name} ({p.block_length_weeks}wk)
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Start date (YYYY-MM-DD)
          </Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-07-20"
            className="mb-6 rounded-lg border border-neutral-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-neutral-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !groupProgramId || !startDate}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {saving ? "Creating…" : "Create block"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
