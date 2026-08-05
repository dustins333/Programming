import { useEffect, useState, useCallback } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { updateClient } from "../../lib/nutrition/clients";
import { getClientQuestions, addClientQuestion, updateClientQuestion, deleteClientQuestion } from "../../lib/nutrition/checkin";
import { todayInBoise, addDays } from "../../lib/boiseDate";
import { SegmentedControl } from "../SegmentedControl";
import { QuestionListEditor } from "./QuestionListEditor";
import { CheckinWeekTimeline } from "./CheckinWeekTimeline";
import { fonts, colors } from "../../lib/theme";

// Collapsed-by-default section — click the header to expand, matching the
// "button that expands into the data" pattern used for both check-in
// questions and check-in status inside this modal.
function ExpandableSection({ title, badge, badgeColor, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-2">
      <Pressable onPress={() => setOpen((o) => !o)} className="flex-row items-center justify-between py-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            {title}
          </Text>
          {badge ? (
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: badgeColor === "warn" ? "#fdece5" : "#eef1e7" }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: badgeColor === "warn" ? "#b23a22" : "#4d6142" }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#a8a29e" />
      </Pressable>
      {open ? <View className="pb-2 pt-1">{children}</View> : null}
    </View>
  );
}

const STATUS_OPTIONS = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "archived", label: "Archived" },
];

const FREQUENCIES = [
  { key: "off", label: "Off" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Biweekly" },
  { key: "monthly", label: "Monthly" },
  { key: "bimonthly", label: "Bimonthly" },
];

// Ports the standalone app's EditClientModal (Name/Phone/Start date/Status/
// Progress photo frequency/"Starting the week of") plus embeds this client's
// own weekly check-in questions — Terra's explicit placement request rather
// than a separate page. "Starting the week of" maps to the DB column
// photo_frequency_started_at even though the field is labeled differently
// in the UI — same naming split the original app uses.
export function ClientSettingsModal({ visible, userId, coachId, client, checkins = [], reopens = [], photos = [], today, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState("active");
  const [frequency, setFrequency] = useState("off");
  const [frequencyStart, setFrequencyStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState([]);

  const loadQuestions = useCallback(async () => {
    if (!userId) return;
    try {
      setQuestions(await getClientQuestions(userId));
    } catch (err) {
      console.error("Failed to load check-in questions:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (!visible || !client) return;
    setName(client.name ?? "");
    setPhone(client.phone ?? "");
    setStartDate(client.start_date ?? "");
    setStatus(client.status ?? "active");
    setFrequency(client.photo_frequency ?? "off");
    setFrequencyStart(client.photo_frequency_started_at ?? "");
    loadQuestions();
  }, [visible, client, loadQuestions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const freqValue = frequency === "off" ? null : frequency;
      await updateClient(userId, {
        name: name.trim(),
        phone: phone.trim() || null,
        start_date: startDate,
        status,
        photo_frequency: freqValue,
        photo_frequency_started_at: freqValue ? frequencyStart : null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      Alert.alert("Failed to save", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const nextPosition = (list) => (list.length > 0 ? Math.max(...list.map((q) => q.position)) + 1 : 1);

  const handleAddQuestion = async (text) => {
    await addClientQuestion(userId, text, nextPosition(questions));
    await loadQuestions();
  };
  const handleUpdateQuestion = async (id, text) => {
    await updateClientQuestion(id, { question_text: text });
    await loadQuestions();
  };
  const handleDeleteQuestion = async (id) => {
    await deleteClientQuestion(id);
    await loadQuestions();
  };
  const handleMoveQuestion = async (a, b) => {
    await updateClientQuestion(a.id, { position: b.position });
    await updateClientQuestion(b.id, { position: a.position });
    await loadQuestions();
  };

  if (!client) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white" style={{ maxHeight: "85%" }}>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text className="mb-4 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
              {client.name} — Client Settings
            </Text>

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Name
            </Text>
            <TextInput value={name} onChangeText={setName} className="mb-4 rounded-lg border border-stone-300 px-4 py-3" style={{ fontFamily: fonts.sans }} />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Phone
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Start date
            </Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Status
            </Text>
            <View className="mb-4">
              <SegmentedControl segments={STATUS_OPTIONS} activeKey={status} onSelect={setStatus} />
            </View>

            <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Progress photo frequency
            </Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {FREQUENCIES.map((f) => {
                const active = frequency === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFrequency(f.key)}
                    className="rounded-full border px-3 py-1.5"
                    style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? colors.primary : "transparent" }}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: active ? "white" : "#57534e" }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {frequency !== "off" && (
              <View className="mb-5">
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Starting the week of
                </Text>
                <TextInput
                  value={frequencyStart}
                  onChangeText={setFrequencyStart}
                  placeholder="YYYY-MM-DD"
                  className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
                  style={{ fontFamily: fonts.sans }}
                />
                <View className="flex-row gap-4">
                  <Pressable onPress={() => setFrequencyStart(todayInBoise())}>
                    <Text className="text-xs underline" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                      This week
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setFrequencyStart(addDays(todayInBoise(), 7))}>
                    <Text className="text-xs underline" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                      Next week
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View className="my-4 h-px bg-stone-100" />

            <ExpandableSection
              title="Weekly check-in questions"
              badge={questions.length > 0 ? "Available to client" : "Not available yet"}
              badgeColor={questions.length > 0 ? "ok" : "warn"}
            >
              <QuestionListEditor
                description="This client's own copy — editing here doesn't affect the shared template or any other client."
                questions={questions}
                onAdd={handleAddQuestion}
                onUpdate={handleUpdateQuestion}
                onDelete={handleDeleteQuestion}
                onMove={handleMoveQuestion}
              />
            </ExpandableSection>

            <View className="my-2 h-px bg-stone-100" />

            <ExpandableSection title="Check-in status">
              {today ? (
                <CheckinWeekTimeline userId={userId} coachId={coachId} client={client} checkins={checkins} reopens={reopens} photos={photos} today={today} onChanged={onSaved} />
              ) : null}
            </ExpandableSection>
          </ScrollView>

          <View className="flex-row justify-end gap-3 border-t border-stone-100 p-4">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50">
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
