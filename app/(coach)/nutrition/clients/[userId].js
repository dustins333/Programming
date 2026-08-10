import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../../lib/boiseDate";
import { getClient, sendOnboardingToClient } from "../../../../lib/nutrition/clients";
import { listCoaches } from "../../../../lib/programming/clients";
import { listTargets, deriveCalories } from "../../../../lib/nutrition/targets";
import { listLogs } from "../../../../lib/nutrition/dailyLog";
import { getCheckinForWeek, finalizeCheckin, listCheckinsSince, listCheckinReopensSince } from "../../../../lib/nutrition/checkin";
import { listFocusItems, setCheckinHighlights } from "../../../../lib/nutrition/coachClient";
import { listActiveMilestones } from "../../../../lib/nutrition/milestones";
import { getOnboardingStatus, bypassOnboarding, listObjectiveTrackingLogs } from "../../../../lib/nutrition/onboarding";
import { computeWeekWindows, currentCalendarWeek, summarizeWeek } from "../../../../lib/nutrition/weekCycle";
import { OnboardingStepper } from "../../../../components/nutrition/OnboardingStepper";
import { PhaseCard } from "../../../../components/nutrition/PhaseCard";
import { WeekList, enumerateRecentWeeks } from "../../../../components/nutrition/WeekList";
import { WeekComparison } from "../../../../components/nutrition/WeekComparison";
import { WeeklySnapshot } from "../../../../components/nutrition/WeeklySnapshot";
import { TrendTiles } from "../../../../components/nutrition/TrendTiles";
import { TrendChart } from "../../../../components/nutrition/TrendChart";
import { MacroPills } from "../../../../components/nutrition/MacroPills";
import { FocusChecklist } from "../../../../components/nutrition/FocusChecklist";
import { GamePlan } from "../../../../components/nutrition/GamePlan";
import { MilestoneSlots } from "../../../../components/nutrition/MilestoneSlots";
import { TargetsHistory } from "../../../../components/nutrition/TargetsHistory";
import { ObjectiveTrackingHistory } from "../../../../components/nutrition/ObjectiveTrackingHistory";
import { NewTargetForm } from "../../../../components/nutrition/NewTargetForm";
import { HighlightableAnswer } from "../../../../components/nutrition/HighlightableAnswer";
import { listAllPhotos } from "../../../../lib/nutrition/photos";
import { PhotoCompare } from "../../../../components/nutrition/PhotoCompare";
import { PhotoSubmissionsEditor } from "../../../../components/nutrition/PhotoSubmissionsEditor";
import { PhotoUpload } from "../../../../components/nutrition/PhotoUpload";
import { ClientSettingsModal } from "../../../../components/nutrition/ClientSettingsModal";
import { CoachMessageBubble } from "../../../../components/CoachMessageBubble";
import { CoachShell } from "../../../../components/CoachShell";
import { formatDateMDY } from "../../../../lib/formatDate";
import { confirmBypassOnboarding, confirmSendToClient } from "../../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";

const isWeb = Platform.OS === "web";

const PHASE_LABELS = {
  questionnaire: "the questionnaire",
  tracking: "objective tracking",
  photos: "starting photos",
};

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
// stalled on one (Abbi Stauffer: questionnaire + all 5 tracking days done,
// only photos missing). Nothing is actually discarded either way —
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

const WEEKS_SHOWN = 8;
const TIMELINE_PAST_WEEKS = 6;
const TIMELINE_UPCOMING_WEEKS = 3;

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "weeks", label: "Weeks" },
  { key: "trends", label: "Trends" },
  { key: "checkin", label: "Check-In" },
  { key: "photos", label: "Photos" },
  { key: "targets", label: "Targets" },
];

const TREND_METRICS = [
  { key: "weight", label: "Weight" },
  { key: "sleep_hours", label: "Sleep" },
  { key: "steps", label: "Steps" },
  { key: "hunger", label: "Hunger" },
  { key: "energy", label: "Energy" },
];

const TREND_RANGES = [
  { key: 7, label: "W" },
  { key: 30, label: "1m" },
  { key: 90, label: "3m" },
  { key: 180, label: "6m" },
  { key: 365, label: "1y" },
];

function TabBar({ active, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 border-b border-stone-200">
      <View className="flex-row">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable key={tab.key} onPress={() => onSelect(tab.key)} className="mr-6 pb-3" style={isActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : undefined}>
              <Text style={{ fontFamily: isActive ? fonts.sansSemiBold : fonts.sansMedium, color: isActive ? colors.primaryOnWhite : "#78716c" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// design_handoff_v2_settings_nutrition tokens: card border #ece7e1 (not the
// plain stone-200 gray this used before), 12-16px radius, soft two-layer
// shadow (approximated in RN with one shadow, same convention used
// elsewhere in the app — RN doesn't support multi-layer box-shadow).
function SectionCard({ title, children, headerRight }) {
  return (
    <View
      className="mb-5 rounded-xl p-4"
      style={{
        borderWidth: 1,
        borderColor: "#ece7e1",
        backgroundColor: "white",
        shadowColor: "#44403c",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 1,
      }}
    >
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansBold }}>
          {title}
        </Text>
        {headerRight}
      </View>
      {children}
    </View>
  );
}

export default function NutritionClientDetail() {
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const today = todayInBoise();

  const [tab, setTab] = useState("dashboard");
  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [targets, setTargets] = useState(null);
  const [logs, setLogs] = useState(null);
  const [focusItems, setFocusItems] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  // Paging to another week refetches the whole page — this drives a small
  // spinner next to the week label so stale data isn't silently shown
  // while the new week loads.
  const [weekPaging, setWeekPaging] = useState(false);
  const [checkin, setCheckin] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [trendMetric, setTrendMetric] = useState("weight");
  const [trendRange, setTrendRange] = useState(30);
  const [loadError, setLoadError] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [checkinReopens, setCheckinReopens] = useState([]);
  const [otLogs, setOtLogs] = useState([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [bypassing, setBypassing] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedWeek = useMemo(() => {
    const { currentWeek } = computeWeekWindows(today);
    const end = addDays(currentWeek.end, -7 * weekOffset);
    const start = addDays(end, -6);
    return { start, end };
  }, [today, weekOffset]);

  const load = useCallback(async () => {
    try {
      // Core fetches only — the rows that gate rendering (client/targets/
      // logs/onboarding) or drive real actions (checkin → Finalize). The
      // display-only fetches below are isolated via allSettled so one
      // domain's failure doesn't blank the whole page (same reasoning as
      // the milestones/reopens isolation further down).
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

      const [focusResult, photosResult, checkinsResult, otLogsResult] = await Promise.allSettled([
        listFocusItems(userId),
        listAllPhotos(userId),
        listCheckinsSince(userId, addDays(today, -7 * TIMELINE_PAST_WEEKS)),
        listObjectiveTrackingLogs(userId),
      ]);
      if (focusResult.status === "fulfilled") setFocusItems(focusResult.value);
      else console.error("Failed to load focus items:", focusResult.reason);
      if (photosResult.status === "fulfilled") setPhotos(photosResult.value);
      else console.error("Failed to load photos:", photosResult.reason);
      if (checkinsResult.status === "fulfilled") setCheckins(checkinsResult.value);
      else console.error("Failed to load check-in history:", checkinsResult.reason);
      if (otLogsResult.status === "fulfilled") setOtLogs(otLogsResult.value);
      else console.error("Failed to load objective-tracking logs:", otLogsResult.reason);
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
    setWeekPaging(false);
  }, [userId, selectedWeek.start]);

  useEffect(() => {
    load();
  }, [load]);

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
  // than leaving the coach to remember to come back and set one later — a
  // bypassed client with no target sitting around is exactly the
  // "needsTarget" limbo state that shouldn't exist. approve.js's own gate
  // only checks whether a target exists yet (not the approval timestamp),
  // so it's already the right screen to land on here.
  const handleBypassOnboarding = async () => {
    const confirmed = await confirmBypassOnboarding(buildCloseOutMessage(client?.name, onboarding?.phases));
    if (!confirmed) return;
    setBypassing(true);
    try {
      await bypassOnboarding(userId);
      router.replace(`/(coach)/nutrition/clients/${userId}/onboarding/approve`);
    } catch (err) {
      toastError("Failed to skip onboarding", err);
      setBypassing(false);
    }
  };

  // Releases the questionnaire + tracking dates a coach has been setting up
  // (see migration 0031) — before this, the client's own onboarding hub
  // shows a "your coach is getting things ready" placeholder instead
  // (lib/nutrition/useNutritionAccess.js's "pending" status).
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
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading this client's nutrition data: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!client || !targets || !logs || !onboarding) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (!client.objective_tracking_approved_at) {
    const steps = [
      { key: "questionnaire", label: "Questionnaire", state: onboarding.phases.questionnaire ? "done" : "pending", subtext: onboarding.phases.questionnaire ? "Submitted" : "Not submitted" },
      {
        key: "tracking",
        label: "Objective Tracking",
        state: onboarding.trackingState,
        subtext:
          onboarding.trackingCount === 0
            ? "Skipped — no days assigned (optional)"
            : onboarding.trackingState === "overdue"
              ? `${onboarding.overdueCount} day${onboarding.overdueCount === 1 ? "" : "s"} overdue`
              : `${onboarding.loggedCount} of ${onboarding.trackingCount} logged`,
      },
      { key: "photos", label: "Starting photos", state: onboarding.phases.photos ? "done" : "pending", subtext: onboarding.phases.photos ? "All angles in" : "Front/side/back needed" },
    ];

    return (
      <CoachShell>
        <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 900 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/nutrition"))}
            style={{ marginBottom: 12 }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
          <View className="mb-1 flex-row items-center gap-3">
            <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              {client.name}
            </Text>
            <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: "#f4ede3" }}>
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#8a5a2e" }}>
                Onboarding
              </Text>
            </View>
            <Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
              <Ionicons name="settings-outline" size={19} color="#a8a29e" />
            </Pressable>
          </View>
          <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            {client.email} · started {formatDateMDY(client.start_date)}
          </Text>

          {client.onboarding_sent_at ? (
            <View className="mb-5 rounded-lg border px-4 py-3" style={{ borderColor: "#ece7e1", backgroundColor: "#faf8f6" }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>
                Sent to client {formatDateMDY(client.onboarding_sent_at.slice(0, 10))} — they can see their questionnaire and tracking dates.
              </Text>
            </View>
          ) : (
            <View className="mb-5 flex-row items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}>
              <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
                Not sent yet — they can't see their questionnaire or tracking dates until you send it.
              </Text>
              <Pressable onPress={handleSendToClient} disabled={sending} className="rounded-lg px-4 py-2.5" style={{ backgroundColor: colors.primary }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  {sending ? "Sending…" : "Send to client"}
                </Text>
              </Pressable>
            </View>
          )}

          <SectionCard title="Onboarding progress">
            <OnboardingStepper steps={steps} />
          </SectionCard>

          {onboarding.phases.readyForReview ? (
            <View className="mb-5 rounded-lg border px-4 py-3" style={{ borderColor: "#dbe8cf", backgroundColor: "#eef1e7" }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                Ready for review — approve below to set their first targets.
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: isWeb ? "row" : "column", gap: 16 }}>
            <View style={{ flex: 1 }}>
              <PhaseCard
                title="Questionnaire"
                accent="accent"
                done={onboarding.phases.questionnaire}
                subtext={onboarding.phases.questionnaire ? "Submitted — tap to view" : "Not submitted yet"}
                onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/questionnaire`)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PhaseCard
                title="Objective Tracking"
                accent="primary"
                done={onboarding.phases.tracking}
                subtext={
                  onboarding.trackingCount === 0
                    ? "Skipped — no days assigned (optional, tap to add)"
                    : onboarding.phases.tracking
                      ? "All days logged — tap to view"
                      : `${onboarding.loggedCount} of ${onboarding.trackingCount} logged`
                }
                onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/tracking`)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PhaseCard
                title="Starting Photos"
                accent="tertiary"
                done={onboarding.phases.photos}
                subtext={onboarding.phases.photos ? "All angles in — tap to view" : "Front/side/back needed"}
                onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/photos`)}
              />
            </View>
          </View>

          <View className="mt-5 flex-row flex-wrap items-center gap-4">
            {onboarding.phases.readyForReview ? (
              <Pressable
                onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/approve`)}
                className="items-center self-start rounded-lg px-5 py-3"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  Approve & Set Targets
                </Text>
              </Pressable>
            ) : null}

            {/* Lets the coach close out onboarding with whatever the client
                has actually submitted — originally for a client who won't do
                any of it in-app (ported from the standalone app's
                bypassObjectiveTracking, see lib/nutrition/onboarding.js's
                bypassOnboarding), but the far more common case is a client
                who finished 2 of 3 and stalled on one, where "Approve & Set
                Targets" is hidden and this is the only way forward.
                Available regardless of phase progress, since "won't ever
                finish" isn't something the phase checklist can detect.

                Styled as a real button matching Approve & Set Targets in
                size and shape, but outlined rather than filled so that when
                both are on screen the genuine approve stays the primary
                action instead of two identical buttons competing. */}
            <Pressable
              onPress={handleBypassOnboarding}
              disabled={bypassing}
              className="items-center self-start rounded-lg px-5 py-3"
              style={{ borderWidth: 1.5, borderColor: colors.primary, opacity: bypassing ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                {bypassing ? "Closing out…" : "Close out onboarding →"}
              </Text>
            </Pressable>
          </View>

          {/* Tracking dates aren't assigned during a coach-run draft stage
              here (Kova has no client_drafts) — the Objective Tracking phase
              card links straight to the assignment UI on its own page. */}
        </ScrollView>
        <ClientSettingsModal
          visible={settingsVisible}
          userId={userId}
          coachId={profile.id}
          coaches={coaches}
          client={client}
          checkins={checkins}
          reopens={checkinReopens}
          photos={photos}
          today={today}
          onClose={() => setSettingsVisible(false)}
          onSaved={load}
        />
      </CoachShell>
    );
  }

  const currentTarget = targets[0] ?? null;
  const calendarWeek = currentCalendarWeek(today);
  const priorCalendarWeek = { start: addDays(calendarWeek.start, -7), end: addDays(calendarWeek.end, -7) };
  const thisWeekSummary = summarizeWeek(logs, calendarWeek.start, calendarWeek.end);
  const lastWeekSummary = summarizeWeek(logs, priorCalendarWeek.start, priorCalendarWeek.end);
  const selectedWeekSummary = summarizeWeek(logs, selectedWeek.start, selectedWeek.end);
  const priorToSelectedEnd = addDays(selectedWeek.start, -1);
  const priorToSelectedStart = addDays(priorToSelectedEnd, -6);
  const priorToSelectedSummary = summarizeWeek(logs, priorToSelectedStart, priorToSelectedEnd);

  const recentWeeks = enumerateRecentWeeks(calendarWeek, addDays, WEEKS_SHOWN).map((w) => ({
    ...w,
    summary: summarizeWeek(logs, w.start, w.end),
    target: targets.find((t) => t.effective_date <= w.end) ?? null,
  }));

  const trendCutoff = addDays(today, -trendRange);
  const trendPoints = logs
    .filter((l) => l.date >= trendCutoff)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => ({ date: l.date, value: l[trendMetric] }));

  // Photos come in dated groups of up to 3 — grouped by upload date (not
  // angle) since a mistagged batch usually needs fixing together.
  const photosByDate = {};
  for (const p of photos) {
    if (!photosByDate[p.date]) photosByDate[p.date] = [];
    photosByDate[p.date].push(p);
  }

  // Backs the top-of-page Finalize button's photo indicator — whether the
  // currently-loaded check-in week (selectedWeek, same week the button
  // itself finalizes) has any progress photos in yet.
  const weekPhotos = photos.filter((p) => p.date >= selectedWeek.start && p.date <= selectedWeek.end);

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 1000 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/nutrition"))}
          style={{ marginBottom: 12 }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </Pressable>
        <View className="mb-1 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              {client.name}
            </Text>
            <Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
              <Ionicons name="settings-outline" size={19} color="#a8a29e" />
            </Pressable>
          </View>
          {/* Ready-to-finalize check-in action, relocated here from the
              bottom of the Check-In tab so it's visible regardless of which
              tab a coach lands on. Tied to the same `checkin`/`selectedWeek`
              state the Check-In tab's week-navigator drives, so paging to a
              late-submitted prior week (weekOffset > 0) still works through
              this same button. The small camera icon is a lightweight "there
              are photos in this check-in" flag — not unread tracking, just
              whether any were uploaded for this cycle. */}
          {checkin && !checkin.finalized_at ? (
            <Pressable
              onPress={handleFinalizeCheckin}
              disabled={finalizing}
              className="flex-row items-center gap-2 rounded-lg px-4 py-2 disabled:opacity-50"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                {finalizing ? "Finalizing…" : "Finalize Check-In"}
              </Text>
              {weekPhotos.length > 0 ? <Ionicons name="camera" size={15} color="white" /> : null}
            </Pressable>
          ) : null}
        </View>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          {client.email}
        </Text>

        <TabBar active={tab} onSelect={setTab} />

        {/* Entry point for reviewing + setting a client's first target —
            previously only reachable from the onboarding hub, which a
            client stops seeing the moment objective_tracking_approved_at
            is set. A client can be already-approved but still have zero
            targets (e.g. a pre-existing standalone-app client whose Kova
            nutrition switch was just turned on, never run through Kova's
            own onboarding cycle) — that's exactly what the roster's "Needs
            target" status means, and until now there was no way to reach
            the baseline-informed review screen for that case. Shown across
            every tab, not just Dashboard, since a coach might land here
            from a saved link or a different tab. */}
        {!currentTarget ? (
          <Link href={`/(coach)/nutrition/clients/${userId}/onboarding/approve`} asChild>
            <Pressable
              className="mb-5 flex-row items-center justify-between rounded-lg border px-4 py-3.5"
              style={{ borderColor: "#e9d3ae", backgroundColor: "#f4ede3" }}
            >
              <View className="flex-1 pr-3">
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e" }}>No target set yet</Text>
                <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#8a5a2e" }}>
                  Review their objective tracking baseline and set their first macros.
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "#8a5a2e" }}>Review & Set Targets ›</Text>
            </Pressable>
          </Link>
        ) : null}

        {tab === "dashboard" && (
          <View>
            {/* Focus items + Notes lead the page (design_handoff_v2 —
                explicit reorder ask), above the metrics cards below. */}
            <View style={{ flexDirection: isWeb ? "row" : "column", gap: 20 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Focus items">
                  <FocusChecklist userId={userId} items={focusItems} onChanged={load} />
                </SectionCard>
              </View>
              <View style={{ flex: 1 }}>
                <SectionCard title="Notes">
                  <GamePlan userId={userId} initialGamePlan={client.game_plan} />
                </SectionCard>
              </View>
            </View>

            <SectionCard title="Milestones">
              <MilestoneSlots userId={userId} coachId={profile.id} milestones={milestones} onChanged={load} />
            </SectionCard>

            <SectionCard title="This week at a glance">
              <TrendTiles thisWeek={thisWeekSummary} lastWeek={lastWeekSummary} />
            </SectionCard>

            <View style={{ flexDirection: isWeb ? "row" : "column", gap: 20 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Current target">
                  {currentTarget ? (
                    <MacroPills
                      calories={Math.round(deriveCalories(currentTarget))}
                      protein={currentTarget.protein_g}
                      carb={currentTarget.carb_g}
                      fat={currentTarget.fat_g}
                      fiber={currentTarget.fiber_g}
                      steps={currentTarget.step_goal}
                      sleepHours={currentTarget.sleep_hours_goal}
                    />
                  ) : (
                    <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                      No target set yet.
                    </Text>
                  )}
                </SectionCard>
              </View>
              <View style={{ flex: 1 }}>
                <SectionCard title="This week vs. last week">
                  <WeekComparison thisWeek={thisWeekSummary} lastWeek={lastWeekSummary} target={currentTarget} />
                </SectionCard>
              </View>
            </View>
          </View>
        )}

        {tab === "weeks" && (
          <View>
            <SectionCard title="Weekly averages">
              <WeekList weeks={recentWeeks} />
            </SectionCard>
          </View>
        )}

        {tab === "trends" && (
          <SectionCard title="Trends">
            <View className="mb-4 flex-row flex-wrap gap-2">
              {TREND_METRICS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setTrendMetric(m.key)}
                  className="rounded-full border px-3 py-1.5"
                  style={{ borderColor: trendMetric === m.key ? colors.primary : "#d6d3d1", backgroundColor: trendMetric === m.key ? colors.primary : "transparent" }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, color: trendMetric === m.key ? "white" : "#57534e", fontSize: 12 }}>{m.label}</Text>
                </Pressable>
              ))}
              <View className="ml-auto flex-row gap-2">
                {TREND_RANGES.map((r) => (
                  <Pressable key={r.key} onPress={() => setTrendRange(r.key)}>
                    <Text style={{ fontFamily: trendRange === r.key ? fonts.sansSemiBold : fonts.sans, color: trendRange === r.key ? colors.primaryOnWhite : "#a8a29e", fontSize: 12 }}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TrendChart points={trendPoints} width={isWeb ? 600 : 320} />
          </SectionCard>
        )}

        {tab === "checkin" && (
          <View>
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable onPress={() => { setWeekPaging(true); setWeekOffset((o) => o + 1); }}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Prior week</Text>
              </Pressable>
              <View className="flex-row items-center gap-2">
                <Text style={{ fontFamily: fonts.sansSemiBold }}>
                  Week of {formatDateMDY(selectedWeek.start)}
                </Text>
                {weekPaging ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </View>
              <Pressable onPress={() => { if (weekOffset > 0) { setWeekPaging(true); setWeekOffset((o) => Math.max(0, o - 1)); } }} disabled={weekOffset === 0}>
                <Text style={{ fontFamily: fonts.sansMedium, color: weekOffset === 0 ? "#d6d3d1" : colors.primaryOnWhite }}>Next week ›</Text>
              </Pressable>
            </View>

            <SectionCard title="This week's snapshot">
              <WeeklySnapshot thisWeek={selectedWeekSummary} lastWeek={priorToSelectedSummary} />
            </SectionCard>

            <SectionCard title="Check-in answers">
              {checkin ? (
                <View>
                  {checkin.answers.map((a, i) => (
                    <View key={i} className="mb-3">
                      <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold }}>
                        {a.question}
                      </Text>
                      <HighlightableAnswer
                        text={a.answer || "—"}
                        ranges={checkin.highlights?.[i]}
                        onChangeRanges={(ranges) => handleChangeHighlights(i, ranges)}
                      />
                    </View>
                  ))}
                  {/* What the client was actually working against that week —
                      submitCheckin has stored these snapshots on every
                      response since day one, but nothing ever rendered them,
                      so the coach was reading last week's answers against
                      TODAY'S focus/targets. */}
                  {checkin.targets_snapshot || (checkin.focus_snapshot ?? []).length > 0 || checkin.game_plan_snapshot ? (
                    <View className="mt-3 rounded-xl border border-stone-200 p-3" style={{ backgroundColor: "#faf8f6" }}>
                      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.4 }}>
                        That week's targets & focus
                      </Text>
                      {checkin.targets_snapshot ? (
                        <View className="mb-2">
                          <MacroPills
                            protein={checkin.targets_snapshot.protein_g}
                            carb={checkin.targets_snapshot.carb_g}
                            fat={checkin.targets_snapshot.fat_g}
                            fiber={checkin.targets_snapshot.fiber_g}
                            calories={Math.round(deriveCalories(checkin.targets_snapshot))}
                            steps={checkin.targets_snapshot.step_goal}
                            sleepHours={checkin.targets_snapshot.sleep_hours_goal}
                          />
                        </View>
                      ) : null}
                      {(checkin.focus_snapshot ?? []).map((f, i) => (
                        <Text key={i} className="text-sm" style={{ fontFamily: fonts.sans, color: f.done ? "#4d6142" : "#57534e" }}>
                          {f.done ? "✓" : "○"} {f.text}
                        </Text>
                      ))}
                      {checkin.game_plan_snapshot ? (
                        <Text className="mt-1 text-sm text-stone-500" style={{ fontFamily: fonts.sans, fontStyle: "italic" }}>
                          Game plan: {checkin.game_plan_snapshot}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {/* Finalize action itself lives at the top of the page now,
                      next to the client's name — this is just a status
                      readout for whoever's down here reading the answers. */}
                  <Text className="mt-2 text-center" style={{ fontFamily: fonts.sansSemiBold, color: checkin.finalized_at ? "#4d6142" : "#b3843a" }}>
                    {checkin.finalized_at ? "Finalized ✓" : "Awaiting your review — Finalize at the top of the page"}
                  </Text>
                </View>
              ) : (
                <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Not submitted yet this week.
                </Text>
              )}
            </SectionCard>

            {/* The realistic review loop — read answers → update focus/game
                plan → set the new target — used to cost 3 tab switches; the
                live editing surfaces now sit right under the answers. */}
            <View style={{ flexDirection: isWeb ? "row" : "column", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Focus items (live)">
                  <FocusChecklist userId={userId} items={focusItems} onChanged={load} />
                </SectionCard>
              </View>
              <View style={{ flex: 1 }}>
                <SectionCard
                  title="Game plan (live)"
                  headerRight={
                    <Pressable onPress={() => setTab("targets")} hitSlop={8}>
                      <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                        Set new target ›
                      </Text>
                    </Pressable>
                  }
                >
                  <GamePlan userId={userId} initialGamePlan={client.game_plan} />
                </SectionCard>
              </View>
            </View>
          </View>
        )}

        {tab === "photos" && (
          <View>
            <SectionCard title="Compare">
              <PhotoCompare photos={photos} />
            </SectionCard>

            <SectionCard
              title="Fix a day's photos"
              headerRight={
                Object.keys(photosByDate).length > 0 ? <PhotoSubmissionsEditor photosByDate={photosByDate} onSaved={load} /> : null
              }
            >
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                {photos.length === 0 ? "No photos uploaded yet." : "Use Edit above if a photo's angle or weight is wrong."}
              </Text>
            </SectionCard>

            <SectionCard title="Add photos (e.g. old/starting photos)">
              <PhotoUpload userId={userId} onUploaded={load} allowDatePick />
            </SectionCard>
          </View>
        )}

        {tab === "targets" && (
          <View>
            <SectionCard title="Set new target">
              <NewTargetForm userId={userId} setBy={profile.id} currentTarget={currentTarget} recentAverages={selectedWeekSummary?.averages} onSaved={load} />
            </SectionCard>
            <SectionCard title="Target history">
              <TargetsHistory history={targets} />
            </SectionCard>
            <SectionCard title="Objective Tracking">
              <ObjectiveTrackingHistory logs={otLogs} />
            </SectionCard>
          </View>
        )}
      </ScrollView>
      <ClientSettingsModal
        visible={settingsVisible}
        userId={userId}
        coachId={profile.id}
        coaches={coaches}
        client={client}
        checkins={checkins}
        reopens={checkinReopens}
        photos={photos}
        today={today}
        onClose={() => setSettingsVisible(false)}
        onSaved={load}
      />
      <CoachMessageBubble userId={userId} clientName={client.name} />
    </CoachShell>
  );
}
