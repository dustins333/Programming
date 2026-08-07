import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Switch } from "react-native";
import { Redirect, Link } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getSettings, getSetting, updateSetting } from "../../lib/settings";
import { sendPush } from "../../lib/notifications/sendPush";
import { listCoaches, updateCoachPermissions, inviteStaffMember } from "../../lib/programming/clients";
import { listTemplateQuestions, addTemplateQuestion, updateTemplateQuestion, deleteTemplateQuestion } from "../../lib/nutrition/checkin";
import {
  listQuestionnaireTemplateQuestions,
  addQuestionnaireTemplateQuestion,
  updateQuestionnaireTemplateQuestion,
  deleteQuestionnaireTemplateQuestion,
} from "../../lib/nutrition/onboarding";
import { fonts, colors } from "../../lib/theme";
import { toastError, toastSuccess } from "../../lib/toast";
import { CoachShell } from "../../components/CoachShell";
import { AddStaffModal } from "../../components/AddStaffModal";
import { TemplateEditorButton } from "../../components/nutrition/TemplateEditorButton";
import { NUMERIC_DONE_ID } from "../../components/NumericInputAccessory";

const LABELS = {
  alert_lead_time_days: "Alert lead time (days before a block ends)",
  default_block_length_flagship_weeks: "Default Flagship block length (weeks)",
  default_block_length_bwa_weeks: "Default Better With Age block length (weeks)",
  default_block_length_spc_weeks: "Default SPC block length (weeks)",
};

// design_handoff_v2_settings_nutrition — one long scroll replaced with an
// underline sub-tab bar, same visual pattern as the nutrition client-detail
// page's TabBar (app/(coach)/nutrition/clients/[userId].js).
const SETTINGS_TABS = [
  { key: "team", label: "Team" },
  { key: "defaults", label: "Program Defaults" },
  { key: "templates", label: "Nutrition Templates" },
  { key: "notifications", label: "Notifications" },
  { key: "diagnostics", label: "Diagnostics" },
];

function TabBar({ active, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-7 border-b border-stone-200">
      <View className="flex-row">
        {SETTINGS_TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Pressable key={t.key} onPress={() => onSelect(t.key)} className="mr-6 pb-3" style={isActive ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : undefined}>
              <Text style={{ fontFamily: isActive ? fonts.sansSemiBold : fonts.sansMedium, color: isActive ? colors.primaryOnWhite : "#78716c" }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Boolean settings, rendered as toggles below rather than in the generic
// numeric-input list above. Each defaults on (matches the always-on behavior
// before these toggles existed) — only an explicit false in core.settings
// turns one off. Add future notification types here as their sending logic
// ships; the underlying core.settings row doesn't need to exist yet, the
// Switch just shows the default until it's toggled for the first time.
const NOTIFICATION_TOGGLES = [
  {
    key: "notify_spc_block_alerts",
    label: "SPC block-ending alerts",
    description: "Notify the assigned coach when a client's next SPC block is auto-drafted.",
  },
  {
    key: "notify_nutrition_daily_log_reminder",
    label: "Daily log reminder",
    description: "Remind a nutrition client in the evening if today's log isn't finalized yet.",
  },
  {
    key: "notify_nutrition_checkin_nag",
    label: "Weekly check-in still needed",
    description: "Monday nudge to a nutrition client if last week's check-in was never submitted.",
  },
  {
    key: "notify_nutrition_checkin_available",
    label: "Weekly check-in available",
    description: "Sunday announcement to every nutrition client that the new week's check-in is open.",
  },
];

export default function Settings() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("team");
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [sendingPush, setSendingPush] = useState(false);
  const [notifValues, setNotifValues] = useState({});
  const [savingNotifKey, setSavingNotifKey] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [savingPermKey, setSavingPermKey] = useState(null);
  const [addStaffVisible, setAddStaffVisible] = useState(false);
  const [addStaffRole, setAddStaffRole] = useState("coach");
  const [checkinQuestions, setCheckinQuestions] = useState([]);
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState([]);

  const loadCoaches = useCallback(async () => {
    try {
      setCoaches(await listCoaches());
    } catch (err) {
      console.error("Failed to load team list:", err);
    }
  }, []);

  // Isolated the same way loadCoaches is — a nutrition-table hiccup
  // shouldn't take down the rest of Settings.
  const loadTemplates = useCallback(async () => {
    try {
      setCheckinQuestions(await listTemplateQuestions());
      setQuestionnaireQuestions(await listQuestionnaireTemplateQuestions());
    } catch (err) {
      console.error("Failed to load nutrition templates:", err);
    }
  }, []);

  const load = useCallback(async () => {
    const rows = await getSettings();
    setSettings(rows);
    setValues(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));

    const notifRows = await Promise.all(
      NOTIFICATION_TOGGLES.map((t) => getSetting(t.key, true))
    );
    setNotifValues(Object.fromEntries(NOTIFICATION_TOGGLES.map((t, i) => [t.key, notifRows[i]])));

    // Independent of the settings/notifications loads above — a failure
    // here (or an as-yet-unrun migration) shouldn't take down the rest of
    // the page, same reasoning as every other isolated-load pattern in
    // this app.
    await loadCoaches();
    await loadTemplates();
  }, [loadCoaches, loadTemplates]);

  const nextPosition = (list) => (list.length > 0 ? Math.max(...list.map((q) => q.position)) + 1 : 1);

  const handleAddCheckinQuestion = async (text) => {
    await addTemplateQuestion(text, nextPosition(checkinQuestions));
    await loadTemplates();
  };
  const handleUpdateCheckinQuestion = async (id, text) => {
    await updateTemplateQuestion(id, { question_text: text });
    await loadTemplates();
  };
  const handleDeleteCheckinQuestion = async (id) => {
    await deleteTemplateQuestion(id);
    await loadTemplates();
  };
  const handleMoveCheckinQuestion = async (a, b) => {
    await updateTemplateQuestion(a.id, { position: b.position });
    await updateTemplateQuestion(b.id, { position: a.position });
    await loadTemplates();
  };

  const handleAddQuestionnaireQuestion = async (text) => {
    await addQuestionnaireTemplateQuestion(text, nextPosition(questionnaireQuestions));
    await loadTemplates();
  };
  const handleUpdateQuestionnaireQuestion = async (id, text) => {
    await updateQuestionnaireTemplateQuestion(id, { question_text: text });
    await loadTemplates();
  };
  const handleDeleteQuestionnaireQuestion = async (id) => {
    await deleteQuestionnaireTemplateQuestion(id);
    await loadTemplates();
  };
  const handleMoveQuestionnaireQuestion = async (a, b) => {
    await updateQuestionnaireTemplateQuestion(a.id, { position: b.position });
    await updateQuestionnaireTemplateQuestion(b.id, { position: a.position });
    await loadTemplates();
  };

  useEffect(() => {
    load();
  }, [load]);

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  // Combined save, per the mock: the 4 numeric defaults live in one card now
  // instead of one input+Save pair per row, so one button saves whichever of
  // them changed rather than requiring 4 separate taps.
  const handleSaveAll = async () => {
    setSavingKey("all");
    try {
      await Promise.all(
        settings.map((row) => {
          const numeric = Number(values[row.key]);
          return updateSetting(row.key, Number.isFinite(numeric) ? numeric : values[row.key]);
        })
      );
      await load();
      toastSuccess("Saved.");
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleNotif = async (key, value) => {
    const previous = notifValues[key];
    setNotifValues((v) => ({ ...v, [key]: value }));
    setSavingNotifKey(key);
    try {
      await updateSetting(key, value);
    } catch (err) {
      setNotifValues((v) => ({ ...v, [key]: previous }));
      toastError("Failed to save", err);
    } finally {
      setSavingNotifKey(null);
    }
  };

  const handleTogglePermission = async (coach, field, value) => {
    const permKey = `${coach.id}:${field}`;
    setCoaches((cs) => cs.map((c) => (c.id === coach.id ? { ...c, [field]: value } : c)));
    setSavingPermKey(permKey);
    try {
      await updateCoachPermissions(coach.id, {
        canViewSpc: field === "can_view_spc" ? value : undefined,
        canViewNutrition: field === "can_view_nutrition" ? value : undefined,
        canViewExerciseLibrary: field === "can_view_exercise_library" ? value : undefined,
      });
    } catch (err) {
      setCoaches((cs) => cs.map((c) => (c.id === coach.id ? { ...c, [field]: !value } : c)));
      toastError("Failed to save", err);
    } finally {
      setSavingPermKey(null);
    }
  };

  const handleAddStaff = async ({ name, email, role }) => {
    try {
      await inviteStaffMember({ name, email, role });
      await loadCoaches();
      toastSuccess(`Invited ${name}.`);
    } catch (err) {
      toastError("Failed to add staff", err);
      throw err;
    }
  };

  const handleSendTestPush = async () => {
    setSendingPush(true);
    try {
      const result = await sendPush({ userId: profile.id, title: "Kova Strength", body: "Push notifications are wired up." });
      toastSuccess(`Sent: ${JSON.stringify(result)}`);
    } catch (err) {
      toastError("Failed to send", err);
    } finally {
      setSendingPush(false);
    }
  };

  if (!settings) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 640 }}>
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Settings
      </Text>
      <Text className="mb-5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Admin-only configuration for the whole gym.
      </Text>

      <TabBar active={tab} onSelect={setTab} />

      {tab === "team" && (
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
            Coaches &amp; Admins
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                setAddStaffRole("coach");
                setAddStaffVisible(true);
              }}
              className="rounded-lg border border-primary px-3 py-2"
            >
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>+ Add coach</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAddStaffRole("admin");
                setAddStaffVisible(true);
              }}
              className="rounded-lg border border-primary px-3 py-2"
            >
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>+ Add admin</Text>
            </Pressable>
          </View>
        </View>

        {coaches.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            No coach or admin accounts yet.
          </Text>
        ) : (
          coaches.map((coach) => (
            <View key={coach.id} className="mb-3 rounded-xl border border-stone-200 p-4">
              <View className="mb-1 flex-row items-center justify-between">
                <View>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-800">
                    {coach.name}
                  </Text>
                  <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    {coach.email} · {coach.role === "admin" ? "Admin" : "Coach"}
                  </Text>
                </View>
                <Link href={`/(coach)/clients/${coach.id}`} asChild>
                  <Pressable>
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                      Manage own training →
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {coach.role === "admin" ? (
                <Text className="mt-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  Full access to every module.
                </Text>
              ) : (
                <View className="mt-2 gap-2.5">
                  {[
                    { field: "can_view_spc", label: "SPC" },
                    { field: "can_view_nutrition", label: "Nutrition" },
                    { field: "can_view_exercise_library", label: "Exercise Library" },
                  ].map(({ field, label }) => (
                    <View key={field} className="flex-row items-center justify-between">
                      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                        {label}
                      </Text>
                      <Switch
                        value={coach[field] ?? true}
                        onValueChange={(v) => handleTogglePermission(coach, field, v)}
                        disabled={savingPermKey === `${coach.id}:${field}`}
                        trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                        thumbColor="#ffffff"
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </View>
      )}

      {tab === "defaults" && (
      <View className="rounded-xl border border-stone-200 p-5">
        <Text className="mb-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Program Defaults
        </Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -8 }}>
          {settings.map((row) => (
            <View key={row.key} style={{ width: "50%", paddingHorizontal: 8 }} className="mb-5">
              <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                {LABELS[row.key] ?? row.key}
              </Text>
              <TextInput
                value={values[row.key] ?? ""}
                onChangeText={(text) => setValues((v) => ({ ...v, [row.key]: text }))}
                keyboardType="numeric"
                inputAccessoryViewID={NUMERIC_DONE_ID}
                className="rounded-lg border border-stone-300 px-4 py-3 text-base"
                style={{ fontFamily: fonts.sans }}
              />
            </View>
          ))}
        </View>
        <Pressable
          onPress={handleSaveAll}
          disabled={savingKey === "all"}
          className="mt-1 self-start rounded-lg bg-primary px-5 py-3 disabled:opacity-50"
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {savingKey === "all" ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>
      </View>
      )}

      {tab === "templates" && (
      <View>
        <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Nutrition Templates
        </Text>
        <View className="mb-3">
          <TemplateEditorButton
            label="Weekly check-in template"
            description="The master template. Each client gets their own copy — per-client edits live on that client's Client Settings."
            questions={checkinQuestions}
            onAdd={handleAddCheckinQuestion}
            onUpdate={handleUpdateCheckinQuestion}
            onDelete={handleDeleteCheckinQuestion}
            onMove={handleMoveCheckinQuestion}
          />
        </View>
        <View>
          <TemplateEditorButton
            label="Onboarding questionnaire template"
            description="Copied onto a client automatically when Nutrition is turned on for them."
            questions={questionnaireQuestions}
            onAdd={handleAddQuestionnaireQuestion}
            onUpdate={handleUpdateQuestionnaireQuestion}
            onDelete={handleDeleteQuestionnaireQuestion}
            onMove={handleMoveQuestionnaireQuestion}
          />
        </View>
      </View>
      )}

      {tab === "notifications" && (
      <View className="rounded-xl border border-stone-200 p-5">
        <Text className="mb-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Push Notifications
        </Text>
        {NOTIFICATION_TOGGLES.map((toggle, i) => (
        <View key={toggle.key} className="flex-row items-center justify-between gap-4 py-4" style={i > 0 ? { borderTopWidth: 1, borderTopColor: "#f1efed" } : undefined}>
          <View className="flex-1">
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              {toggle.label}
            </Text>
            <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              {toggle.description}
            </Text>
          </View>
          <Switch
            value={notifValues[toggle.key] ?? true}
            onValueChange={(v) => handleToggleNotif(toggle.key, v)}
            disabled={savingNotifKey === toggle.key}
            trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
            thumbColor="#ffffff"
          />
        </View>
        ))}
      </View>
      )}

      {tab === "diagnostics" && (
      <View className="rounded-xl border border-stone-200 p-5">
        <Text className="mb-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Diagnostics
        </Text>
        <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Send a real push notification to your own account to confirm delivery is wired up end to end.
        </Text>
        <Pressable
          onPress={handleSendTestPush}
          disabled={sendingPush}
          className="self-start rounded-lg border border-primary px-5 py-3 disabled:opacity-50"
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            {sendingPush ? "Sending…" : "Send test push to myself"}
          </Text>
        </Pressable>
      </View>
      )}
    </ScrollView>

    <AddStaffModal
      visible={addStaffVisible}
      initialRole={addStaffRole}
      onClose={() => setAddStaffVisible(false)}
      onSubmit={handleAddStaff}
    />
    </CoachShell>
  );
}
