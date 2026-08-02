import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../../lib/boiseDate";
import { getClient } from "../../../../lib/nutrition/clients";
import { listTargets, deriveCalories } from "../../../../lib/nutrition/targets";
import { listLogs } from "../../../../lib/nutrition/dailyLog";
import { getCheckinForWeek, finalizeCheckin, copyTemplateToClient } from "../../../../lib/nutrition/checkin";
import { listFocusItems, setCheckinHighlights } from "../../../../lib/nutrition/coachClient";
import { getOnboardingStatus } from "../../../../lib/nutrition/onboarding";
import { computeWeekWindows, summarizeWeek } from "../../../../lib/nutrition/weekCycle";
import { OnboardingStepper } from "../../../../components/nutrition/OnboardingStepper";
import { PhaseCard } from "../../../../components/nutrition/PhaseCard";
import { WeekList, enumerateRecentWeeks } from "../../../../components/nutrition/WeekList";
import { WeekComparison } from "../../../../components/nutrition/WeekComparison";
import { WeeklySnapshot } from "../../../../components/nutrition/WeeklySnapshot";
import { TrendTiles } from "../../../../components/nutrition/TrendTiles";
import { TrendChart } from "../../../../components/nutrition/TrendChart";
import { FocusChecklist } from "../../../../components/nutrition/FocusChecklist";
import { GamePlan } from "../../../../components/nutrition/GamePlan";
import { TargetsHistory } from "../../../../components/nutrition/TargetsHistory";
import { NewTargetForm } from "../../../../components/nutrition/NewTargetForm";
import { HighlightableAnswer } from "../../../../components/nutrition/HighlightableAnswer";
import { listAllPhotos } from "../../../../lib/nutrition/photos";
import { PhotoCompare } from "../../../../components/nutrition/PhotoCompare";
import { PhotoRequirementControls } from "../../../../components/nutrition/PhotoRequirementControls";
import { PhotoSubmissionsEditor } from "../../../../components/nutrition/PhotoSubmissionsEditor";
import { PhotoUpload } from "../../../../components/nutrition/PhotoUpload";
import { CoachShell } from "../../../../components/CoachShell";
import { formatDateMDY } from "../../../../lib/formatDate";
import { fonts, colors } from "../../../../lib/theme";

const isWeb = Platform.OS === "web";
const WEEKS_SHOWN = 8;

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
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
  { key: 180, label: "6mo" },
  { key: 365, label: "1yr" },
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

function SectionCard({ title, children, headerRight }) {
  return (
    <View className="mb-5 rounded-lg border border-stone-200 p-4">
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
  const [targets, setTargets] = useState(null);
  const [logs, setLogs] = useState(null);
  const [focusItems, setFocusItems] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [checkin, setCheckin] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [trendMetric, setTrendMetric] = useState("weight");
  const [trendRange, setTrendRange] = useState(30);
  const [loadError, setLoadError] = useState(null);

  const selectedWeek = useMemo(() => {
    const { currentWeek } = computeWeekWindows(today);
    const end = addDays(currentWeek.end, -7 * weekOffset);
    const start = addDays(end, -6);
    return { start, end };
  }, [today, weekOffset]);

  const load = useCallback(async () => {
    try {
      const [clientRow, targetRows, logRows, focusRows, checkinRow, onboardingStatus, photoRows] = await Promise.all([
        getClient(userId),
        listTargets(userId),
        listLogs(userId, { limit: 400 }),
        listFocusItems(userId),
        getCheckinForWeek(userId, selectedWeek.start),
        getOnboardingStatus(userId),
        listAllPhotos(userId),
      ]);
      setClient(clientRow);
      setTargets(targetRows);
      setLogs(logRows);
      setFocusItems(focusRows);
      setCheckin(checkinRow);
      setOnboarding(onboardingStatus);
      setPhotos(photoRows);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
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
      Alert.alert("Failed to finalize check-in", err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  const handleCopyQuestions = async () => {
    setCopying(true);
    try {
      await copyTemplateToClient(userId);
      Alert.alert("Done", "Check-in questions copied from the template.");
    } catch (err) {
      Alert.alert("Failed to copy questions", err.message ?? String(err));
    } finally {
      setCopying(false);
    }
  };

  const handleChangeHighlights = async (answerIndex, ranges) => {
    if (!checkin) return;
    const nextHighlights = { ...(checkin.highlights ?? {}), [answerIndex]: ranges };
    setCheckin({ ...checkin, highlights: nextHighlights });
    try {
      await setCheckinHighlights(checkin.id, nextHighlights);
    } catch (err) {
      Alert.alert("Failed to save highlight", err.message ?? String(err));
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading this client's nutrition data: {loadError}
          </Text>
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
            ? "No dates assigned"
            : onboarding.trackingState === "overdue"
              ? `${onboarding.overdueCount} day${onboarding.overdueCount === 1 ? "" : "s"} overdue`
              : `${onboarding.loggedCount} of ${onboarding.trackingCount} logged`,
      },
      { key: "photos", label: "Starting photos", state: onboarding.phases.photos ? "done" : "pending", subtext: onboarding.phases.photos ? "All angles in" : "Front/side/back needed" },
    ];

    return (
      <CoachShell>
        <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 900 }}>
          <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
            ‹ Back to Nutrition
          </Link>
          <View className="mb-1 flex-row items-center gap-3">
            <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              {client.name}
            </Text>
            <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: "#f4ede3" }}>
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#8a5a2e" }}>
                Onboarding
              </Text>
            </View>
          </View>
          <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            {client.email} · started {formatDateMDY(client.start_date)}
          </Text>

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
                  onboarding.phases.tracking
                    ? "All days logged — tap to view"
                    : onboarding.trackingCount === 0
                      ? "No dates assigned"
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

          {onboarding.phases.readyForReview ? (
            <Pressable
              onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/approve`)}
              className="mt-5 items-center self-start rounded-lg px-5 py-3"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                Approve & Set Targets
              </Text>
            </Pressable>
          ) : null}

          {/* Tracking dates aren't assigned during a coach-run draft stage
              here (Kova has no client_drafts) — the Objective Tracking phase
              card links straight to the assignment UI on its own page. */}
        </ScrollView>
      </CoachShell>
    );
  }

  const currentTarget = targets[0] ?? null;
  const { currentWeek, lastWeek } = computeWeekWindows(today);
  const thisWeekSummary = summarizeWeek(logs, currentWeek.start, currentWeek.end);
  const lastWeekSummary = summarizeWeek(logs, lastWeek.start, lastWeek.end);
  const selectedWeekSummary = summarizeWeek(logs, selectedWeek.start, selectedWeek.end);
  const priorToSelectedEnd = addDays(selectedWeek.start, -1);
  const priorToSelectedStart = addDays(priorToSelectedEnd, -6);
  const priorToSelectedSummary = summarizeWeek(logs, priorToSelectedStart, priorToSelectedEnd);

  const recentWeeks = enumerateRecentWeeks(currentWeek, addDays, WEEKS_SHOWN).map((w) => ({
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

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 1000 }}>
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Nutrition
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          {client.name}
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          {client.email}
        </Text>

        <TabBar active={tab} onSelect={setTab} />

        {tab === "dashboard" && (
          <View>
            <SectionCard title="This week at a glance">
              <TrendTiles thisWeek={thisWeekSummary} lastWeek={lastWeekSummary} />
            </SectionCard>

            <View style={{ flexDirection: isWeb ? "row" : "column", gap: 20 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Current target">
                  {currentTarget ? (
                    <Text style={{ fontFamily: fonts.sans }}>
                      {Math.round(deriveCalories(currentTarget))} cal — P {currentTarget.protein_g}g / C {currentTarget.carb_g}g / F{" "}
                      {currentTarget.fat_g}g / Fiber {currentTarget.fiber_g}g
                      {currentTarget.step_goal ? ` · ${currentTarget.step_goal} steps` : ""}
                    </Text>
                  ) : (
                    <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                      No target set yet.
                    </Text>
                  )}
                </SectionCard>
                <SectionCard title="Focus items">
                  <FocusChecklist userId={userId} items={focusItems} onChanged={load} />
                </SectionCard>
                <SectionCard title="Game plan">
                  <GamePlan userId={userId} initialGamePlan={client.game_plan} />
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
          <SectionCard title="Weekly averages">
            <WeekList weeks={recentWeeks} />
          </SectionCard>
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
              <Pressable onPress={() => setWeekOffset((o) => o + 1)}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Prior week</Text>
              </Pressable>
              <Text style={{ fontFamily: fonts.sansSemiBold }}>
                Week of {formatDateMDY(selectedWeek.start)}
              </Text>
              <Pressable onPress={() => setWeekOffset((o) => Math.max(0, o - 1))} disabled={weekOffset === 0}>
                <Text style={{ fontFamily: fonts.sansMedium, color: weekOffset === 0 ? "#d6d3d1" : colors.primaryOnWhite }}>Next week ›</Text>
              </Pressable>
            </View>

            <SectionCard title="This week's snapshot">
              <WeeklySnapshot thisWeek={selectedWeekSummary} lastWeek={priorToSelectedSummary} />
            </SectionCard>

            <SectionCard
              title="Check-in answers"
              headerRight={
                <Pressable onPress={handleCopyQuestions} disabled={copying} hitSlop={10}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    {copying ? "Copying…" : "Copy questions from template"}
                  </Text>
                </Pressable>
              }
            >
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
                  <Pressable
                    onPress={handleFinalizeCheckin}
                    disabled={finalizing || !!checkin.finalized_at}
                    className="mt-2 items-center rounded-lg border py-3 disabled:opacity-50"
                    style={{ borderColor: colors.primary }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primary }}>
                      {checkin.finalized_at ? "Finalized ✓" : finalizing ? "Finalizing…" : "Finalize Check-In"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Not submitted yet this week.
                </Text>
              )}
            </SectionCard>
          </View>
        )}

        {tab === "photos" && (
          <View>
            <SectionCard title="Photo requirements">
              <PhotoRequirementControls userId={userId} client={client} onChanged={load} />
            </SectionCard>

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
              <NewTargetForm userId={userId} setBy={profile.id} onSaved={load} />
            </SectionCard>
            <SectionCard title="Target history">
              <TargetsHistory history={targets} />
            </SectionCard>
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
