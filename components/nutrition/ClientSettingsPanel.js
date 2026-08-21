import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { toastError, toastSuccess } from "../../lib/toast";
import { updateClient } from "../../lib/nutrition/clients";
import { getClientQuestions, addClientQuestion, updateClientQuestion, deleteClientQuestion, listTemplateQuestions } from "../../lib/nutrition/checkin";
import { addDays, dateInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { CADENCE_WEEKS } from "../../lib/nutrition/photos";
import { checkinMondayForWeek, weekStartForCheckinMonday, mondayOnOrAfter } from "../../lib/nutrition/weekCycle";
import { MondayPicker } from "../MondayPicker";
import { SegmentedControl } from "../SegmentedControl";
import { QuestionListEditor } from "./QuestionListEditor";
import { CheckinWeekTimeline } from "./CheckinWeekTimeline";
import { CoachAssignmentField } from "./CoachAssignmentField";
import { confirmRemoveQuestion } from "../../lib/confirmDialog";
import { fonts, colors } from "../../lib/theme";

// The Settings tab (coach web v2, screen 25) — off the gear icon, onto a
// tab. Replaces ClientSettingsModal outright: the same fields, but a
// three-card page instead of a scrolling dialog. The modal had to cram a
// dense form, a question editor and a check-in timeline into a fixed 85%
// viewport height, which is why both of the latter two were collapsed
// behind expanders by default.
//
// The Client card is deliberately just start date / assigned coach / status.
// Name and phone were editable here originally and were pulled per direct
// ask — a client's name comes in from the GHL import and isn't something a
// coach edits from the nutrition record. Neither is written by handleSave
// any more, so both columns are simply left alone.

const STATUS_OPTIONS = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "archived", label: "Archived" },
];

// Keys are the stored photo_frequency values and must not change; the labels
// spell out the real cadence, since "monthly" means every 4 weeks here
// (CADENCE_WEEKS) and "biweekly"/"bimonthly" are ambiguous words for
// something the coach now picks off a calendar.
const FREQUENCIES = [
  { key: "off", label: "Off" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Every 4 weeks" },
  { key: "bimonthly", label: "Every 8 weeks" },
];

function Card({ title, children, style }) {
  return (
    <View
      className="rounded-2xl p-5"
      style={[
        {
          borderWidth: 1,
          borderColor: "#ece7e1",
          backgroundColor: "white",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 1,
        },
        style,
      ]}
    >
      <Text
        className="mb-4"
        style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: "#ddd6cd",
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontFamily: fonts.sans,
  fontSize: 14,
  backgroundColor: "white",
};

export function ClientSettingsPanel({ userId, coachId, coaches = [], client, checkins = [], reopens = [], photos = [], today, isWide, questionnaireSubmittedAt = null, onSaved }) {
  const [startDate, setStartDate] = useState(client.start_date ?? "");
  const [status, setStatus] = useState(client.status ?? "active");
  const [assignedCoachId, setAssignedCoachId] = useState(client.coach_id ?? null);
  const [frequency, setFrequency] = useState(client.photo_frequency ?? "off");
  // Held as the CHECK-IN Monday the coach picks, converted to the stored
  // week-start (7 days earlier) only on save. See weekCycle.js.
  // Seeded synchronously from the client, not in the effect below.
  // MondayPicker reads its opening month from `value` on its FIRST render
  // only — a value that arrives one tick later left the calendar parked on
  // today with the real selection seven months out of view.
  const [firstCheckinMonday, setFirstCheckinMonday] = useState(() =>
    client.photo_frequency_started_at ? checkinMondayForWeek(mondayOnOrAfter(client.photo_frequency_started_at)) : null
  );
  const [oneOffMonday, setOneOffMonday] = useState(() =>
    client.photo_requirement_next_checkin ? checkinMondayForWeek(client.photo_requirement_next_checkin) : null
  );
  const [pickingOneOff, setPickingOneOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [templateQuestions, setTemplateQuestions] = useState(null);

  const projectedMondays = useMemo(() => {
    if (frequency === "off" || !firstCheckinMonday) return [];
    const step = CADENCE_WEEKS[frequency] * 7;
    return Array.from({ length: 26 }, (_, i) => addDays(firstCheckinMonday, i * step));
  }, [frequency, firstCheckinMonday]);

  const loadQuestions = useCallback(async () => {
    try {
      const [own, template] = await Promise.all([getClientQuestions(userId), listTemplateQuestions()]);
      setQuestions(own);
      setTemplateQuestions(template);
    } catch (err) {
      console.error("Failed to load check-in questions:", err);
    }
  }, [userId]);

  useEffect(() => {
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
  }, [client]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const freqValue = frequency === "off" || !firstCheckinMonday ? null : frequency;
      await updateClient(userId, {
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
      toastSuccess("Client settings saved");
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

  // Which of her questions came from the gym template vs. were written for
  // custom to this client — the same split the Check-In tab badges as CUSTOM, matched
  // on question text since a client's copy is physical, not a live join
  // (copyTemplateToClient).
  const templateTexts = useMemo(
    () => (templateQuestions ? new Set(templateQuestions.map((q) => q.question_text.trim().toLowerCase())) : null),
    [templateQuestions]
  );
  const customCount = templateTexts
    ? questions.filter((q) => !templateTexts.has((q.question_text ?? "").trim().toLowerCase())).length
    : 0;

  const nextCheckinMonday = projectedMondays.find((d) => d >= today) ?? null;

  return (
    <View>
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 18 }}>
        {/* NOT `flex: 0` — react-native-web compiles that to `flex: 0 1 0%`,
            and the 0% basis collapses the explicit width to nothing. This
            card rendered as a sliver with every label stacked one letter per
            line. Same trap the member v5 pass documented; spell out grow and
            shrink instead. */}
        <Card title="Client" style={isWide ? { flexGrow: 0, flexShrink: 0, width: 320 } : undefined}>
          <Field label="Start date">
            <TextInput value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor="#c9c4bd" style={inputStyle} />
          </Field>
          <Field label="Assigned coach">
            {/* The Field wrapper already supplies the label. */}
            <CoachAssignmentField value={assignedCoachId} coaches={coaches} onChange={setAssignedCoachId} label={null} />
          </Field>
          <Field label="Status">
            <SegmentedControl segments={STATUS_OPTIONS} activeKey={status} onSelect={setStatus} />
          </Field>

          {/* The onboarding questionnaire is answered once and then kept
              forever, but the only screen that renders it hangs off the
              Onboarding tab — which disappears the moment a client is
              approved. That left every active client's answers stored and
              unreachable (13 of 14 real clients, 2026-08-17). This is the
              permanent way back to them, deliberately here rather than on
              Onboarding, since Settings is the one tab that never goes
              away. No extra fetch: the parent already loads the response. */}
          <Field label="Original questionnaire">
            {questionnaireSubmittedAt ? (
              <Pressable
                onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/questionnaire`)}
                className="flex-row items-center justify-between rounded-lg px-3.5 py-3"
                style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white" }}
              >
                <View>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>View answers</Text>
                  {/* dateInBoise, never .slice(0, 10) — submitted_at is a
                      timestamptz, and slicing the ISO string reads the UTC
                      date, which is already tomorrow for anything submitted
                      in the Boise evening. Abbi Stauffer's real row is
                      exactly that case (01:29Z = 19:29 the previous day). */}
                  <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                    Submitted {formatDateMDY(dateInBoise(new Date(questionnaireSubmittedAt)))}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.primaryOnWhite }}>›</Text>
              </Pressable>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                Never submitted.
              </Text>
            )}
          </Field>
        </Card>

        <Card title="Check-in & photo schedule" style={{ flex: 1 }}>
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 20 }}>
            <View style={{ flex: 1 }}>
              <Field label="Progress photo frequency">
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {FREQUENCIES.map((f) => {
                    const active = frequency === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setFrequency(f.key)}
                        className="rounded-lg px-3.5 py-2"
                        style={{ borderWidth: 1, borderColor: active ? "#2a211c" : "#ddd6cd", backgroundColor: active ? "#2a211c" : "white" }}
                      >
                        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: active ? "white" : "#57534e" }}>{f.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              {frequency !== "off" ? (
                <>
                  <Field label="Starting the week of">
                    <View className="rounded-lg px-3.5 py-3" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: colors.canvas }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: firstCheckinMonday ? "#2a211c" : "#a8a29e" }}>
                        {firstCheckinMonday ? formatDateMDY(firstCheckinMonday) : "Pick a Monday on the calendar →"}
                      </Text>
                    </View>
                    <Text className="mt-2" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                      Dotted Mondays on the calendar are the weeks photos will actually land on, so the cadence is visible while you pick it.
                    </Text>
                  </Field>

                  <Pressable
                    onPress={() => setPickingOneOff((v) => !v)}
                    className="items-center rounded-lg py-3"
                    style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white" }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>
                      {pickingOneOff ? "Done picking" : oneOffMonday ? `Extra week: ${formatDateMDY(oneOffMonday)}` : "+ Add a one-off check-in week"}
                    </Text>
                  </Pressable>
                  {oneOffMonday ? (
                    <Pressable onPress={() => { setOneOffMonday(null); setPickingOneOff(false); }} className="mt-2 self-center" hitSlop={8}>
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#b23a22" }}>Clear the extra week</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                  No progress photos are required on any cadence.
                </Text>
              )}
            </View>

            {frequency !== "off" ? (
              <View>
                {nextCheckinMonday ? (
                  <Text className="mb-2" style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>
                    Next photos due {formatDateMDY(nextCheckinMonday)}
                  </Text>
                ) : null}
                <MondayPicker
                  value={pickingOneOff ? oneOffMonday : firstCheckinMonday}
                  onChange={pickingOneOff ? setOneOffMonday : setFirstCheckinMonday}
                  markedDates={pickingOneOff ? projectedMondays : projectedMondays}
                />
                <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 12 }}>
                  <View className="flex-row items-center" style={{ gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
                      {pickingOneOff ? "Extra week" : "First check-in"}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 5 }}>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#4d6142" }} />
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>Photos due</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </Card>
      </View>

      <View className="mt-4 flex-row justify-end" style={{ gap: 10 }}>
        <Pressable onPress={handleSave} disabled={saving} className="rounded-lg px-5 py-3" style={{ backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }}>
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {saving ? "Saving…" : "Save settings"}
          </Text>
        </Pressable>
      </View>

      <View className="mt-4">
        <Card title="Check-in questions">
          <Text className="mb-3" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
            {templateTexts === null
              ? "This client's own copy — editing here doesn't affect the shared template or any other client."
              : `${questions.length - customCount} come from the gym template in Settings. ${customCount === 0 ? "None are" : customCount === 1 ? "One is" : `${customCount} are`} custom to this client. Editing here doesn't affect the template or any other client.`}
          </Text>
          <QuestionListEditor
            questions={questions}
            onAdd={handleAddQuestion}
            onUpdate={handleUpdateQuestion}
            onDelete={handleDeleteQuestion}
            onMove={handleMoveQuestion}
            choicesEnabled
          />
        </Card>
      </View>

      <View className="mt-4">
        <Card title="Check-in status">
          {today ? (
            <CheckinWeekTimeline
              userId={userId}
              coachId={coachId}
              client={client}
              checkins={checkins}
              reopens={reopens}
              photos={photos}
              today={today}
              onChanged={onSaved}
            />
          ) : null}
        </Card>
      </View>
    </View>
  );
}
