import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";
import { SessionDayPicker, resizeSessionDays } from "./SessionDayPicker";
import { DEFAULT_SESSION_DAYS } from "../lib/programming/schedule";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";

const DEFAULTS = { name: "", blockLengthWeeks: "4", sessionsPerWeek: "3", sessionDays: DEFAULT_SESSION_DAYS };

function fromProgram(program) {
  return {
    name: program.name,
    blockLengthWeeks: String(program.block_length_weeks),
    sessionsPerWeek: String(program.sessions_per_week),
    sessionDays: resizeSessionDays(program.session_days ?? DEFAULT_SESSION_DAYS, program.sessions_per_week),
  };
}

// Creates a brand-new group_programs row, or edits an existing one when
// `initialProgram` is passed — group_programs.name is no longer locked to
// Flagship/Better With Age (migration 0010), so a coach can spin up a
// specialty program (e.g. "Look Like You Lift", a shared conditioning
// program) that works exactly like Flagship/BWA: shared calendar, shared
// coach-authored content, clients opted in individually. sessionDays
// (migration 0011) is that program's own day-of-week map, since a
// specialty program can run at a different frequency/schedule than
// Flagship/BWA's Mon/Tue-Wed/Thu-Fri/Sat.
export function NewGroupProgramModal({ visible, initialProgram, onClose, onSubmit }) {
  const isEdit = !!initialProgram;
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setForm(initialProgram ? fromProgram(initialProgram) : DEFAULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialProgram]);

  const handleSessionsPerWeekChange = (v) => {
    const n = Number(v) || 0;
    setForm((f) => ({ ...f, sessionsPerWeek: v, sessionDays: resizeSessionDays(f.sessionDays, n) }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        blockLengthWeeks: Number(form.blockLengthWeeks) || 4,
        sessionsPerWeek: Number(form.sessionsPerWeek) || 3,
        sessionDays: form.sessionDays,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            {isEdit ? "Program settings" : "New group type"}
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            {isEdit
              ? "Changes only affect blocks created from now on — existing blocks keep the schedule they were created with."
              : "Works just like Flagship or BWA — a shared calendar and shared coach-authored sessions that any client can be enrolled into, in addition to their other programs."}
          </Text>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Name
          </Text>
          <TextInput
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Look Like You Lift"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Block length (weeks)
          </Text>
          <TextInput
            value={form.blockLengthWeeks}
            onChangeText={(v) => setForm((f) => ({ ...f, blockLengthWeeks: v }))}
            keyboardType="numeric"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Sessions per week
          </Text>
          <TextInput
            value={form.sessionsPerWeek}
            onChangeText={handleSessionsPerWeekChange}
            keyboardType="numeric"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />

          <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Which days is each session?
          </Text>
          <View className="mb-6">
            <SessionDayPicker
              sessionsPerWeek={Number(form.sessionsPerWeek) || 0}
              value={form.sessionDays}
              onChange={(sessionDays) => setForm((f) => ({ ...f, sessionDays }))}
            />
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create program"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
