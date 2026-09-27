import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { toastError } from "../../lib/toast";
import { updateClient } from "../../lib/nutrition/clients";
import { getClientQuestions, addClientQuestion, updateClientQuestion, deleteClientQuestion } from "../../lib/nutrition/checkin";
import { addDays, dateInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { CADENCE_WEEKS } from "../../lib/nutrition/photos";
import { checkinMondayForWeek, weekStartForCheckinMonday, mondayOnOrAfter, computeWeekWindows } from "../../lib/nutrition/weekCycle";
import { MondayPicker } from "../MondayPicker";
import { DateField } from "../DateField";
import { SegmentedControl } from "../SegmentedControl";
import { QuestionListEditor } from "./QuestionListEditor";
import { CheckinWeekTimeline, CheckinStatusStrip } from "./CheckinWeekTimeline";
import { CoachAssignmentField } from "./CoachAssignmentField";
import { confirmRemoveQuestion } from "../../lib/confirmDialog";
import { fonts, colors } from "../../lib/theme";

// The Settings tab (coach web v2, screen 25). Redesigned 2026-09-27:
//
// - Everything saves the moment it changes. There used to be a "Save
//   settings" button for the Client and Photo cards only, while the question
//   editor and the check-in actions below it already saved on their own, so
//   half the page needed a button and half didn't. A small "Saved" line in
//   the Client card header is the confirmation now.
// - The two long lists (check-in questions, check-in history) are folded
//   away by default, so the page is one screen tall until the coach
//   actually wants a list. Folded history still shows one dot per week.
// - The photo calendar only opens to change the start week; the rest of the
//   time the schedule reads as a sentence plus its next few due dates.
//
// The Client card is deliberately just start date / assigned coach / status.
// Name and phone were editable here originally and were pulled per direct
// ask — a client's name comes in from the GHL import and isn't something a
// coach edits from the nutrition record.

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

const CARD_STYLE = {
  borderWidth: 1,
  borderColor: "#ece7e1",
  backgroundColor: "white",
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 1,
};

function IconBubble({ name }) {
  return (
    <View className="items-center justify-center" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#fdf6f2" }}>
      <Ionicons name={name} size={16} color={colors.primaryOnWhite} />
    </View>
  );
}

function CardHeader({ icon, title, subtitle, right }) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <IconBubble name={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function Card({ icon, title, subtitle, right, children, style }) {
  return (
    <View className="rounded-2xl p-5" style={[CARD_STYLE, style]}>
      <CardHeader icon={icon} title={title} subtitle={subtitle} right={right} />
      <View className="mt-4">{children}</View>
    </View>
  );
}

// A card that stays folded to its header until asked. `summary` is what the
// header shows in place of the list, so folded still answers something.
function CollapsibleCard({ icon, title, subtitle, summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="rounded-2xl" style={CARD_STYLE}>
      <Pressable onPress={() => setOpen((v) => !v)} className="p-5">
        <CardHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          right={
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primaryOnWhite }}>{open ? "Hide" : "Show"}</Text>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.primaryOnWhite} />
            </View>
          }
        />
        {!open && summary ? <View className="mt-4" style={{ paddingLeft: 44 }}>{summary}</View> : null}
      </Pressable>
      {open ? (
        <View className="px-5 pb-5">
          <View className="mb-4" style={{ height: 1, backgroundColor: "#f1ede8" }} />
          {children}
        </View>
      ) : null}
    </View>
  );
}

// One labelled setting inside a card, with a hairline between neighbours.
function SettingRow({ label, children, last }) {
  return (
    <View className="py-3" style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: "#f1ede8" }}>
      <Text className="mb-2" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function SaveIndicator({ state }) {
  if (state === "idle") return null;
  const saving = state === "saving";
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      {saving ? null : <Ionicons name="checkmark" size={13} color="#4d6142" />}
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: saving ? "#a8a29e" : "#4d6142" }}>{saving ? "Saving…" : "Saved"}</Text>
    </View>
  );
}

export function ClientSettingsPanel({
  userId,
  coachId,
  coaches = [],
  client,
  checkins = [],
  reopens = [],
  closeouts = [],
  photos = [],
  today,
  isWide,
  questionnaireSubmittedAt = null,
  onSaved,
  onClientPatched,
}) {
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
  const [pickingStart, setPickingStart] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [questions, setQuestions] = useState([]);

  const projectedMondays = useMemo(() => {
    if (frequency === "off" || !firstCheckinMonday) return [];
    const step = CADENCE_WEEKS[frequency] * 7;
    return Array.from({ length: 26 }, (_, i) => addDays(firstCheckinMonday, i * step));
  }, [frequency, firstCheckinMonday]);

  const loadQuestions = useCallback(async () => {
    try {
      setQuestions(await getClientQuestions(userId));
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
  }, [client]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // Every control saves its own field(s) straight away. The parent's client
  // is patched rather than reloaded, so the header badge and the other tabs
  // agree immediately without a full-page refetch. On failure the full
  // reload puts every control back to what's actually stored.
  const saveFields = async (fields) => {
    setSaveState("saving");
    try {
      await updateClient(userId, fields);
      onClientPatched?.(fields);
      setSaveState("saved");
    } catch (err) {
      toastError("Couldn't save", err);
      setSaveState("idle");
      await onSaved();
    }
  };

  const handleStartDate = (value) => {
    setStartDate(value);
    saveFields({ start_date: value });
  };
  const handleCoach = (value) => {
    setAssignedCoachId(value);
    saveFields({ coach_id: value });
  };
  const handleStatus = (value) => {
    if (value === status) return;
    setStatus(value);
    saveFields({ status: value });
  };

  // Stored as the week being checked in about, not the check-in Monday the
  // coach picked — everything downstream (isPhotoRequirementWeek,
  // checkin_responses.week_start) works in week-start terms.
  const saveSchedule = (freq, monday) =>
    saveFields({
      photo_frequency: freq === "off" ? null : freq,
      photo_frequency_started_at: freq === "off" ? null : weekStartForCheckinMonday(monday),
    });

  const handleFrequency = (key) => {
    if (key === frequency) return;
    setFrequency(key);
    if (key === "off") {
      setPickingStart(false);
      saveSchedule("off", null);
      return;
    }
    // Turning a cadence on needs a start week to mean anything. Default to
    // her next check-in, so it's live straight away; the calendar is one tap
    // away if it should start later.
    const monday = firstCheckinMonday ?? checkinMondayForWeek(computeWeekWindows(today).currentWeek.start);
    setFirstCheckinMonday(monday);
    saveSchedule(key, monday);
  };

  const handleStartMonday = (monday) => {
    setFirstCheckinMonday(monday);
    saveSchedule(frequency, monday);
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

  // A one-off week set from the Check-In tab that hasn't been used up yet:
  // not in the past, and not already filed.
  const flagged = client.photo_requirement_next_checkin;
  const oneOffWeek =
    flagged && today && flagged >= computeWeekWindows(today).currentWeek.start && !checkins.some((c) => c.week_start === flagged)
      ? flagged
      : null;

  const upcomingDue = today ? projectedMondays.filter((d) => d >= today).slice(0, 4) : [];
  const cadenceLabel = FREQUENCIES.find((f) => f.key === frequency)?.label ?? "";

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 18, alignItems: isWide ? "flex-start" : "stretch" }}>
        {/* NOT `flex: 0` — react-native-web compiles that to `flex: 0 1 0%`,
            and the 0% basis collapses the explicit width to nothing. Spell
            out grow and shrink instead. */}
        <Card
          icon="person-outline"
          title="Client"
          right={<SaveIndicator state={saveState} />}
          style={isWide ? { flexGrow: 0, flexShrink: 0, width: 340 } : undefined}
        >
          <SettingRow label="Start date">
            <DateField value={startDate || null} onChange={handleStartDate} minDate="2000-01-01" maxWidth={240} />
          </SettingRow>
          <SettingRow label="Assigned coach">
            <CoachAssignmentField value={assignedCoachId} coaches={coaches} onChange={handleCoach} label={null} />
          </SettingRow>
          <SettingRow label="Status">
            <SegmentedControl segments={STATUS_OPTIONS} activeKey={status} onSelect={handleStatus} dense />
          </SettingRow>
          {/* The onboarding questionnaire is answered once and then kept
              forever, but the only screen that renders it hangs off the
              Onboarding tab — which disappears the moment a client is
              approved. That left every active client's answers stored and
              unreachable (13 of 14 real clients, 2026-08-17). This is the
              permanent way back to them, deliberately here rather than on
              Onboarding, since Settings is the one tab that never goes
              away. No extra fetch: the parent already loads the response. */}
          <SettingRow label="Original questionnaire" last>
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
                      in the Boise evening. */}
                  <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                    Submitted {formatDateMDY(dateInBoise(new Date(questionnaireSubmittedAt)))}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.primaryOnWhite} />
              </Pressable>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>Never submitted.</Text>
            )}
          </SettingRow>
        </Card>

        {/* The right column holds everything else, so the two long lists
            fold up beside the Client card instead of trailing below it. */}
        <View style={isWide ? { flex: 1, minWidth: 0, gap: 18 } : { gap: 18 }}>
          <Card
            icon="camera-outline"
            title="Progress photo schedule"
            subtitle={frequency === "off" ? "Not on a schedule" : `${cadenceLabel}, starting with the ${formatDateMDY(firstCheckinMonday)} check-in`}
          >
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {FREQUENCIES.map((f) => {
                const active = frequency === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => handleFrequency(f.key)}
                    className="rounded-full px-4 py-2"
                    style={{ borderWidth: 1, borderColor: active ? "#2a211c" : "#ddd6cd", backgroundColor: active ? "#2a211c" : "white" }}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: active ? "white" : "#57534e" }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {frequency === "off" ? (
              // Off says nothing, unless a one-off week is pending from the
              // Check-In tab's Require pics, which would otherwise be
              // invisible from here.
              oneOffWeek ? (
                <View className="mt-5 flex-row items-center rounded-xl px-4 py-3.5" style={{ gap: 10, backgroundColor: "#f3f6ef" }}>
                  <Ionicons name="camera" size={16} color="#4d6142" />
                  <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#4d6142" }}>
                    Pics required on the {formatDateMDY(checkinMondayForWeek(oneOffWeek))} check-in
                  </Text>
                </View>
              ) : null
            ) : (
              <View className="mt-5">
                <Text className="mb-2" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Photos due
                </Text>
                <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  {upcomingDue.map((d, i) => (
                    <View
                      key={d}
                      className="flex-row items-center rounded-lg px-3 py-2"
                      style={{ gap: 6, backgroundColor: i === 0 ? "#f3f6ef" : colors.canvas, borderWidth: 1, borderColor: i === 0 ? "#cfdac6" : "#ece7e1" }}
                    >
                      <Ionicons name="camera" size={12} color={i === 0 ? "#4d6142" : "#a8a29e"} />
                      <Text style={{ fontFamily: i === 0 ? fonts.sansSemiBold : fonts.sans, fontSize: 12.5, color: i === 0 ? "#4d6142" : "#57534e" }}>
                        {formatDateMDY(d)}
                      </Text>
                      {i === 0 ? <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#4d6142" }}>next</Text> : null}
                    </View>
                  ))}
                </View>

                <Pressable onPress={() => setPickingStart((v) => !v)} className="mt-4 flex-row items-center self-start" style={{ gap: 5 }} hitSlop={6}>
                  <Ionicons name="calendar-outline" size={14} color={colors.primaryOnWhite} />
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                    {pickingStart ? "Done" : "Change start week"}
                  </Text>
                </Pressable>

                {pickingStart ? (
                  <View className="mt-3">
                    <MondayPicker value={firstCheckinMonday} onChange={handleStartMonday} markedDates={projectedMondays} />
                    <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 12 }}>
                      <View className="flex-row items-center" style={{ gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>First check-in</Text>
                      </View>
                      <View className="flex-row items-center" style={{ gap: 5 }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#4d6142" }} />
                        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>Photos due</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </Card>

          <CollapsibleCard
            icon="chatbubble-ellipses-outline"
            title="Check-in questions"
          >
            <QuestionListEditor
              questions={questions}
              onAdd={handleAddQuestion}
              onUpdate={handleUpdateQuestion}
              onDelete={handleDeleteQuestion}
              onMove={handleMoveQuestion}
              choicesEnabled
              bookingEnabled
            />
          </CollapsibleCard>

          {today ? (
            <CollapsibleCard
              icon="calendar-outline"
              title="Check-in history"
              summary={<CheckinStatusStrip client={client} checkins={checkins} reopens={reopens} closeouts={closeouts} today={today} />}
            >
              <CheckinWeekTimeline
                userId={userId}
                coachId={coachId}
                client={client}
                checkins={checkins}
                reopens={reopens}
                closeouts={closeouts}
                photos={photos}
                today={today}
                onChanged={onSaved}
              />
            </CollapsibleCard>
          ) : null}
        </View>
      </View>
    </View>
  );
}
