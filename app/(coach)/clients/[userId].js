import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase, core } from "../../../lib/supabase/client";
import { getUser, listCoaches, listAssignmentsForUser, addGroupMembership, removeGroupMembership, setMembershipSessionsPerWeek } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getCurrentBlock } from "../../../lib/programming/memberPlan";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { getMissedSessionFlagsByUser } from "../../../lib/programming/flags";
import { getSpcClient, assignSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { getClient as getNutritionClient, createOrReactivateClient, setClientStatus as setNutritionStatus } from "../../../lib/nutrition/clients";
import { listTemplates } from "../../../lib/programming/templates";
import { listOneOffWorkoutsForUser, createOneOffFromTemplate, deleteOneOffWorkout } from "../../../lib/programming/oneOffWorkouts";
import { listCompletedOneOffWorkoutIds } from "../../../lib/programming/sessionCompletions";
import { listRecentSessionsForUser } from "../../../lib/programming/coachLogs";
import { listMessages, sendStaffMessage } from "../../../lib/programming/messages";
import { sendPush } from "../../../lib/notifications/sendPush";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { StatusBadge } from "../../../components/StatusBadge";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { AssignOneOffModal } from "../../../components/AssignOneOffModal";
import { RecentSessionsCard } from "../../../components/RecentSessionsCard";
import { MessageThread } from "../../../components/MessageThread";
import { CoachShell } from "../../../components/CoachShell";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmRemoveOneOff, confirmArchiveNutritionClient } from "../../../lib/confirmDialog";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { todayInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

const NUTRITION_TONES = { active: "onTrack", paused: "paused", archived: "paused" };
const NUTRITION_STATUS_LABELS = { active: "Active", paused: "Paused", archived: "Archived" };
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const isWeb = Platform.OS === "web";

function initials(name) {
  return name
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

function ProgressBar({ fraction }) {
  return (
    <View className="overflow-hidden rounded-full" style={{ height: 6, backgroundColor: "#f1efed" }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", backgroundColor: "#4d6142", borderRadius: 999 }} />
    </View>
  );
}

// Block-progress side + missed-session flags side, side by side on web,
// stacked on native (same isWeb-flag responsive pattern spc/[userId].js
// already uses). Injury/note flags are intentionally not built yet — there
// is no way in this app to tag a coach note as injury-related, so shipping
// that half of the design's example would mean fabricating data; only the
// "missed session" flag (computed from real completions) is real here.
function SnapshotPanel({ blockRows, flags }) {
  if (blockRows.length === 0 && flags.length === 0) return null;
  return (
    <Card>
      <View style={{ flexDirection: isWeb ? "row" : "column", flexWrap: "wrap", gap: isWeb ? 32 : 20 }}>
        {blockRows.length > 0 && (
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Current block
            </Text>
            {blockRows.map((row, idx) => (
              <View key={row.programId} style={idx > 0 ? { marginTop: 14 } : undefined}>
                <Text className="mb-2 text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
                  {row.programName} · Week {row.weekNum} of {row.totalWeeks}
                </Text>
                <ProgressBar fraction={row.weekNum / row.totalWeeks} />
              </View>
            ))}
          </View>
        )}
        {flags.length > 0 && (
          <View
            style={
              isWeb && blockRows.length > 0
                ? { flex: 1.4, minWidth: 280, borderLeftWidth: 1, borderLeftColor: "#ece7e1", paddingLeft: 32 }
                : { flex: 1.4, minWidth: 280 }
            }
          >
            <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Flags
            </Text>
            {flags.map((flag, idx) => (
              <View key={idx} className="mb-1.5 flex-row items-center gap-2">
                <View className="shrink-0 rounded-full px-2.5 py-[3px]" style={{ backgroundColor: "#fdece5" }}>
                  <Text style={{ fontFamily: fonts.sansBold, color: "#b23a22", fontSize: 10.5 }}>Missed session</Text>
                </View>
                <Text className="flex-1 text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  No log for Session {flag.sessionNumber} ({flag.programName}) · {flag.period ?? "this week"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

export default function ClientProfile() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [currentBlocksByProgramId, setCurrentBlocksByProgramId] = useState({});
  const [missedFlags, setMissedFlags] = useState([]);
  const [spcClient, setSpcClient] = useState(null);
  const [nutritionClient, setNutritionClient] = useState(null);
  const [oneOffs, setOneOffs] = useState([]);
  const [completedOneOffIds, setCompletedOneOffIds] = useState(new Set());
  const [templates, setTemplates] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [messages, setMessages] = useState(null);
  const [messagesError, setMessagesError] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastSignInAt, setLastSignInAt] = useState(undefined);
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [memberRow, assignmentRows, programRows, spcRow, nutritionRow, oneOffRows, completedIds, templateRows] = await Promise.all([
        getUser(userId),
        listAssignmentsForUser(userId),
        listGroupPrograms(),
        getSpcClient(userId),
        getNutritionClient(userId),
        listOneOffWorkoutsForUser(userId),
        listCompletedOneOffWorkoutIds(userId),
        listTemplates(),
      ]);
      setMember(memberRow);

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
      setSpcClient(spcRow);
      setNutritionClient(nutritionRow);
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

      try {
        setCoaches(await listCoaches());
      } catch {
        setCoaches([]);
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
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // A client can hold several memberships at once now (e.g. Flagship plus
  // a specialty program), so this toggles one specific program's
  // membership on/off rather than picking a single mutually-exclusive
  // program.
  const handleToggleMembership = async (groupProgramId, enrolled) => {
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

  const spcActive = Boolean(spcClient && spcClient.status !== "paused");
  const handleSpcToggle = async (enrolled) => {
    try {
      if (!enrolled) {
        await setSpcStatus(userId, "paused");
      } else if (spcClient) {
        await setSpcStatus(userId, "needs_printed");
      } else {
        await assignSpcClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      toastError("Failed to update SPC status", err);
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

  // Kova has no separate email-invite system (a member's auth.users row
  // already exists before any module is turned on for them) — this really
  // means "send them a fresh link to set their password and get in for the
  // first time," which works regardless of whether they've ever signed in.
  // Same mechanism as this app's own "Forgot / set up password?" flow.
  const handleResendInvite = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(member.email, {
        redirectTo: "https://app.kovastrength.com/set-password",
      });
      if (error) throw error;
      toastSuccess(`A sign-in link was sent to ${member.email}.`);
    } catch (err) {
      toastError("Failed to send", err);
    } finally {
      setResending(false);
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
      const totalWeeks = a.group_programs?.block_length_weeks ?? 1;
      return {
        programId: a.group_program_id,
        programName: a.group_programs?.name ?? "Group program",
        weekNum: currentWeekNumber(block.block_start_date, totalWeeks, today),
        totalWeeks,
      };
    })
    .filter(Boolean);

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 900 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/clients"))}
          style={{ marginBottom: 18 }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>‹ Back</Text>
        </Pressable>

        <View className="mb-6 flex-row items-center gap-3.5">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 52, height: 52, backgroundColor: "#fdf6f2" }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: colors.primaryOnWhite }}>
              {initials(member.name)}
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 22 }}>
              {member.name}
            </Text>
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              {member.email}
              {member.phone ? ` · ${member.phone}` : ""}
            </Text>
            {lastSignInAt === null ? (
              <View className="mt-1 flex-row items-center gap-2">
                <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
                  Never signed in
                </Text>
                <Text style={{ color: "#d6d3d1" }}>·</Text>
                <Pressable onPress={handleResendInvite} disabled={resending} hitSlop={6}>
                  <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                    {resending ? "Sending…" : "Resend invite"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        <SnapshotPanel blockRows={blockRows} flags={missedFlags} />

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
                        onValueChange={(v) => handleToggleMembership(program.id, v)}
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
              headerRight={spcClient ? <StatusBadge tone={STATUS_TONES[spcClient.status]} label={STATUS_LABELS[spcClient.status]} /> : null}
            >
              <View className="flex-row items-center gap-3">
                <Switch
                  value={spcActive}
                  onValueChange={handleSpcToggle}
                  trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                  thumbColor="#ffffff"
                />
                <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                  {spcClient ? "Enrolled" : "Not enrolled"}
                </Text>
              </View>
              {spcClient ? <ViewLink label="View SPC program ›" onPress={() => router.push(`/(coach)/spc/${userId}`)} /> : null}
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

        <SettingsCard icon="stats-chart-outline" title="Recent sessions">
          <RecentSessionsCard userId={userId} sessions={recentSessions} />
        </SettingsCard>

        <SettingsCard icon="chatbubble-outline" title="Messages">
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
          />
        </SettingsCard>

        <AssignOneOffModal
          visible={assignModalVisible}
          templates={templates}
          onClose={() => setAssignModalVisible(false)}
          onPick={handleAssignOneOff}
        />
      </ScrollView>
    </CoachShell>
  );
}
