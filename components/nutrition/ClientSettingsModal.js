import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { toastError } from "../../lib/toast";
import { Ionicons } from "@expo/vector-icons";
import { updateClient } from "../../lib/nutrition/clients";
import { getClientQuestions, addClientQuestion, updateClientQuestion, deleteClientQuestion } from "../../lib/nutrition/checkin";
import { addDays } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { CADENCE_WEEKS } from "../../lib/nutrition/photos";
import { checkinMondayForWeek, weekStartForCheckinMonday, mondayOnOrAfter } from "../../lib/nutrition/weekCycle";
import { MondayPicker } from "./MondayPicker";
import { SegmentedControl } from "../SegmentedControl";
import { QuestionListEditor } from "./QuestionListEditor";
import { KeyboardDoneButton } from "../KeyboardDoneButton";
import { CheckinWeekTimeline } from "./CheckinWeekTimeline";
import { CoachAssignmentField } from "./CoachAssignmentField";
import { fonts, colors } from "../../lib/theme";
import { confirmRemoveQuestion } from "../../lib/confirmDialog";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../lib/scrollToKeyboard";

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

// Keys are the stored photo_frequency values and must not change; the
// labels spell out the real cadence, since "monthly" actually means every 4
// weeks here (CADENCE_WEEKS) and "biweekly"/"bimonthly" are ambiguous words
// for something the coach now picks off a calendar.
const FREQUENCIES = [
  { key: "off", label: "Off" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Every 4 weeks" },
  { key: "bimonthly", label: "Every 8 weeks" },
];

// Ports the standalone app's EditClientModal (Name/Phone/Start date/Status/
// Progress photo frequency/"Starting the week of") plus embeds this client's
// own weekly check-in questions — Terra's explicit placement request rather
// than a separate page. "Starting the week of" maps to the DB column
// photo_frequency_started_at even though the field is labeled differently
// in the UI — same naming split the original app uses.
export function ClientSettingsModal({ visible, userId, coachId, coaches = [], client, checkins = [], reopens = [], photos = [], today, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState("active");
  const [assignedCoachId, setAssignedCoachId] = useState(null);
  const [frequency, setFrequency] = useState("off");
  // Held as the CHECK-IN Monday the coach picks, converted to the stored
  // week-start (7 days earlier) only on save. See weekCycle.js.
  const [firstCheckinMonday, setFirstCheckinMonday] = useState(null);
  const [oneOffMonday, setOneOffMonday] = useState(null);
  const [pickingOneOff, setPickingOneOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState([]);

  // The Mondays this cadence will actually land on, dotted on the calendar
  // so the schedule is visible while picking rather than something the
  // coach has to work out in her head.
  const projectedMondays = useMemo(() => {
    if (frequency === "off" || !firstCheckinMonday) return [];
    const step = CADENCE_WEEKS[frequency] * 7;
    return Array.from({ length: 26 }, (_, i) => addDays(firstCheckinMonday, i * step));
  }, [frequency, firstCheckinMonday]);

  // A real dense form (Name/Phone/Start date/Status/Coach/Photo frequency/
  // Frequency start), plus an expandable check-in-question editor and
  // timeline below it, all inside a fixed maxHeight:"85%" Modal — no
  // automatic keyboard avoidance in this app, so a lower field can easily
  // end up with no room to scroll above the keyboard. No tabBarHeight
  // subtraction needed — a Modal presents above the tab bar entirely.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const nameFieldRef = useRef(null);
  const phoneFieldRef = useRef(null);
  const startDateFieldRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;

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
    setAssignedCoachId(client.coach_id ?? null);
    setFrequency(client.photo_frequency ?? "off");
    // Legacy anchors were typed free-text and are often not Mondays.
    // mondayOnOrAfter snaps FORWARD, which is behaviour-identical for the
    // requirement check (see weekCycle.js) — so showing the coach the real
    // first required check-in needs no data migration, and simply saving
    // from this picker normalizes the row.
    setFirstCheckinMonday(
      client.photo_frequency_started_at ? checkinMondayForWeek(mondayOnOrAfter(client.photo_frequency_started_at)) : null
    );
    setOneOffMonday(client.photo_requirement_next_checkin ? checkinMondayForWeek(client.photo_requirement_next_checkin) : null);
    setPickingOneOff(false);
    loadQuestions();
  }, [visible, client, loadQuestions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const freqValue = frequency === "off" || !firstCheckinMonday ? null : frequency;
      await updateClient(userId, {
        name: name.trim(),
        phone: phone.trim() || null,
        start_date: startDate,
        status,
        coach_id: assignedCoachId,
        photo_frequency: freqValue,
        // Stored as the week being checked in about, not the check-in Monday
        // the coach picked — everything downstream (isPhotoRequirementWeek,
        // checkin_responses.week_start) works in week-start terms.
        photo_frequency_started_at: freqValue ? weekStartForCheckinMonday(firstCheckinMonday) : null,
        photo_requirement_next_checkin: oneOffMonday ? weekStartForCheckinMonday(oneOffMonday) : null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const nextPosition = (list) => (list.length > 0 ? Math.max(...list.map((q) => q.position)) + 1 : 1);

  const handleAddQuestion = async (text) => {
    await addClientQuestion(userId, text, nextPosition(questions));
    await loadQuestions();
  };
  const handleUpdateQuestion = async (id, fields) => {
    await updateClientQuestion(id, fields);
    await loadQuestions();
  };
  const handleDeleteQuestion = async (id) => {
    const q = questions.find((row) => row.id === id);
    if (!(await confirmRemoveQuestion(q?.question_text ?? "this question"))) return;
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
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ padding: 24, paddingBottom: 24 + occludedHeight }}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <Text className="mb-4 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
              {client.name} — Client Settings
            </Text>

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Name
            </Text>
            <TextInput
              ref={nameFieldRef}
              value={name}
              onChangeText={setName}
              onFocus={() => scrollFieldIntoView(nameFieldRef.current)}
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Phone
            </Text>
            <TextInput
              ref={phoneFieldRef}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => scrollFieldIntoView(phoneFieldRef.current)}
              keyboardType="phone-pad"
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Start date
            </Text>
            <TextInput
              ref={startDateFieldRef}
              value={startDate}
              onChangeText={setStartDate}
              onFocus={() => scrollFieldIntoView(startDateFieldRef.current)}
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

            <View className="mb-4">
              <CoachAssignmentField value={assignedCoachId} coaches={coaches} onChange={setAssignedCoachId} />
            </View>

            <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Progress photos
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
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
                  First check-in photos are due
                </Text>
                <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Pick the Monday you want to see them. Only Mondays can be picked — that's the day a check-in comes in.
                </Text>
                <MondayPicker value={firstCheckinMonday} onChange={setFirstCheckinMonday} markedDates={projectedMondays} />
                {firstCheckinMonday ? (
                  <Text className="mt-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    Due on every dotted Monday after that. Next few:{" "}
                    {projectedMondays.slice(0, 3).map((d) => formatDateMDY(d)).join(", ")}
                  </Text>
                ) : null}
              </View>
            )}

            <View className="mb-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Extra one-off week
                </Text>
                <Pressable onPress={() => setPickingOneOff((v) => !v)} hitSlop={8}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    {pickingOneOff ? "Done" : oneOffMonday ? "Change" : "Pick a Monday"}
                  </Text>
                </Pressable>
              </View>
              <View className="mt-1 flex-row items-center gap-3">
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {oneOffMonday ? `Also due ${formatDateMDY(oneOffMonday)}` : "None"}
                </Text>
                {oneOffMonday ? (
                  <Pressable
                    onPress={() => {
                      setOneOffMonday(null);
                      setPickingOneOff(false);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs underline" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {pickingOneOff ? (
                <View className="mt-2">
                  <MondayPicker value={oneOffMonday} onChange={setOneOffMonday} />
                </View>
              ) : null}
            </View>

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
                choicesEnabled
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
      <KeyboardDoneButton />
    </Modal>
  );
}
