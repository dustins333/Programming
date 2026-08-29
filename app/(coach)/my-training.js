import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listAssignmentsForUser, addGroupMembership, removeGroupMembership, setMembershipSessionsPerWeek } from "../../lib/programming/clients";
import { listGroupPrograms } from "../../lib/programming/blocks";
import { getSpcClient, assignSpcClient, setSpcStatus, updateSpcClient } from "../../lib/programming/spcClients";
import { useAuth } from "../../lib/auth/AuthProvider";
import { StatusBadge } from "../../components/StatusBadge";
import { SegmentedControl } from "../../components/SegmentedControl";
import { CoachShell } from "../../components/CoachShell";
import { toastError } from "../../lib/toast";
import { confirmRemoveGroupMembership } from "../../lib/confirmDialog";
import { SPC_ENROLLMENT_LABELS, SPC_ENROLLMENT_TONES } from "../../lib/programming/spcState";
import { fonts, colors } from "../../lib/theme";

// A coach's own training — the group and SPC memberships on their OWN
// account, set by themselves. Every staff account is also a real training
// client (dual-login), but until this screen only an admin could set
// anyone's memberships (via clients/[userId].js), and Settings — where the
// admin's own "Manage own training" link lives — is admin-only.
//
// Deliberately NOT the full clients/[userId].js page pointed at the
// caller's own id: that page carries a Nutrition switch, and per Terra's
// explicit call a coach may set their own group package and SPC frequency
// but may not turn nutrition on for themselves. Nutrition is an admin
// decision — it stays off this screen entirely rather than being rendered
// disabled, which would just read as broken.
//
// The two cards below are the same UI clients/[userId].js renders for the
// same two modules, minus everything that only makes sense when a coach
// is looking at someone else (notes, limitations, messages, one-offs).
// RLS: client_program_assignments is plain is_staff(); spc_clients is
// gated on can_access_spc(), which a coach without the SPC module fails —
// migration 0065 adds a self-row policy so any coach can enroll themself.

const isWeb = Platform.OS === "web";

function SettingsCard({ icon, title, children, headerRight }) {
  return (
    <View className="mb-4 rounded-2xl border bg-white px-4 py-4" style={{ borderColor: "#ece7e1" }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name={icon} size={16} color={colors.primary} />
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }} className="text-stone-700">
            {title}
          </Text>
        </View>
        {headerRight ?? null}
      </View>
      {children}
    </View>
  );
}

export default function MyTrainingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id;

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [spcClient, setSpcClient] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(null);
      const [progs, assigns, spc] = await Promise.all([listGroupPrograms(), listAssignmentsForUser(userId), getSpcClient(userId)]);
      setPrograms(progs);
      setAssignments(assigns);
      setSpcClient(spc);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setReady(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleMembership = async (groupProgramId, enrolled, programName) => {
    if (!enrolled && !(await confirmRemoveGroupMembership(programName))) return;
    try {
      if (enrolled) await addGroupMembership(userId, groupProgramId);
      else await removeGroupMembership(userId, groupProgramId);
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
      if (!enrolled) await setSpcStatus(userId, "paused");
      else if (spcClient) await setSpcStatus(userId, "active");
      // A coach enrolling themself is also, by default, their own SPC
      // coach — reassignable from the SPC page like anyone else's.
      else await assignSpcClient(userId, userId);
      await load();
    } catch (err) {
      toastError("Failed to update SPC status", err);
    }
  };

  const handleSpcFrequencySelect = async (sessionsPerWeek) => {
    try {
      await updateSpcClient(userId, { sessions_per_week: sessionsPerWeek });
      await load();
    } catch (err) {
      toastError("Failed to update SPC session frequency", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-stone-50" contentContainerStyle={{ padding: 20, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        {!isWeb ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))} className="mb-3 self-start">
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}

        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }} className="mb-1">
          My Training
        </Text>
        <Text className="mb-5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Your own group and SPC memberships. Log sessions from Member View once you're enrolled.
        </Text>

        {!ready ? (
          <ActivityIndicator className="mt-8" color={colors.primary} />
        ) : loadError ? (
          <View>
            <Text className="mb-3 text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load your training: {loadError}
            </Text>
            <Pressable onPress={load} className="self-start rounded-lg px-4 py-2" style={{ backgroundColor: colors.primary }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "#fff" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SettingsCard icon="barbell-outline" title="Group programs">
              {programs.length === 0 ? (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
                  No group programs exist yet.
                </Text>
              ) : (
                programs.map((program) => {
                  const membership = assignments.find((a) => a.group_program_id === program.id);
                  const enrolled = !!membership;
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

            <SettingsCard
              icon="clipboard-outline"
              title="SPC"
              headerRight={spcClient ? <StatusBadge tone={SPC_ENROLLMENT_TONES[spcClient.status]} label={SPC_ENROLLMENT_LABELS[spcClient.status]} /> : null}
            >
              <View className="flex-row items-center gap-3">
                <Switch value={spcActive} onValueChange={handleSpcToggle} trackColor={{ false: "#e7e5e4", true: "#4d6142" }} thumbColor="#ffffff" />
                <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                  {spcActive ? "Enrolled" : "Not enrolled"}
                </Text>
              </View>
              {spcActive ? (
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
              {spcClient && (profile?.role === "admin" || profile?.can_view_spc) ? (
                <Pressable onPress={() => router.push(`/(coach)/spc/${userId}`)} className="mt-3 self-start">
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>View my SPC program ›</Text>
                </Pressable>
              ) : null}
            </SettingsCard>
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
