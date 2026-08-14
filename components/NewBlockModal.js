import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";
import { todayInBoise } from "../lib/boiseDate";
import { WeeksStepper } from "./WeeksStepper";

export function NewBlockModal({ visible, programs, onClose, onSubmit }) {
  const [groupProgramId, setGroupProgramId] = useState(null);
  const [startDate, setStartDate] = useState(todayInBoise());
  // Same copy-vs-blank choice NewSpcBlockChoiceModal already offers —
  // group blocks used to always be born empty, restarting every cycle's
  // programming from zero.
  const [copyFromLatest, setCopyFromLatest] = useState(true);
  // Seeded from the selected program's default but editable per block
  // (migration 0049) — a one-off longer cycle no longer means editing the
  // program's default and changing every future block along with it.
  const [lengthWeeks, setLengthWeeks] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProgram = (programs ?? []).find((p) => p.id === groupProgramId) ?? null;

  useEffect(() => {
    if (visible) {
      setGroupProgramId(programs?.[0]?.id ?? null);
      setStartDate(todayInBoise());
      setCopyFromLatest(true);
    }
  }, [visible, programs]);

  // Follows whichever program is selected, including a switch mid-dialog,
  // so the number on screen is always that program's own default until the
  // coach deliberately changes it.
  useEffect(() => {
    if (selectedProgram) setLengthWeeks(String(selectedProgram.block_length_weeks));
  }, [selectedProgram?.id, selectedProgram?.block_length_weeks]);

  const lengthValid = Number(lengthWeeks) >= 1;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ groupProgramId, startDate, copyFromLatest, lengthWeeks: Number(lengthWeeks) });
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

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Program
          </Text>
          <View className="mb-4 flex-row gap-2">
            {(programs ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setGroupProgramId(p.id)}
                className={`rounded-full border px-3.5 py-2.5 ${
                  groupProgramId === p.id ? "border-primary bg-primary" : "border-stone-300"
                }`}
              >
                <Text
                  className={groupProgramId === p.id ? "text-white" : "text-stone-700"}
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {p.name} ({p.block_length_weeks}wk)
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Start from
          </Text>
          <View className="mb-4 flex-row gap-2">
            {[
              { key: true, label: "Copy latest block" },
              { key: false, label: "Start blank" },
            ].map((opt) => (
              <Pressable
                key={String(opt.key)}
                onPress={() => setCopyFromLatest(opt.key)}
                className={`rounded-full border px-3.5 py-2.5 ${copyFromLatest === opt.key ? "border-primary bg-primary" : "border-stone-300"}`}
              >
                <Text className={copyFromLatest === opt.key ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Length
          </Text>
          <View className="mb-4">
            <WeeksStepper value={lengthWeeks} onChange={setLengthWeeks} />
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Start date (YYYY-MM-DD)
          </Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-07-20"
            className="mb-6 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !groupProgramId || !startDate || !lengthValid} style={{ opacity: saving || !groupProgramId || !startDate || !lengthValid ? 0.5 : 1 }}
              className="rounded-lg bg-primary px-4 py-3"
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
