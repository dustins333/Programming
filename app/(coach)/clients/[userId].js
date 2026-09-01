import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { core } from "../../../lib/supabase/client";
import { getUser, listCoaches, listAssignmentsForUser, addGroupMembership, removeGroupMembership, setMembershipSessionsPerWeek } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getCurrentBlock } from "../../../lib/programming/memberPlan";
import { currentWeekNumber, blockLengthWeeks } from "../../../lib/programming/schedule";
import { getMissedSessionFlagsByUser } from "../../../lib/programming/flags";
import { getClientGoal } from "../../../lib/programming/clientGoals";
import { ClientGoalCard } from "../../../components/ClientGoalCard";
import { getSpcClient, assignSpcClient, setSpcStatus, updateSpcClient, isSpcActive, isSpcEnrolled } from "../../../lib/programming/spcClients";
import { getCurrentSpcBlock } from "../../../lib/programming/spcBlocks";
import { getClient as getNutritionClient, createOrReactivateClient, setClientStatus as setNutritionStatus } from "../../../lib/nutrition/clients";
import { listTemplates } from "../../../lib/programming/templates";
import { listOneOffWorkoutsForUser, createOneOffFromTemplate, deleteOneOffWorkout } from "../../../lib/programming/oneOffWorkouts";
import { listCompletedOneOffWorkoutIds } from "../../../lib/programming/sessionCompletions";
import { listRecentSessionsForUser, listUpcomingSessionsForUser } from "../../../lib/programming/coachLogs";
import { listMessages, sendStaffMessage } from "../../../lib/programming/messages";
import { getMessagingSettings, deriveMessagingScopes, matchesMessagingAudience } from "../../../lib/programming/messagingSettings";
import { sendPush } from "../../../lib/notifications/sendPush";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { StatusBadge } from "../../../components/StatusBadge";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { AssignOneOffModal } from "../../../components/AssignOneOffModal";
import { RecentSessionsCard } from "../../../components/RecentSessionsCard";
import { UpcomingSessionsCard } from "../../../components/UpcomingSessionsCard";
import { MessageThread } from "../../../components/MessageThread";
import { CoachMessageBubble } from "../../../components/CoachMessageBubble";
import { CoachShell } from "../../../components/CoachShell";
import { ClientNotesCard } from "../../../components/ClientNotesCard";
import { ClientLimitationsCard } from "../../../components/ClientLimitationsCard";
import { ProgrammingCard, NutritionCard } from "../../../components/ClientSnapshotCards";
import {
  listClientNotes,
  addClientNote,
  updateClientNote,
  deleteClientNote,
  listClientLimitations,
  addClientLimitation,
  deleteClientLimitation,
} from "../../../lib/programming/clientNotes";
import { getClientNutritionSnapshot } from "../../../lib/nutrition/clientSnapshot";
import { getExerciseStats } from "../../../lib/programming/exerciseStats";
import { formatDateMDY } from "../../../lib/formatDate";
import { toastError } from "../../../lib/toast";
import { confirmRemoveOneOff, confirmArchiveNutritionClient, confirmDelete, confirmRemoveGroupMembership } from "../../../lib/confirmDialog";
import { SPC_ENROLLMENT_LABELS, SPC_ENROLLMENT_TONES } from "../../../lib/programming/spcState";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_TONES = { active: "onTrack", paused: "paused", archived: "paused" };
const NUTRITION_STATUS_LABELS = { active: "Active", paused: "Paused", archived: "Archived" };
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const isWeb = Platform.OS === "web";

// (name ?? "") — a core.users row linked by an admin can genuinely have a
// null name until that person registers, and an unguarded .trim() here
// white-screened the whole row/page.
function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({ children, style }) {
  return (
    <View className="mb-4 rounded-2xl border bg-white p-5" style={[{ borderColor: "#ece7e1" }, CARD_SHADOW, style]}>
      {children}
    </View>
  );
}

function SettingsCard({ icon, title, children, headerRight }) {
  return (
    <Card>
      <View className="mb-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <Ionicons name={icon} size={16} color="#44403c" />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14 }} className="text-stone-700">
            {title}
          </Text>
        </View>
        {headerRight}
      </View>
      {children}
    </Card>
  );
}

function ViewLink({ label, onPress }) {
  return (
    <Pressable onPress={onPress} className="mt-3 flex-row items-center gap-1 self-start">
      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

// design_handoff_coach_web_v2 screen 13 — "your four". Four equal cards on
// a wide screen, stacking to one column below 1100px (a 4-up row of cards
// this dense is unreadable narrower than that, and the installed PWA on a
// phone is still a web build). Replaces the old two-panel SnapshotPanel.
function SnapshotRow({ wide, children }) {
  return (
    <View style={wide ? { flexDirection: "row", gap: 16, marginBottom: 16 } : undefined}>
      {children.map((child, i) => (
        // flex:1 on the column stretches it to the tallest sibling, but the
        // Card inside has to claim that height too or it sits short with a
        // gap under it — the columns are equal, the cards weren't.
        <View key={i} style={wide ? { flex: 1 } : undefined}>
          <Card style={wide ? { flex: 1, marginBottom: 0 } : undefined}>{child}</Card>
        </View>
      ))}
    </View>
  );
}

const DETAIL_TABS = [
  { key: "history", label: "Training history" },
  { key: "progress", label: "Lift progress" },
  { key: "upcoming", label: "Upcoming" },
  { key: "programs", label: "Programs" },
  { key: "messages", label: "Messages" },
];

function TabBar({ active, onSelect, tabs }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 border-b border-stone-200">
      <View className="flex-row">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <Pressable
              key={t.key}
              onPress={() => onSelect(t.key)}
              className="mr-6 pb-3"
              style={isActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : undefined}
            >
              <Text style={{ fontFamily: isActive ? fonts.sansSemiBold : fonts.sansMedium, color: isActive ? colors.primaryOnWhite : "#78716c", fontSize: 14 }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Every lift this client has ever logged, heaviest-recent first. Built off
// the same getExerciseStats the member's own My History uses, so the PR
// rule (3 sessions before eligible, then any increase) can't disagree
// between what she sees and what her coach sees.
function LiftProgressTab({ stats, error, onRetry }) {
  if (error) {
    return (
      <View>
        <Text className="text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Couldn't load lift progress: {error}
        </Text>
        <Pressable onPress={onRetry} className="mt-2 self-start" hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!stats) return <ActivityIndicator color={colors.primary} />;
  if (stats.exercises.length === 0) {
    return (
      <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
        Nothing logged yet — this fills in as they record sets.
      </Text>
    );
  }

  const prCountByExercise = new Map();
  for (const pr of stats.personalRecords) prCountByExercise.set(pr.exerciseId, (prCountByExercise.get(pr.exerciseId) ?? 0) + 1);
  const rows = [...stats.exercises].sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));

  return (
    <View>
      <View className="flex-row items-center border-b px-1 pb-2" style={{ borderBottomColor: "#ece7e1" }}>
        <Text className="flex-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
          Lift
        </Text>
        {["Last", "Best", "Sessions", "PRs"].map((h) => (
          <Text key={h} className="text-right text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 92 }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row) => {
        const prs = prCountByExercise.get(row.exercise.id) ?? 0;
        return (
          <View key={row.exercise.id} className="flex-row items-center border-b px-1 py-2.5" style={{ borderBottomColor: "#f5f2ee" }}>
            <View className="flex-1 pr-3">
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#44403c" }} numberOfLines={1}>
                {row.exercise.name}
              </Text>
              <Text className="mt-0.5 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
                {formatDateMDY(row.lastDate)}
                {row.jump != null && row.jump > 0 ? ` · up ${row.jump} lb recently` : ""}
              </Text>
            </View>
            <Text className="text-right text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 13, width: 92 }}>
              {row.lastWeight != null ? `${row.lastWeight} lb` : "—"}
              {row.lastReps != null ? ` × ${row.lastReps}` : ""}
            </Text>
            <Text className="text-right" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c", width: 92 }}>
              {row.best != null ? `${row.best} lb` : "—"}
            </Text>
            <Text className="text-right text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13, width: 92 }}>
              {row.sessionCount}
            </Text>
            <View style={{ width: 92, alignItems: "flex-end" }}>
              {prs > 0 ? (
                <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: "#eef1e7" }}>
                  <Text style={{ fontFamily: fonts.sansBold, color: "#4d6142", fontSize: 10.5 }}>
                    {prs} PR{prs === 1 ? "" : "s"}
                  </Text>
                </View>
              ) : (
                <Text className="text-stone-300" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                  —
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function ClientProfile() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [member, setMember] = useState(null);
  const [goalRow, setGoalRow] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [currentBlocksByProgramId, setCurrentBlocksByProgramId] = useState({});
  const [missedFlags, setMissedFlags] = useState([]);
  const [spcClient, setSpcClient] = useState(null);
  const [currentSpcBlock, setCurrentSpcBlock] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  // Per-module fetch errors — an SPC/Nutrition failure renders inline in its
  // own card instead of blanking the whole profile. The enrollment Switch is
  // withheld while errored: a silently-null row would read as "Not enrolled"
  // and invite a wrong toggle (re-enroll side effects) on a client who's
  // actually enrolled.
  const [spcError, setSpcError] = useState(null);
  const [nutritionError, setNutritionError] = useState(null);
  const [oneOffs, setOneOffs] = useState([]);
  const [completedOneOffIds, setCompletedOneOffIds] = useState(new Set());
  const [templates, setTemplates] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [upcomingErrors, setUpcomingErrors] = useState([]);
  const [messages, setMessages] = useState(null);
  const [messagesError, setMessagesError] = useState(null);
  const [messagingSettings, setMessagingSettings] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Handed to the Messages card so its compose box can scroll itself above
  // the keyboard on focus — this page is one long ScrollView of cards.
  // scrollOffsetRef is tracked here since RN has no synchronous way to read
  // a ScrollView's current offset. See lib/scrollToKeyboard.js.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const [lastSignInAt, setLastSignInAt] = useState(undefined);
  // Screen 13's four cards + tabs. Each of these is its own isolated fetch
  // for the same reason SPC/Nutrition already are on this page: an unrun
  // migration or a transient failure in one must not blank the profile.
  const [notes, setNotes] = useState(null);
  const [notesError, setNotesError] = useState(null);
  const [limitations, setLimitations] = useState(null);
  const [limitationsError, setLimitationsError] = useState(null);
  const [nutritionSnapshot, setNutritionSnapshot] = useState(null);
  const [nutritionSnapshotError, setNutritionSnapshotError] = useState(null);
  const [liftStats, setLiftStats] = useState(null);
  const [liftStatsError, setLiftStatsError] = useState(null);
  const [tab, setTab] = useState("history");

  const loadNotes = useCallback(async () => {
    try {
      setNotesError(null);
      setNotes(await listClientNotes(userId));
    } catch (err) {
      setNotesError(err.message ?? String(err));
    }
  }, [userId]);

  const loadLimitations = useCallback(async () => {
    try {
      setLimitationsError(null);
      setLimitations(await listClientLimitations(userId));
    } catch (err) {
      setLimitationsError(err.message ?? String(err));
    }
  }, [userId]);

  const loadLiftStats = useCallback(async () => {
    try {
      setLiftStatsError(null);
      setLiftStats(await getExerciseStats(userId));
    } catch (err) {
      setLiftStatsError(err.message ?? String(err));
    }
  }, [userId]);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      // SPC and Nutrition are fetched via allSettled, isolated from the core
      // programming fetches — a failure in one module (e.g. an unrun
      // migration) shouldn't take down the whole profile. See
      // spcError/nutritionError above for how a failure renders.
      const [memberRow, assignmentRows, programRows, oneOffRows, completedIds, templateRows] = await Promise.all([
        getUser(userId),
        listAssignmentsForUser(userId),
        listGroupPrograms(),
        listOneOffWorkoutsForUser(userId),
        listCompletedOneOffWorkoutIds(userId),
        listTemplates(),
      ]);
      setMember(memberRow);

      const [spcResult, nutritionResult, goalResult] = await Promise.allSettled([
        getSpcClient(userId),
        getNutritionClient(userId),
        getClientGoal(userId),
      ]);
      // Isolated for the same reason as the two above, plus: this throws
      // until 0078 is run, and a goal must never blank the page.
      setGoalRow(goalResult.status === "fulfilled" ? goalResult.value : null);
      if (spcResult.status === "fulfilled") {
        setSpcClient(spcResult.value);
        setSpcError(null);
        // Own try/catch — the block is only needed for the Programming
        // card's week counter, and a failure there shouldn't surface as
        // "SPC failed to load" on the enrollment card.
        try {
          setCurrentSpcBlock(spcResult.value ? await getCurrentSpcBlock(userId) : null);
        } catch {
          setCurrentSpcBlock(null);
        }
      } else {
        setSpcError(spcResult.reason?.message ?? String(spcResult.reason));
      }
      if (nutritionResult.status === "fulfilled") {
        setNutritionClient(nutritionResult.value);
        setNutritionError(null);
      } else {
        setNutritionError(nutritionResult.reason?.message ?? String(nutritionResult.reason));
      }

      // Staff-only, reads auth.users.last_sign_in_at (migration 0022) — real
      // account-level signal for "has this person ever actually opened the
      // app," independent of which module (Programming/SPC/Nutrition)
      // they're using it for. Own try/catch so a failure here (e.g.
      // migration not run yet) doesn't take down the whole page.
      try {
        const { data: loginRows, error: loginError } = await core.rpc("get_login_activity", { user_ids: [userId] });
        if (loginError) throw loginError;
        setLastSignInAt(loginRows?.[0]?.last_sign_in_at ?? null);
      } catch {
        setLastSignInAt(null);
      }
      setAssignments(assignmentRows);
      setPrograms(programRows);
      setOneOffs(oneOffRows);
      setCompletedOneOffIds(completedIds);
      setTemplates(templateRows);

      const blocks = await Promise.all(assignmentRows.map((a) => getCurrentBlock(a.group_program_id)));
      const blocksByProgramId = {};
      assignmentRows.forEach((a, i) => {
        blocksByProgramId[a.group_program_id] = blocks[i];
      });
      setCurrentBlocksByProgramId(blocksByProgramId);

      try {
        const flagsByUser = await getMissedSessionFlagsByUser();
        setMissedFlags(flagsByUser.get(userId) ?? []);
      } catch {
        setMissedFlags([]);
      }

      // Own try/catch, same isolation as flags above — a client with no
      // finalized sessions yet (or a transient failure) shouldn't take
      // down the rest of the profile.
      try {
        setRecentSessions(await listRecentSessionsForUser(userId));
      } catch {
        setRecentSessions([]);
      }

      // Same isolation — Upcoming is derived live from every membership's
      // current block, so it touches more moving parts than any other
      // fetch on this page and must not be able to take the page down.
      try {
        const upcoming = await listUpcomingSessionsForUser(userId);
        setUpcomingSessions(upcoming.sessions);
        setUpcomingErrors(upcoming.errors);
      } catch (err) {
        setUpcomingSessions([]);
        setUpcomingErrors([{ module: "Upcoming sessions", message: err.message ?? String(err) }]);
      }

      try {
        setCoaches(await listCoaches());
      } catch {
        setCoaches([]);
      }

      // Admin kill switch/audience (lib/programming/messagingSettings.js) —
      // gates the Messages card below. Isolated the same way, defaults to
      // hidden on failure.
      try {
        setMessagingSettings(await getMessagingSettings());
      } catch (err) {
        console.error("Failed to load messaging settings:", err);
        setMessagingSettings({ enabled: false, audience: [] });
      }

      // Isolated the same way — migration 0032 might not be run yet on a
      // given environment, and a client with a broken thread shouldn't
      // block the rest of the profile from loading.
      try {
        setMessagesError(null);
        setMessages(await listMessages(userId));
      } catch (err) {
        setMessagesError(err.message ?? String(err));
      }

      await Promise.all([loadNotes(), loadLimitations(), loadLiftStats()]);

      // Only worth a query once nutrition is actually on for them — the
      // card renders "Not enrolled" without one.
      if (nutritionResult.status === "fulfilled" && nutritionResult.value?.status === "active") {
        try {
          setNutritionSnapshotError(null);
          setNutritionSnapshot(await getClientNutritionSnapshot(userId));
        } catch (err) {
          setNutritionSnapshotError(err.message ?? String(err));
        }
      } else {
        setNutritionSnapshot(null);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId, loadNotes, loadLimitations, loadLiftStats]);

  // useFocusEffect, not mount-only — pushing into a builder/SPC/nutrition
  // screen and popping back would otherwise show stale enrollment/flags,
  // same reasoning as blocks/[blockId].js and spc/[userId].js.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // A client can hold several memberships at once now (e.g. Flagship plus
  // a specialty program), so this toggles one specific program's
  // membership on/off rather than picking a single mutually-exclusive
  // program.
  const handleToggleMembership = async (groupProgramId, enrolled, programName) => {
    if (!enrolled && !(await confirmRemoveGroupMembership(programName))) return;
    try {
      if (enrolled) {
        await addGroupMembership(userId, groupProgramId);
      } else {
        await removeGroupMembership(userId, groupProgramId);
      }
      await load();
    } catch (err) {
      toastError("Failed to update group program", err);
    }
  };

  const handleFrequencySelect = async (groupProgramId, sessionsPerWeek) => {
    try {
      await setMembershipSessionsPerWeek(userId, groupProgramId, sessionsPerWeek);
      await load();
    } catch (err) {
      toastError("Failed to update session frequency", err);
    }
  };

  // Two different questions, and conflating them is what put switched-off
  // clients on the SPC roster labelled "Paused" (0108). `spcEnrolled` drives
  // the switch and everything under it — a paused client is still an SPC
  // client. `spcActive` is "training right now", which is what the membership
  // pill, the block row and the weekly target should count.
  const spcEnrolled = isSpcEnrolled(spcClient);
  const spcActive = isSpcActive(spcClient);
  const handleSpcToggle = async (enrolled) => {
    try {
      if (!enrolled) {
        // 'inactive', not 'paused': switching SPC off here means she is no
        // longer an SPC client and should leave the SPC list. Pausing is a
        // deliberate, separate choice made on her SPC page.
        await setSpcStatus(userId, "inactive");
      } else if (spcClient) {
        await setSpcStatus(userId, "active");
      } else {
        await assignSpcClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      toastError("Failed to update SPC status", err);
    }
  };

  // SPC runs 1-4x a week (its own page offers the same four), unlike a
  // group program's 1-3x — SPC has no shared day-of-week calendar capping
  // how many sessions a week can hold.
  const handleSpcFrequencySelect = async (sessionsPerWeek) => {
    try {
      await updateSpcClient(userId, { sessions_per_week: sessionsPerWeek });
      await load();
    } catch (err) {
      toastError("Failed to update SPC session frequency", err);
    }
  };

  const nutritionActive = nutritionClient?.status === "active";
  const handleNutritionToggle = async (enrolled) => {
    try {
      if (!enrolled) {
        // Archived, not just paused — this is the coarse "turn nutrition
        // off" switch, and per explicit product decision that should move
        // them off the main nutrition roster into the Archived list (still
        // pullable, not deleted) rather than leaving them sitting in the
        // active roster tagged "Paused". The Client Settings modal still
        // offers a real Paused option for a finer-grained "temporarily off"
        // case that doesn't archive them.
        const proceed = await confirmArchiveNutritionClient(member.name);
        if (!proceed) return;
        await setNutritionStatus(userId, "archived");
      } else {
        // Existing public.clients row (a real standalone-app client) just
        // gets reactivated; a brand-new-to-nutrition member gets a fresh
        // row and lands in onboarding. See lib/nutrition/clients.js.
        await createOrReactivateClient({
          userId,
          name: member.name,
          email: member.email,
          phone: member.phone,
        });
      }
      await load();
    } catch (err) {
      toastError("Failed to update nutrition status", err);
    }
  };

  const handleAssignOneOff = async (template) => {
    try {
      await createOneOffFromTemplate({ userId, templateId: template.id, templateName: template.name, assignedBy: profile.id });
      await load();
    } catch (err) {
      toastError("Failed to assign one-off workout", err);
    }
  };

  const handleDeleteOneOff = async (oneOff) => {
    const proceed = await confirmRemoveOneOff(oneOff.title);
    if (!proceed) return;
    try {
      await deleteOneOffWorkout(oneOff.id);
      await load();
    } catch (err) {
      toastError("Failed to remove one-off workout", err);
    }
  };

  const loadMessages = useCallback(async () => {
    try {
      setMessagesError(null);
      setMessages(await listMessages(userId));
    } catch (err) {
      setMessagesError(err.message ?? String(err));
    }
  }, [userId]);

  const handleSendMessage = async (body) => {
    await sendStaffMessage(userId, profile.id, body);
    await loadMessages();
    // Fire-and-report, not fire-and-forget — matches the announcement
    // send's own pattern (see announcements/index.js's handleSend): the
    // message itself is already posted either way, a failed push here
    // shouldn't look like the send itself failed. Gated on the member's
    // own notify_coach_messages preference (0020), same as the scanning
    // Edge Functions check it for their own reminder types — this is just
    // a real-time send instead of a cron scan, so the check happens here.
    if (member?.notify_coach_messages !== false) {
      try {
        await sendPush({ userId, title: "Message from your coach", body });
      } catch (err) {
        console.error("Push send failed (message was still posted):", err);
      }
    }
  };

  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));
  // Gates the inline Messages card below — reuses the assignments/spcActive/
  // nutritionActive already loaded/computed on this page instead of a
  // second scope-resolving fetch (unlike CoachMessageBubble, which is
  // self-contained and does its own).
  const messagingScopes = deriveMessagingScopes({
    groupProgramIds: assignments.map((a) => a.group_program_id),
    spcActive,
    nutritionActive,
  });
  const messagingEnabled = Boolean(
    messagingSettings && messagingSettings.enabled && matchesMessagingAudience(messagingSettings.audience, messagingScopes)
  );

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!member) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const today = todayInBoise();
  const blockRows = assignments
    .map((a) => {
      const block = currentBlocksByProgramId[a.group_program_id];
      if (!block) return null;
      const totalWeeks = blockLengthWeeks(block, a.group_programs) ?? 1;
      return {
        programId: a.group_program_id,
        programName: a.group_programs?.name ?? "Group program",
        weekNum: currentWeekNumber(block.block_start_date, totalWeeks, today),
        totalWeeks,
      };
    })
    .filter(Boolean);

  // SPC belongs in here too. Leaving it out meant an SPC-only client — who
  // has no group membership at all — read "No active block right now" on a
  // page that was simultaneously linking to their live SPC block. Real
  // case: Bob, SPC-only, mid-week-1 of a published 4-week block.
  if (spcActive && currentSpcBlock) {
    blockRows.push({
      programId: `spc-${currentSpcBlock.id}`,
      programName: "SPC",
      weekNum: currentWeekNumber(currentSpcBlock.block_start_date, currentSpcBlock.block_length_weeks, today),
      totalWeeks: currentSpcBlock.block_length_weeks,
      href: `/(coach)/spc/${userId}`,
    });
  }

  // Group memberships link to that program's calendar (pre-filtered), SPC
  // to their SPC page, Nutrition to their nutrition record.
  const membershipPills = [
    ...assignments.map((a) => ({
      key: a.group_program_id,
      label: a.group_programs?.name ?? "Group",
      href: `/(coach)/blocks?program=${a.group_program_id}`,
      bg: "#eef1e7",
      text: "#4d6142",
    })),
    ...(spcActive ? [{ key: "spc", label: "SPC", href: `/(coach)/spc/${userId}`, bg: "#eef1e7", text: "#4d6142" }] : []),
    ...(nutritionActive
      ? [{ key: "nutrition", label: "Nutrition", href: `/(coach)/nutrition/clients/${userId}`, bg: "#fdf6f2", text: colors.primaryOnWhite }]
      : []),
  ];

  const weekStart = addDays(today, dayOfWeekInBoise(today) === 0 ? -6 : 1 - dayOfWeekInBoise(today));
  const weekCompleted = recentSessions.filter((s) => s.date >= weekStart).length;
  const weeklyTarget =
    assignments.reduce((sum, a) => sum + (a.sessions_per_week ?? 3), 0) + (spcActive ? spcClient?.sessions_per_week ?? 0 : 0);
  const wideCards = isWeb && width >= 1100;
  const visibleTabs = DETAIL_TABS.filter((t) => t.key !== "messages" || messagingEnabled);

  const handleAddNote = async (body) => {
    try {
      await addClientNote(userId, profile.id, body);
      await loadNotes();
    } catch (err) {
      toastError("Failed to save note", err);
    }
  };

  const handleTogglePin = async (note) => {
    try {
      await updateClientNote(note.id, { pinned: !note.pinned });
      await loadNotes();
    } catch (err) {
      toastError("Failed to update note", err);
    }
  };

  const handleDeleteNote = async (note) => {
    if (!(await confirmDelete("Delete this note? It can't be recovered.", "Delete note?"))) return;
    try {
      await deleteClientNote(note.id);
      await loadNotes();
    } catch (err) {
      toastError("Failed to delete note", err);
    }
  };

  const handleAddLimitation = async (fields) => {
    try {
      await addClientLimitation(userId, profile.id, fields);
      await loadLimitations();
    } catch (err) {
      toastError("Failed to add limitation", err);
    }
  };

  const handleDeleteLimitation = async (lim) => {
    if (!(await confirmDelete(`Remove "${lim.area} · ${lim.guidance}"?`, "Remove limitation?"))) return;
    try {
      await deleteClientLimitation(lim.id);
      await loadLimitations();
    } catch (err) {
      toastError("Failed to remove limitation", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{ backgroundColor: "#faf8f6" }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: wideCards ? 1240 : 900 }}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/clients"))}
          style={{ marginBottom: 18 }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>‹ Back</Text>
        </Pressable>

        <View className="mb-6 flex-row flex-wrap items-start gap-3.5">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 52, height: 52, backgroundColor: "#fdf6f2" }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: colors.primaryOnWhite }}>
              {initials(member.name)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <View className="flex-row flex-wrap items-center gap-2.5">
              <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 22 }}>
                {member.name}
              </Text>
              {/* Same membership pills the roster row shows, but each one is
                  a real link to that module's page for this client — the
                  roster tells you what they're on, this tells you and takes
                  you there. */}
              {membershipPills.map((pill) => (
                <Pressable
                  key={pill.key}
                  onPress={() => router.push(pill.href)}
                  className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: pill.bg }}
                  hitSlop={4}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: pill.text, fontSize: 11.5 }}>{pill.label}</Text>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: pill.text, fontSize: 11.5 }}>›</Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              {member.email}
              {member.phone ? ` · ${member.phone}` : ""}
            </Text>
            {/* No resend-invite action here on purpose. Registration is
                phone-OTP now (app/(auth)/register.js — they tap Register,
                type their email, and get a code texted via GHL), so there
                is no email for a coach to re-send. This line stays as the
                signal to walk them through Register in person. */}
            {lastSignInAt === null ? (
              <Text className="mt-1 text-xs" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
                Never signed in
              </Text>
            ) : null}
          </View>

          {/* The one card the client sees too — same graphic here as on the
              SPC page and at the top of the session they log. Coach-private
              notes are NOT stacked here the way they are on the SPC page:
              this page already has its own Notes card (client_notes, 0057)
              further down, and notes_goals_feedback is SPC-only. */}
          <ClientGoalCard
            goal={goalRow?.goal}
            userId={userId}
            clientName={member.name}
            editable
            editorId={profile?.id}
            onSaved={setGoalRow}
            style={{ width: 340, flexGrow: 1, flexShrink: 0, minWidth: 280 }}
          />
        </View>

        <SnapshotRow wide={wideCards}>
          {[
            <ProgrammingCard
              key="programming"
              blockRows={blockRows}
              flags={missedFlags}
              lastSession={recentSessions[0] ?? null}
              weekCompleted={weekCompleted}
              weeklyTarget={weeklyTarget}
              hasProgram={assignments.length > 0 || spcActive}
              onOpenBlock={(row) => router.push(row.href ?? `/(coach)/blocks?program=${row.programId}`)}
            />,
            <NutritionCard
              key="nutrition"
              enrolled={nutritionActive}
              snapshot={nutritionSnapshot}
              error={nutritionSnapshotError}
              onReview={(tab) => router.push(`/(coach)/nutrition/clients/${userId}${tab ? `?tab=${tab}` : ""}`)}
              onRetry={load}
            />,
            <View key="notes">
              <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.55 }}>
                Your notes
              </Text>
              <ClientNotesCard
                notes={notes}
                error={notesError}
                coachNameById={coachNameById}
                currentUserId={profile?.id}
                onAdd={handleAddNote}
                onTogglePin={handleTogglePin}
                onDelete={handleDeleteNote}
                onRetry={loadNotes}
              />
            </View>,
            <View key="limitations">
              <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.55 }}>
                Limitations
              </Text>
              <ClientLimitationsCard
                limitations={limitations}
                error={limitationsError}
                onAdd={handleAddLimitation}
                onDelete={handleDeleteLimitation}
                onRetry={loadLimitations}
              />
            </View>,
          ]}
        </SnapshotRow>

        <TabBar active={tab} onSelect={setTab} tabs={visibleTabs} />

        {tab === "programs" ? (
        <>
        <SettingsCard icon="barbell-outline" title="Group programs">
          {programs.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              No group programs exist yet — create one from the Group Programs tab.
            </Text>
          ) : (
            programs.map((program) => {
              const membership = assignments.find((a) => a.group_program_id === program.id);
              const enrolled = !!membership;
              const block = currentBlocksByProgramId[program.id];
              return (
                <View key={program.id} className="mb-2.5 overflow-hidden rounded-xl border" style={{ borderColor: enrolled ? "#dbe8cf" : "#ece7e1" }}>
                  <View
                    className="flex-row items-center justify-between px-3.5 py-3"
                    style={enrolled ? { borderBottomWidth: 1, borderBottomColor: "#f0ede8" } : undefined}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <Switch
                        value={enrolled}
                        onValueChange={(v) => handleToggleMembership(program.id, v, program.name)}
                        trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                        thumbColor="#ffffff"
                      />
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                        {program.name}
                      </Text>
                    </View>
                    {enrolled ? (
                      block ? (
                        <Pressable onPress={() => router.push(`/(coach)/blocks?program=${program.id}`)}>
                          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                            View current block ›
                          </Text>
                        </Pressable>
                      ) : (
                        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                          No active block
                        </Text>
                      )
                    ) : null}
                  </View>
                  {enrolled ? (
                    <View className="px-3.5 py-3" style={{ backgroundColor: "#faf8f6" }}>
                      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                        Frequency
                      </Text>
                      <View style={{ maxWidth: 220 }}>
                        <SegmentedControl
                          segments={[
                            { key: "1", label: "1x" },
                            { key: "2", label: "2x" },
                            { key: "3", label: "3x" },
                          ]}
                          activeKey={String(membership.sessions_per_week ?? 3)}
                          onSelect={(key) => handleFrequencySelect(program.id, Number(key))}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </SettingsCard>

        <View style={{ flexDirection: isWeb ? "row" : "column", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <SettingsCard
              icon="clipboard-outline"
              title="SPC"
              headerRight={spcEnrolled ? <StatusBadge tone={SPC_ENROLLMENT_TONES[spcClient.status]} label={SPC_ENROLLMENT_LABELS[spcClient.status]} /> : null}
            >
              {spcError ? (
                <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
                  Couldn't load SPC status: {spcError}
                </Text>
              ) : (
                <>
                  <View className="flex-row items-center gap-3">
                    <Switch
                      value={spcEnrolled}
                      onValueChange={handleSpcToggle}
                      trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                      thumbColor="#ffffff"
                    />
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {spcEnrolled ? "Enrolled" : "Not enrolled"}
                    </Text>
                  </View>
                  {spcEnrolled ? (
                    <View className="mt-3 rounded-lg px-3.5 py-3" style={{ backgroundColor: "#faf8f6" }}>
                      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                        Frequency
                      </Text>
                      <View style={{ maxWidth: 260 }}>
                        <SegmentedControl
                          segments={[1, 2, 3, 4].map((n) => ({ key: String(n), label: `${n}x` }))}
                          activeKey={String(spcClient?.sessions_per_week ?? 2)}
                          onSelect={(key) => handleSpcFrequencySelect(Number(key))}
                        />
                      </View>
                    </View>
                  ) : null}
                  {spcEnrolled ? <ViewLink label="View SPC program ›" onPress={() => router.push(`/(coach)/spc/${userId}`)} /> : null}
                </>
              )}
            </SettingsCard>
          </View>

          <View style={{ flex: 1 }}>
            <SettingsCard
              icon="restaurant-outline"
              title="Nutrition"
              headerRight={
                nutritionClient ? (
                  <StatusBadge
                    tone={NUTRITION_TONES[nutritionClient.status] ?? "paused"}
                    label={NUTRITION_STATUS_LABELS[nutritionClient.status] ?? "Paused"}
                  />
                ) : null
              }
            >
              {nutritionError ? (
                <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
                  Couldn't load nutrition status: {nutritionError}
                </Text>
              ) : (
                <>
                  <View className="flex-row items-center gap-3">
                    <Switch
                      value={nutritionActive}
                      onValueChange={handleNutritionToggle}
                      trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                      thumbColor="#ffffff"
                    />
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {nutritionClient ? "Enrolled" : "Not enrolled"}
                    </Text>
                  </View>
                  {nutritionClient ? (
                    <ViewLink label="View nutrition dashboard ›" onPress={() => router.push(`/(coach)/nutrition/clients/${userId}`)} />
                  ) : null}
                </>
              )}
            </SettingsCard>
          </View>
        </View>

        <SettingsCard icon="add-circle-outline" title="One-off workouts">
          {oneOffs.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
              None assigned — away workouts or trial sessions show up here and in the client's My Fitness tab.
            </Text>
          ) : (
            oneOffs.map((oneOff) => {
              const completed = completedOneOffIds.has(oneOff.id);
              return (
                <View key={oneOff.id} className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
                  <View className="flex-1">
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {oneOff.title}
                    </Text>
                    <Text className="text-xs" style={{ fontFamily: fonts.sans, color: completed ? "#4d6142" : "#a8a29e" }}>
                      {completed ? "✓ Completed" : oneOff.status === "published" ? "Not yet completed" : "Draft"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteOneOff(oneOff)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={`Remove one-off workout ${oneOff.title}`}
                  >
                    <Text className="text-stone-400">✕</Text>
                  </Pressable>
                </View>
              );
            })
          )}
          <Pressable
            onPress={() => setAssignModalVisible(true)}
            className="mt-3 self-start rounded-lg px-4 py-2.5"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              + Assign one-off
            </Text>
          </Pressable>
        </SettingsCard>
        </>
        ) : null}

        {tab === "history" ? (
          <Card>
            <RecentSessionsCard userId={userId} sessions={recentSessions} />
          </Card>
        ) : null}

        {tab === "progress" ? (
          <Card>
            <LiftProgressTab stats={liftStats} error={liftStatsError} onRetry={loadLiftStats} />
          </Card>
        ) : null}

        {tab === "upcoming" ? (
          <Card>
            <UpcomingSessionsCard sessions={upcomingSessions} errors={upcomingErrors} />
          </Card>
        ) : null}

        {tab === "messages" && messagingEnabled ? (
          <Card>
            <MessageThread
              messages={messages}
              loadError={messagesError}
              onRetry={loadMessages}
              isOwnMessage={(m) => m.sender_role === "staff"}
              labelFor={(m) =>
                m.sender_role === "member" ? member.name : m.sender_id === profile.id ? "You" : coachNameById.get(m.sender_id) ?? "Coach"
              }
              placeholder={`Message ${member.name}…`}
              onSend={handleSendMessage}
              scrollViewRef={scrollViewRef}
              scrollOffsetRef={scrollOffsetRef}
            />
          </Card>
        ) : null}

        <AssignOneOffModal
          visible={assignModalVisible}
          templates={templates}
          onClose={() => setAssignModalVisible(false)}
          onPick={handleAssignOneOff}
        />
      </ScrollView>
      <CoachMessageBubble userId={userId} clientName={member.name} />
    </CoachShell>
  );
}
