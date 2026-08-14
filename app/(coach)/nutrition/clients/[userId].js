import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../../lib/boiseDate";
import { getClient, sendOnboardingToClient } from "../../../../lib/nutrition/clients";
import { listCoaches } from "../../../../lib/programming/clients";
import { getSpcClient, isSpcActive } from "../../../../lib/programming/spcClients";
import { listTargets, diffTargets } from "../../../../lib/nutrition/targets";
import { listLogs } from "../../../../lib/nutrition/dailyLog";
import {
  getCheckinForWeek,
  finalizeCheckin,
  listCheckinsSince,
  listCheckinReopensSince,
  listTemplateQuestions,
} from "../../../../lib/nutrition/checkin";
import { listFocusItems, setCheckinHighlights } from "../../../../lib/nutrition/coachClient";
import { listActiveMilestones } from "../../../../lib/nutrition/milestones";
import { getOnboardingStatus, bypassOnboarding, listObjectiveTrackingLogs } from "../../../../lib/nutrition/onboarding";
import { listPhases } from "../../../../lib/nutrition/planPhases";
import { computeWeekWindows, currentCalendarWeek, summarizeWeek, deriveCheckinStatus, enumerateRecentWeeks } from "../../../../lib/nutrition/weekCycle";
import { weekOnProgram, weekDates } from "../../../../lib/nutrition/queue";
import { listAllPhotos, photosForRequirementWeek } from "../../../../lib/nutrition/photos";

import { WeekRows } from "../../../../components/nutrition/WeekRows";
import { PlanPhases } from "../../../../components/nutrition/PlanPhases";
import { MilestoneSlots } from "../../../../components/nutrition/MilestoneSlots";
import { TargetsEditor } from "../../../../components/nutrition/TargetsEditor";
import { TargetHistoryTable } from "../../../../components/nutrition/TargetHistoryTable";
import { ObjectiveTrackingHistory } from "../../../../components/nutrition/ObjectiveTrackingHistory";
import { PhotoCompareRail } from "../../../../components/nutrition/PhotoCompareRail";
import { ManagePhotosModal } from "../../../../components/nutrition/ManagePhotosModal";
import { ClientSettingsPanel } from "../../../../components/nutrition/ClientSettingsPanel";
import { NutritionDashboardTab } from "../../../../components/nutrition/NutritionDashboardTab";
import { NutritionCheckinTab } from "../../../../components/nutrition/NutritionCheckinTab";
import { NutritionOnboardingTab } from "../../../../components/nutrition/NutritionOnboardingTab";
import { CoachMessageBubble } from "../../../../components/CoachMessageBubble";
import { CoachShell } from "../../../../components/CoachShell";
import { formatDateMDY } from "../../../../lib/formatDate";
import { confirmBypassOnboarding, confirmSendToClient } from "../../../../lib/confirmDialog";
import { toastError } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";

const isWeb = Platform.OS === "web";
// Two-column rails need real width or they read as two cramped columns; below
// this everything stacks. Same breakpoint the client detail page in
// programming uses for its four cards.
const WIDE_BREAKPOINT = 1100;

const PHASE_LABELS = {
  questionnaire: "the questionnaire",
  tracking: "objective tracking",
  photos: "starting photos",
};

const WEEKS_SHOWN = 8;
const TIMELINE_PAST_WEEKS = 6;

// Joins a list into readable prose ("a, b and c") rather than a bare comma
// list, since this lands in a confirm dialog the coach actually reads.
function joinPhrases(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// The close-out confirm names only what's genuinely still missing. The old
// copy was hardcoded to "without completing the questionnaire, tracking, or
// photos", which read as though the coach were discarding all three — wrong
// and alarming for the common case where a client finished two of them and
// stalled on one. Nothing is actually discarded either way —
// bypassOnboarding only stamps the approval and seeds check-in questions.
export function buildCloseOutMessage(name, phases) {
  const who = name || "This client";
  const done = Object.keys(PHASE_LABELS).filter((k) => phases?.[k]).map((k) => PHASE_LABELS[k]);
  const missing = Object.keys(PHASE_LABELS).filter((k) => !phases?.[k]).map((k) => PHASE_LABELS[k]);

  if (missing.length === 0) {
    return `${who} has finished every onboarding step. You'll set their target on the next screen.`;
  }
  if (done.length === 0) {
    return `${who} will be approved without ${joinPhrases(missing)}. You'll set their target on the next screen.`;
  }
  return `${who} has completed ${joinPhrases(done)}. They will be approved without ${joinPhrases(missing)}, and anything already submitted is kept. You'll set their target on the next screen.`;
}

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({ title, headerRight, children, style }) {
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
      {title ? (
        <View className="mb-3 flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Text>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6" style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
      <View className="flex-row">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              className="mr-7 pb-3"
              style={isActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : undefined}
            >
              <Text style={{ fontFamily: isActive ? fonts.sansSemiBold : fonts.sansMedium, fontSize: 14, color: isActive ? colors.primaryOnWhite : "#8a8279" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const STATUS_PILL = {
  needsTarget: { label: "Needs target", bg: "#f4ede3", text: "#8a5a2e" },
  pending: { label: "Awaiting her check-in", bg: "#fdece5", text: "#b23a22" },
  ready: { label: "Awaiting coach check-in", bg: "#f4ede3", text: "#8a5a2e" },
  completed: { label: "Check-in completed", bg: "#eef1e7", text: "#4d6142" },
  paused: { label: "Paused", bg: "#f1efed", text: "#78716c" },
  onboarding: { label: "Onboarding", bg: "#f4ede3", text: "#8a5a2e" },
};

export default function NutritionClientDetail() {
  const { userId, tab: tabParam } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const today = todayInBoise();

  // Deep-linked from the queue preview's "Read the full form" / "Compare"
  // links. Applied once per distinct param value rather than every render,
  // so a coach who then clicks another tab isn't yanked back to this one —
  // the same applied-param-ref idiom the member plan screen uses.
  // null = the coach hasn't picked a tab yet, so the default can depend on
  // data that isn't loaded at useState time (an onboarding client has to land
  // on Onboarding, and whether she's onboarding isn't known for another tick).
  const [tab, setTab] = useState(typeof tabParam === "string" && tabParam ? tabParam : null);
  const appliedTabParamRef = useRef(typeof tabParam === "string" ? tabParam : "");
  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [targets, setTargets] = useState(null);
  const [logs, setLogs] = useState(null);
  const [focusItems, setFocusItems] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [phases, setPhases] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekPaging, setWeekPaging] = useState(false);
  const [checkin, setCheckin] = useState(null);
  const [priorCheckin, setPriorCheckin] = useState(null);
  const [currentCheckin, setCurrentCheckin] = useState(null);
  const [templateQuestions, setTemplateQuestions] = useState(null);
  const [spcClient, setSpcClient] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [checkinReopens, setCheckinReopens] = useState([]);
  const [otLogs, setOtLogs] = useState([]);
  const [bypassing, setBypassing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [managingPhotos, setManagingPhotos] = useState(false);

  const isWide = isWeb && width >= WIDE_BREAKPOINT;

  const selectedWeek = useMemo(() => {
    const { currentWeek } = computeWeekWindows(today);
    const end = addDays(currentWeek.end, -7 * weekOffset);
    const start = addDays(end, -6);
    return { start, end };
  }, [today, weekOffset]);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      // Core fetches only — the rows that gate rendering (client/targets/
      // logs/onboarding) or drive real actions (checkin → Finalize). The
      // display-only fetches below are isolated via allSettled so one
      // domain's failure doesn't blank the whole page.
      const { currentWeek } = computeWeekWindows(today);
      const [clientRow, coachRows, targetRows, logRows, checkinRow, onboardingStatus] = await Promise.all([
        getClient(userId),
        listCoaches(),
        listTargets(userId),
        listLogs(userId, { limit: 400 }),
        getCheckinForWeek(userId, selectedWeek.start),
        getOnboardingStatus(userId),
      ]);
      setClient(clientRow);
      setCoaches(coachRows);
      setTargets(targetRows);
      setLogs(logRows);
      setCheckin(checkinRow);
      setOnboarding(onboardingStatus);

      const [focusResult, photosResult, checkinsResult, otLogsResult, priorResult, currentResult, templateResult, spcResult] =
        await Promise.allSettled([
          listFocusItems(userId),
          listAllPhotos(userId),
          listCheckinsSince(userId, addDays(today, -7 * TIMELINE_PAST_WEEKS)),
          listObjectiveTrackingLogs(userId),
          // Last week's submission, for the "last week — …" line under every
          // answer on the Check-In tab.
          getCheckinForWeek(userId, addDays(selectedWeek.start, -7)),
          // The status pill has to describe where she IS, not whichever past
          // week the coach happens to be paging through on the Check-In tab.
          getCheckinForWeek(userId, currentWeek.start),
          listTemplateQuestions(),
          getSpcClient(userId),
        ]);
      if (focusResult.status === "fulfilled") setFocusItems(focusResult.value);
      else console.error("Failed to load focus items:", focusResult.reason);
      if (photosResult.status === "fulfilled") setPhotos(photosResult.value);
      else console.error("Failed to load photos:", photosResult.reason);
      if (checkinsResult.status === "fulfilled") setCheckins(checkinsResult.value);
      else console.error("Failed to load check-in history:", checkinsResult.reason);
      if (otLogsResult.status === "fulfilled") setOtLogs(otLogsResult.value);
      else console.error("Failed to load objective-tracking logs:", otLogsResult.reason);
      if (priorResult.status === "fulfilled") setPriorCheckin(priorResult.value);
      else console.error("Failed to load last week's check-in:", priorResult.reason);
      if (currentResult.status === "fulfilled") setCurrentCheckin(currentResult.value);
      else console.error("Failed to load the current check-in:", currentResult.reason);
      // Left null on failure rather than defaulted to an empty array — an
      // empty template would badge every one of her questions HERS ONLY.
      if (templateResult.status === "fulfilled") setTemplateQuestions(templateResult.value);
      else console.error("Failed to load the check-in template:", templateResult.reason);
      if (spcResult.status === "fulfilled") setSpcClient(spcResult.value);
      else console.error("Failed to load SPC enrollment:", spcResult.reason);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }

    // Isolated from the Promise.all above — migration 0023 (nutrition
    // milestones) may not be run yet on a given environment, and that
    // shouldn't take down the rest of an already-working page.
    try {
      setMilestones(await listActiveMilestones(userId));
    } catch (err) {
      console.error("Failed to load milestones:", err);
    }

    // Same isolation, migration 0028 (check-in reopens).
    try {
      setCheckinReopens(await listCheckinReopensSince(userId, addDays(today, -7 * TIMELINE_PAST_WEEKS)));
    } catch (err) {
      console.error("Failed to load check-in reopens:", err);
    }

    // Same isolation, migrations 0050/0059 (plan phases and their status).
    try {
      setPhases(await listPhases(userId));
    } catch (err) {
      console.error("Failed to load plan phases:", err);
    }
    setWeekPaging(false);
  }, [userId, selectedWeek.start, today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const raw = typeof tabParam === "string" ? tabParam : "";
    if (appliedTabParamRef.current === raw) return;
    appliedTabParamRef.current = raw;
    if (raw) setTab(raw);
  }, [tabParam]);

  const handleFinalizeCheckin = async () => {
    setFinalizing(true);
    try {
      await finalizeCheckin(userId, selectedWeek.start);
      await load();
    } catch (err) {
      toastError("Failed to finalize check-in", err);
    } finally {
      setFinalizing(false);
    }
  };

  // Goes straight into Approve & Set Targets right after bypassing, rather
  // than leaving the coach to remember to come back and set one later.
  const handleCloseOut = async () => {
    const confirmed = await confirmBypassOnboarding(buildCloseOutMessage(client?.name, onboarding?.phases));
    if (!confirmed) return;
    setBypassing(true);
    try {
      await bypassOnboarding(userId);
      router.replace(`/(coach)/nutrition/clients/${userId}/onboarding/approve`);
    } catch (err) {
      toastError("Failed to close out onboarding", err);
      setBypassing(false);
    }
  };

  const handleSendToClient = async () => {
    const confirmed = await confirmSendToClient(client.name);
    if (!confirmed) return;
    setSending(true);
    try {
      await sendOnboardingToClient(userId);
      await load();
    } catch (err) {
      toastError("Failed to send to client", err);
    } finally {
      setSending(false);
    }
  };

  const handleChangeHighlights = async (answerIndex, ranges) => {
    if (!checkin) return;
    const previousHighlights = checkin.highlights;
    const nextHighlights = { ...(previousHighlights ?? {}), [answerIndex]: ranges };
    setCheckin({ ...checkin, highlights: nextHighlights });
    try {
      await setCheckinHighlights(checkin.id, nextHighlights);
    } catch (err) {
      setCheckin((c) => (c ? { ...c, highlights: previousHighlights } : c));
      toastError("Failed to save highlight", err);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.canvas }}>
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading this client&apos;s nutrition data: {loadError}
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!client || !targets || !logs || !onboarding) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const currentTarget = targets[0] ?? null;
  const hasTargets = targets.length > 0;
  // The Onboarding tab exists until she is APPROVED — which is exactly what
  // "Close out onboarding" does, so closing out makes the tab disappear.
  // Gating on first targets instead (the handoff's wording) meant closing out
  // and then not saving a target left the tab sitting there, reading as
  // though the close-out hadn't taken.
  //
  // The approved-but-target-less case that gate was protecting against (a
  // pre-existing standalone-app client switched on in Kova) is covered by the
  // banner below instead, which is where it lived before and is a better fit:
  // she isn't onboarding, she just needs numbers.
  const isOnboarding = !client.objective_tracking_approved_at;

  const tabs = [
    ...(isOnboarding ? [{ key: "onboarding", label: "Onboarding" }] : []),
    { key: "dashboard", label: "Dashboard" },
    { key: "weeks", label: "Weeks" },
    { key: "plan", label: "Plan" },
    { key: "checkin", label: "Check-In" },
    { key: "photos", label: "Photos" },
    { key: "targets", label: "Targets" },
    { key: "settings", label: "Settings" },
  ];
  const activeTab = tab && tabs.some((t) => t.key === tab) ? tab : isOnboarding ? "onboarding" : "dashboard";

  const calendarWeek = currentCalendarWeek(today);
  const selectedWeekSummary = summarizeWeek(logs, selectedWeek.start, selectedWeek.end);
  const priorToSelectedEnd = addDays(selectedWeek.start, -1);
  const priorToSelectedSummary = summarizeWeek(logs, addDays(priorToSelectedEnd, -6), priorToSelectedEnd);

  // Weeks tab. The list runs newest-first and stops at the client's own
  // start date — enumerating back past it would render empty weeks for a
  // period she wasn't a client.
  const maxWeeks = Math.max(1, Math.min(60, Math.ceil((new Date(calendarWeek.end) - new Date(client.start_date)) / (7 * 86400000)) + 1));
  const weekCount = showAllWeeks ? maxWeeks : Math.min(WEEKS_SHOWN, maxWeeks);
  const enumerated = enumerateRecentWeeks(calendarWeek, addDays, weekCount);
  const weekRows = enumerated.map((w, i) => {
    const summary = summarizeWeek(logs, w.start, w.end);
    const previous = enumerated[i + 1] ? summarizeWeek(logs, enumerated[i + 1].start, enumerated[i + 1].end) : null;
    const weekCheckin = checkins.find((c) => c.week_start === w.start) ?? null;
    // Numbered from the week's END, not its start: the week that CONTAINS
    // the start date is week 1 (its start is a few days before she began),
    // and a week that finished before she started gets no number at all and
    // falls back to its date.
    const number = weekOnProgram(client.start_date, w.end);
    return {
      ...w,
      dates: weekDates(w),
      label: number ? `Week ${number}` : formatDateMDY(w.start),
      summary,
      target: targets.find((t) => t.effective_date <= w.end) ?? null,
      weightDelta:
        summary.averages.weight !== null && previous?.averages?.weight !== null && previous?.averages?.weight !== undefined
          ? summary.averages.weight - previous.averages.weight
          : null,
      checkinState: weekCheckin ? (weekCheckin.finalized_at ? "reviewed" : "waiting") : "missed",
    };
  });

  // A target change is drawn against the first visible week that starts on
  // or after it took effect, so the divider lands between the weeks measured
  // against the old numbers and the ones measured against the new.
  const targetChangeByWeek = {};
  targets.forEach((target, i) => {
    const previous = targets[i + 1] ?? null;
    if (!previous) return;
    const changes = diffTargets(target, previous);
    if (changes.length === 0) return;
    const match = weekRows.find((w) => w.end >= target.effective_date && w.start <= target.effective_date);
    if (match && !targetChangeByWeek[match.start]) {
      targetChangeByWeek[match.start] = { changes, date: target.effective_date };
    }
  });
  const targetChangeCount = Object.keys(targetChangeByWeek).length;

  const photosByDate = {};
  for (const p of photos) {
    if (!photosByDate[p.date]) photosByDate[p.date] = [];
    photosByDate[p.date].push(p);
  }

  const weekPhotos = photosForRequirementWeek(photos, selectedWeek);
  const coachNameById = Object.fromEntries(coaches.map((c) => [c.id, c.name]));

  const pillKey =
    client.status === "paused" || client.status === "archived"
      ? "paused"
      : !client.objective_tracking_approved_at
        ? "onboarding"
        : !hasTargets
          ? "needsTarget"
          : deriveCheckinStatus(currentCheckin);
  const pill = STATUS_PILL[pillKey] ?? STATUS_PILL.onboarding;

  const unchangedWeeks = currentTarget
    ? Math.max(0, Math.floor((new Date(today) - new Date(currentTarget.effective_date)) / (7 * 86400000)))
    : null;

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: isWeb ? 40 : 18, paddingBottom: 48 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/nutrition"))} style={{ marginBottom: 14, alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>‹ Nutrition</Text>
        </Pressable>

        <View className="mb-5 flex-row flex-wrap items-start justify-between" style={{ gap: 14 }}>
          <View className="flex-1 flex-row items-center" style={{ gap: 14, minWidth: 260 }}>
            <View className="items-center justify-center rounded-full" style={{ width: 46, height: 46, backgroundColor: "#fdf6f2" }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite }}>{initials(client.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 27, color: colors.primary }}>{client.name}</Text>
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: pill.bg }}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: pill.text }}>{pill.label}</Text>
                </View>
                {/* A cross-link, not a duplicate: her lifting lives on the SPC
                    page and a coach reading a check-in about sore knees is
                    one click from what she actually squatted. */}
                {isSpcActive(spcClient) ? (
                  <Pressable onPress={() => router.push(`/(coach)/spc/${userId}`)} className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#eef1e7" }}>
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#4d6142" }}>SPC ›</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text className="mt-1" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                coach: {coachNameById[client.coach_id] ?? "Unassigned"} · started {formatDateMDY(client.start_date)}
              </Text>
            </View>
          </View>

          {checkin && !checkin.finalized_at ? (
            <Pressable
              onPress={handleFinalizeCheckin}
              disabled={finalizing}
              className="flex-row items-center rounded-lg px-5 py-3"
              style={{ backgroundColor: colors.primary, opacity: finalizing ? 0.5 : 1, gap: 8 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>
                {finalizing ? "Completing…" : "Complete check-in"}
              </Text>
              {weekPhotos.length > 0 ? <Ionicons name="camera" size={15} color="white" /> : null}
            </Pressable>
          ) : null}
        </View>

        <TabBar tabs={tabs} active={activeTab} onSelect={setTab} />

        {/* Approved, but nothing to measure her against yet. Reachable for a
            pre-existing standalone-app client whose Kova nutrition switch was
            just turned on, and for anyone just closed out of onboarding who
            hasn't had their first targets saved. Shown on every tab, since
            every one of them is meaningless until this is done. */}
        {!isOnboarding && !hasTargets ? (
          <Pressable
            onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/approve`)}
            className="mb-5 flex-row flex-wrap items-center justify-between rounded-xl px-4 py-3.5"
            style={{ borderWidth: 1, borderColor: "#e9d3ae", backgroundColor: "#f4ede3", gap: 10 }}
          >
            <View style={{ flex: 1, minWidth: 240 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#8a5a2e" }}>No target set yet</Text>
              <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5a2e" }}>
                Every tab here measures her against her targets. Set them and the rest of this page starts working.
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#8a5a2e" }}>Review &amp; set targets ›</Text>
          </Pressable>
        ) : null}

        {activeTab === "onboarding" ? (
          <NutritionOnboardingTab
            userId={userId}
            client={client}
            onboarding={onboarding}
            otLogs={otLogs}
            photos={photos}
            isWide={isWide}
            sending={sending}
            bypassing={bypassing}
            onSendToClient={handleSendToClient}
            onCloseOut={handleCloseOut}
          />
        ) : null}

        {activeTab === "dashboard" ? (
          <NutritionDashboardTab
            userId={userId}
            coachId={profile.id}
            client={client}
            logs={logs}
            currentTarget={currentTarget}
            focusItems={focusItems}
            milestones={milestones}
            today={today}
            isWide={isWide}
            onChanged={load}
          />
        ) : null}

        {activeTab === "weeks" ? (
          <View>
            <View className="mb-3 flex-row flex-wrap items-baseline justify-between" style={{ gap: 10 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {maxWeeks} week{maxWeeks === 1 ? "" : "s"} on program
              </Text>
              {targetChangeCount > 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                  Targets changed {targetChangeCount === 1 ? "once" : `${targetChangeCount} times`} — marked on the weeks they moved
                </Text>
              ) : null}
            </View>
            <WeekRows weeks={weekRows} targetChangeByWeek={targetChangeByWeek} />
            {maxWeeks > WEEKS_SHOWN ? (
              <Pressable onPress={() => setShowAllWeeks((v) => !v)} className="mt-2 self-start">
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.primaryOnWhite }}>
                  {showAllWeeks ? "Show recent weeks only" : `${maxWeeks - WEEKS_SHOWN} earlier week${maxWeeks - WEEKS_SHOWN === 1 ? "" : "s"}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {activeTab === "plan" ? (
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 18 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Card title="Plan phases">
                <PlanPhases userId={userId} coachId={profile.id} phases={phases} onChanged={load} />
              </Card>
            </View>
            <View style={{ width: isWide ? 320 : undefined }}>
              <Card title="Milestones">
                <MilestoneSlots userId={userId} coachId={profile.id} milestones={milestones} onChanged={load} />
              </Card>
            </View>
          </View>
        ) : null}

        {activeTab === "checkin" ? (
          <NutritionCheckinTab
            userId={userId}
            client={client}
            checkin={checkin}
            priorCheckin={priorCheckin}
            templateQuestions={templateQuestions}
            selectedWeek={selectedWeek}
            weekOffset={weekOffset}
            weekPaging={weekPaging}
            onOlderWeek={() => {
              setWeekPaging(true);
              setWeekOffset((o) => o + 1);
            }}
            onNewerWeek={() => {
              if (weekOffset > 0) {
                setWeekPaging(true);
                setWeekOffset((o) => Math.max(0, o - 1));
              }
            }}
            summary={selectedWeekSummary}
            priorSummary={priorToSelectedSummary}
            currentTarget={currentTarget}
            photos={photos}
            focusItems={focusItems}
            isWide={isWide}
            onChanged={load}
            onChangeHighlights={handleChangeHighlights}
            onOpenPhotos={() => setTab("photos")}
            onOpenTargets={() => setTab("targets")}
          />
        ) : null}

        {/* No card under the comparison — the two photos are the content of
            this tab and they get the window's height. Backfilling and fixing
            are occasional housekeeping, so they live behind the toolbar's
            Manage photos button. */}
        {activeTab === "photos" ? (
          <PhotoCompareRail photos={photos} startDate={client.start_date} onManage={() => setManagingPhotos(true)} />
        ) : null}

        {activeTab === "targets" ? (
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 18 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Card style={{ marginBottom: 16 }}>
                <TargetsEditor
                  userId={userId}
                  setBy={profile.id}
                  currentTarget={currentTarget}
                  recentAverages={selectedWeekSummary?.averages}
                  setByName={currentTarget ? coachNameById[currentTarget.set_by] : null}
                  unchangedWeeks={unchangedWeeks}
                  onSaved={load}
                />
              </Card>
              <Card title="Objective tracking">
                <ObjectiveTrackingHistory logs={otLogs} />
              </Card>
            </View>
            <View style={{ width: isWide ? 380 : undefined }}>
              <Card title="History">
                <TargetHistoryTable history={targets} coachNameById={coachNameById} />
              </Card>
            </View>
          </View>
        ) : null}

        {activeTab === "settings" ? (
          <ClientSettingsPanel
            userId={userId}
            coachId={profile.id}
            coaches={coaches}
            client={client}
            checkins={checkins}
            reopens={checkinReopens}
            photos={photos}
            today={today}
            isWide={isWide}
            onSaved={load}
          />
        ) : null}
      </ScrollView>
      <ManagePhotosModal
        visible={managingPhotos}
        userId={userId}
        photosByDate={photosByDate}
        onClose={() => setManagingPhotos(false)}
        onChanged={load}
      />
      <CoachMessageBubble userId={userId} clientName={client.name} />
    </CoachShell>
  );
}
