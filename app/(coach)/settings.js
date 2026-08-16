import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Switch, Platform, useWindowDimensions } from "react-native";
import { Redirect, Link, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getSettings, getSetting, updateSetting } from "../../lib/settings";
import { sendPush } from "../../lib/notifications/sendPush";
import { listCoaches, updateCoachPermissions, inviteStaffMember } from "../../lib/programming/clients";
import { listGroupPrograms } from "../../lib/programming/blocks";
import {
  getMessagingSettings,
  setMessagingEnabled as saveMessagingEnabled,
  setMessagingAudience,
  MESSAGING_AUDIENCE_ALL,
  MESSAGING_AUDIENCE_SPC,
  MESSAGING_AUDIENCE_NUTRITION,
} from "../../lib/programming/messagingSettings";
import { listTemplateQuestions, addTemplateQuestion, updateTemplateQuestion, deleteTemplateQuestion } from "../../lib/nutrition/checkin";
import {
  listQuestionnaireTemplateQuestions,
  addQuestionnaireTemplateQuestion,
  updateQuestionnaireTemplateQuestion,
  deleteQuestionnaireTemplateQuestion,
} from "../../lib/nutrition/onboarding";
import { listSpecialtyBars, saveSpecialtyBars } from "../../lib/equipment/specialtyBars";
import { fonts, colors } from "../../lib/theme";
import { toastError, toastSuccess } from "../../lib/toast";
import { CoachShell } from "../../components/CoachShell";
import { AddStaffModal } from "../../components/AddStaffModal";
import { StaffPermissionMatrix, PERMISSION_COLUMNS } from "../../components/StaffPermissionMatrix";
import { TemplateEditorButton } from "../../components/nutrition/TemplateEditorButton";
import { NativePickerField } from "../../components/NativePickerField";
import { confirmRemoveQuestion, confirmDelete } from "../../lib/confirmDialog";
import { NUMERIC_DONE_ID } from "../../components/NumericInputAccessory";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../../lib/scrollToKeyboard";

const isWeb = Platform.OS === "web";

// scan-nutrition-checkin-available polls every 15 minutes (see its cron
// migration) — quarter-hour granularity here is an honest reflection of
// that, same reasoning as announcements/index.js's own TIME_OPTIONS.
function buildTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      const pad = (n) => String(n).padStart(2, "0");
      const period = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      options.push({ value: `${pad(h)}:${pad(m)}`, label: `${h12}:${pad(m)} ${period}` });
    }
  }
  return options;
}
const TIME_OPTIONS = buildTimeOptions();

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const CHECKIN_NOTIF_DEFAULTS = {
  title: "Weekly check-in available",
  body: "Your weekly check-in is ready for you to fill out.",
  weekday: 0,
  time: "08:00",
  // Appended to the push only for clients whose photos are due on this
  // check-in. Push-only by necessity: the in-app announcement is one shared
  // row for everyone, so it can't be personalized per client.
  photoLine: "📸 Don't forget your progress photos this week (front, side and back).",
};

// core.settings is a generic key/value table shared by every admin-facing
// setting in the app (messaging kill switch, payroll deadline, specialty
// bars, the nutrition check-in notification's title/body, ...). This tab
// used to render *every* row in it as a numeric text input and write all of
// them back on Save — which meant a jsonb array rendered as "[object
// Object]", the check-in body's paragraph got squeezed into a one-line
// numeric field, and saving rewrote `messaging_enabled: false` as the
// string "false" (truthy — it would have silently turned messaging back on).
// This tab owns exactly these keys; everything else in core.settings is
// edited from the tab that actually understands it.
//
// It used to carry a block-length default PER PROGRAM
// (default_block_length_flagship_weeks / _bwa_weeks / _spc_weeks). Only the
// SPC one was ever read — the two group keys were dead, hardcoded to two
// program names that stopped being the whole list the moment group programs
// became coach-creatable (LLYL had no key and never could have one), and
// they drifted: this tab claimed Flagship was 6 weeks while the value
// actually used was 4.
//
// Replaced by ONE gym-wide default, because block length isn't really a
// setting: both the group and SPC block dialogs already ask for it every
// time you create a block. The stored value is only what that stepper starts
// at, and it's only reached for a program's or client's FIRST block — after
// that the stepper seeds from their most recent block ("same as last time").
// What genuinely varies per program (sessions/week, session days) lives on
// the program itself, under "⚙ {Program} settings" on Group Programs.
//
// The three old rows are left inert in core.settings rather than deleted,
// same convention as the rest of this codebase's superseded data.
const PROGRAM_DEFAULTS = [
  {
    key: "default_block_length_weeks",
    label: "Default block length",
    unit: "weeks",
    hint: "Where a new block's length starts when a program or client has no previous block. Every block dialog lets you change it.",
    fallback: 4,
  },
  {
    key: "alert_lead_time_days",
    label: "Block-ending alert lead time",
    unit: "days",
    hint: "How far ahead of a block's end date the next SPC block is auto-drafted.",
    fallback: 3,
  },
];

// design_handoff_v2_settings_nutrition — one long scroll replaced with an
// underline sub-tab bar, same visual pattern as the nutrition client-detail
// page's TabBar (app/(coach)/nutrition/clients/[userId].js).
const SETTINGS_TABS = [
  { key: "team", label: "Team" },
  { key: "defaults", label: "Defaults" },
  { key: "equipment", label: "Equipment" },
  { key: "templates", label: "Nutrition" },
  { key: "notifications", label: "Notifications" },
  { key: "messaging", label: "Messaging" },
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
  // notify_nutrition_checkin_available moved to Settings -> Nutrition, next
  // to the templates it's paired with — its own card there also edits the
  // notification's title/body/send day/time, not just an on/off toggle.
];

export default function Settings() {
  const { profile } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("team");
  // Same 768 breakpoint CoachShell uses to swap its sidebar for a drawer —
  // the two-up defaults grid gets too cramped below it.
  const { width } = useWindowDimensions();
  const narrow = width < 768;
  // The permission matrix needs ~840px of real estate for its five columns.
  // Below that (native, and the installed PWA on a phone) the Team tab keeps
  // its per-coach card list, which reads fine in one column.
  const matrixLayout = isWeb && width >= 1024;
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [sendingPush, setSendingPush] = useState(false);
  const [notifValues, setNotifValues] = useState({});
  // KeyboardDoneButton floats above the keyboard on iOS (app/_layout.js) —
  // extra bottom padding when it's showing keeps it from covering whatever
  // field is focused. See lib/scrollToKeyboard.js.
  const keyboardHeight = useKeyboardHeight();
  const extraKeyboardPadding = keyboardHeight > 0 ? DONE_BAR_HEIGHT : 0;
  const [savingNotifKey, setSavingNotifKey] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [savingPermKey, setSavingPermKey] = useState(null);
  const [addStaffVisible, setAddStaffVisible] = useState(false);
  const [addStaffRole, setAddStaffRole] = useState("coach");
  const [checkinQuestions, setCheckinQuestions] = useState([]);
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [messagingEnabledValue, setMessagingEnabledValue] = useState(true);
  const [messagingAudience, setMessagingAudienceValue] = useState([MESSAGING_AUDIENCE_ALL]);
  const [groupPrograms, setGroupPrograms] = useState([]);
  const [savingMessaging, setSavingMessaging] = useState(false);
  const [specialtyBars, setSpecialtyBars] = useState([]);
  const [savingBars, setSavingBars] = useState(false);
  const [newBarName, setNewBarName] = useState("");
  const [newBarWeight, setNewBarWeight] = useState("");
  const [checkinNotif, setCheckinNotif] = useState({ ...CHECKIN_NOTIF_DEFAULTS, enabled: true });
  const [savingCheckinNotif, setSavingCheckinNotif] = useState(false);

  const loadCoaches = useCallback(async () => {
    try {
      setCoaches(await listCoaches());
    } catch (err) {
      console.error("Failed to load team list:", err);
    }
  }, []);

  // Isolated the same way loadCoaches is — an unrun messaging migration/
  // settings hiccup shouldn't take down the rest of Settings.
  const loadMessaging = useCallback(async () => {
    try {
      const [messagingSettings, programs] = await Promise.all([getMessagingSettings(), listGroupPrograms()]);
      setMessagingEnabledValue(messagingSettings.enabled);
      setMessagingAudienceValue(messagingSettings.audience);
      setGroupPrograms(programs);
    } catch (err) {
      console.error("Failed to load messaging settings:", err);
    }
  }, []);

  // Isolated the same way loadCoaches is.
  const loadEquipment = useCallback(async () => {
    try {
      setSpecialtyBars(await listSpecialtyBars());
    } catch (err) {
      console.error("Failed to load specialty bars:", err);
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

  // Isolated the same way loadCoaches is. Bundled as one card/one save
  // instead of reusing the generic NOTIFICATION_TOGGLES loop, since this one
  // notification also has editable title/body/send-day/time, not just an
  // on/off flag.
  const loadCheckinNotif = useCallback(async () => {
    try {
      const [enabled, title, body, weekday, time, photoLine] = await Promise.all([
        getSetting("notify_nutrition_checkin_available", true),
        getSetting("nutrition_checkin_available_title", CHECKIN_NOTIF_DEFAULTS.title),
        getSetting("nutrition_checkin_available_body", CHECKIN_NOTIF_DEFAULTS.body),
        getSetting("nutrition_checkin_available_weekday", CHECKIN_NOTIF_DEFAULTS.weekday),
        getSetting("nutrition_checkin_available_time", CHECKIN_NOTIF_DEFAULTS.time),
        getSetting("nutrition_checkin_available_photo_line", CHECKIN_NOTIF_DEFAULTS.photoLine),
      ]);
      setCheckinNotif({ enabled, title, body, weekday, time, photoLine });
    } catch (err) {
      console.error("Failed to load check-in notification settings:", err);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const rows = await getSettings();
      setSettings(rows);
      // Only the Program Defaults keys are editable here — see PROGRAM_DEFAULTS.
      // A key with no row yet shows its documented fallback rather than blank.
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      setValues(
        Object.fromEntries(
          PROGRAM_DEFAULTS.map((d) => [d.key, String(byKey[d.key] ?? d.fallback)])
        )
      );

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
      await loadMessaging();
      await loadEquipment();
      await loadCheckinNotif();
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [loadCoaches, loadTemplates, loadMessaging, loadEquipment, loadCheckinNotif]);

  const nextPosition = (list) => (list.length > 0 ? Math.max(...list.map((q) => q.position)) + 1 : 1);

  const handleAddCheckinQuestion = async (text) => {
    await addTemplateQuestion(text, nextPosition(checkinQuestions));
    await loadTemplates();
  };
  const handleUpdateCheckinQuestion = async (id, fields) => {
    await updateTemplateQuestion(id, fields);
    await loadTemplates();
  };
  const handleDeleteCheckinQuestion = async (id) => {
    const q = checkinQuestions.find((row) => row.id === id);
    if (!(await confirmRemoveQuestion(q?.question_text ?? "this question"))) return;
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
  const handleUpdateQuestionnaireQuestion = async (id, fields) => {
    await updateQuestionnaireTemplateQuestion(id, fields);
    await loadTemplates();
  };
  const handleDeleteQuestionnaireQuestion = async (id) => {
    const q = questionnaireQuestions.find((row) => row.id === id);
    if (!(await confirmRemoveQuestion(q?.question_text ?? "this question"))) return;
    await deleteQuestionnaireTemplateQuestion(id);
    await loadTemplates();
  };
  const handleMoveQuestionnaireQuestion = async (a, b) => {
    await updateQuestionnaireTemplateQuestion(a.id, { position: b.position });
    await updateQuestionnaireTemplateQuestion(b.id, { position: a.position });
    await loadTemplates();
  };

  // Tab root, kept mounted across tab switches on native — refetch on
  // every focus so a permission toggle or invite made a moment ago shows
  // up without leaving and force-quitting the app.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  // Combined save, per the mock: the numeric defaults live in one card now
  // instead of one input+Save pair per row, so one button saves whichever of
  // them changed rather than requiring 4 separate taps. Every one of these is
  // a whole number of weeks/days — reject anything else up front instead of
  // writing a string into a column the rest of the app does math on.
  const handleSaveAll = async () => {
    const invalid = PROGRAM_DEFAULTS.find((d) => {
      const n = Number(values[d.key]);
      return !Number.isInteger(n) || n < 1;
    });
    if (invalid) {
      toastError(`${invalid.label} must be a whole number of ${invalid.unit} (1 or more).`);
      return;
    }
    setSavingKey("all");
    try {
      await Promise.all(
        PROGRAM_DEFAULTS.map((d) => updateSetting(d.key, Number(values[d.key])))
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

  // A "day this last fired" guard also lives in core.settings
  // (nutrition_checkin_available_last_sent_date) — the scan function reads
  // and writes it, this page never touches it directly.
  const handleToggleCheckinNotifEnabled = async (value) => {
    const previous = checkinNotif.enabled;
    setCheckinNotif((c) => ({ ...c, enabled: value }));
    setSavingCheckinNotif(true);
    try {
      await updateSetting("notify_nutrition_checkin_available", value);
    } catch (err) {
      setCheckinNotif((c) => ({ ...c, enabled: previous }));
      toastError("Failed to save", err);
    } finally {
      setSavingCheckinNotif(false);
    }
  };

  const handleSaveCheckinNotif = async () => {
    setSavingCheckinNotif(true);
    try {
      await Promise.all([
        updateSetting("nutrition_checkin_available_title", checkinNotif.title),
        updateSetting("nutrition_checkin_available_body", checkinNotif.body),
        updateSetting("nutrition_checkin_available_weekday", checkinNotif.weekday),
        updateSetting("nutrition_checkin_available_time", checkinNotif.time),
        updateSetting("nutrition_checkin_available_photo_line", checkinNotif.photoLine),
      ]);
      toastSuccess("Saved.");
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSavingCheckinNotif(false);
    }
  };

  const handleToggleMessagingEnabled = async (value) => {
    const previous = messagingEnabledValue;
    setMessagingEnabledValue(value);
    setSavingMessaging(true);
    try {
      await saveMessagingEnabled(value);
    } catch (err) {
      setMessagingEnabledValue(previous);
      toastError("Failed to save", err);
    } finally {
      setSavingMessaging(false);
    }
  };

  // "Everyone" is exclusive with the specific-membership list below it —
  // checking it collapses the audience to just ["all"] and dims the rest;
  // unchecking it clears back to an empty list (nobody) rather than
  // guessing which specific scopes to restore.
  const handleToggleMessagingEveryone = async (checked) => {
    const previous = messagingAudience;
    const next = checked ? [MESSAGING_AUDIENCE_ALL] : [];
    setMessagingAudienceValue(next);
    setSavingMessaging(true);
    try {
      await setMessagingAudience(next);
    } catch (err) {
      setMessagingAudienceValue(previous);
      toastError("Failed to save", err);
    } finally {
      setSavingMessaging(false);
    }
  };

  const handleToggleMessagingScope = async (scopeKey, checked) => {
    const previous = messagingAudience;
    const next = checked ? [...messagingAudience, scopeKey] : messagingAudience.filter((s) => s !== scopeKey);
    setMessagingAudienceValue(next);
    setSavingMessaging(true);
    try {
      await setMessagingAudience(next);
    } catch (err) {
      setMessagingAudienceValue(previous);
      toastError("Failed to save", err);
    } finally {
      setSavingMessaging(false);
    }
  };

  // Saves the whole array back on every add/delete (immediate, no separate
  // Save button) — same pattern as the nutrition question-list editors,
  // simple enough for a gym-wide list that's edited rarely.
  const handleAddSpecialtyBar = async () => {
    const name = newBarName.trim();
    const weight = Number(newBarWeight);
    if (!name || !Number.isFinite(weight) || weight <= 0) {
      toastError("Enter a name and a weight", new Error("Missing or invalid fields"));
      return;
    }
    const next = [...specialtyBars, { name, weight }];
    setSpecialtyBars(next);
    setSavingBars(true);
    try {
      await saveSpecialtyBars(next);
      setNewBarName("");
      setNewBarWeight("");
    } catch (err) {
      setSpecialtyBars(specialtyBars);
      toastError("Failed to save", err);
    } finally {
      setSavingBars(false);
    }
  };

  const handleDeleteSpecialtyBar = async (index) => {
    if (!(await confirmDelete(`Remove "${specialtyBars[index]?.name ?? "this bar"}" from the specialty bar list?`, "Remove specialty bar?"))) return;
    const previous = specialtyBars;
    const next = specialtyBars.filter((_, i) => i !== index);
    setSpecialtyBars(next);
    setSavingBars(true);
    try {
      await saveSpecialtyBars(next);
    } catch (err) {
      setSpecialtyBars(previous);
      toastError("Failed to save", err);
    } finally {
      setSavingBars(false);
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
        canLogOpsHours: field === "can_log_ops_hours" ? value : undefined,
      });
    } catch (err) {
      setCoaches((cs) => cs.map((c) => (c.id === coach.id ? { ...c, [field]: !value } : c)));
      toastError("Failed to save", err);
    } finally {
      setSavingPermKey(null);
    }
  };

  const handleAddStaff = async ({ name, email, role, existingUserId, permissions }) => {
    try {
      const { invited } = await inviteStaffMember({ name, email, role, existingUserId, permissions });
      await loadCoaches();
      // Only say "invited" when an email genuinely went out — promoting an
      // account that already exists sends nothing.
      toastSuccess(
        invited
          ? `Invited ${name} — they'll get an email to set a password.`
          : `${name} is now ${role === "admin" ? "an admin" : "a coach"}.`
      );
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

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Couldn't load settings: {loadError}
          </Text>
          <Pressable onPress={load}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

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
    {/* Every tab but Team is a single column of forms and caps at 640; the
        Team tab's permission matrix needs the full width to fit its five
        columns, so the page cap widens for that tab only. */}
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 32 + extraKeyboardPadding,
        maxWidth: tab === "team" && matrixLayout ? 1060 : 640,
      }}
    >
      {Platform.OS !== "web" ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
          className="mb-4 self-start"
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </Pressable>
      ) : null}
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Settings
      </Text>
      <Text className="mb-5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        Admin-only configuration for the whole gym.
      </Text>

      <TabBar active={tab} onSelect={setTab} />

      {tab === "team" && (
      <View>
        <View className="mb-4 flex-row items-center justify-between">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 17 }} className="text-stone-700">
            Staff &amp; permissions
          </Text>
          {/* One button, not two — AddStaffModal has had its own Coach/Admin
              role picker since it was built, so a second entry point that
              only pre-selects the role was redundant. */}
          <Pressable
            onPress={() => {
              setAddStaffRole("coach");
              setAddStaffVisible(true);
            }}
            className="rounded-lg px-[18px] py-2.5"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>+ Add staff</Text>
          </Pressable>
        </View>

        {coaches.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            No coach or admin accounts yet.
          </Text>
        ) : matrixLayout ? (
          <StaffPermissionMatrix
            coaches={coaches}
            currentUserId={profile?.id}
            savingPermKey={savingPermKey}
            onTogglePermission={handleTogglePermission}
          />
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
                  {PERMISSION_COLUMNS.map(({ field, label, defaultValue }) => (
                    <View key={field} className="flex-row items-center justify-between">
                      <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                        {label}
                      </Text>
                      <Switch
                        value={coach[field] ?? defaultValue}
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
        <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Gym-wide defaults
        </Text>
        <Text className="mb-5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Starting values that apply everywhere. Anything that differs between programs — sessions a week, which days they run — lives on the program itself, under “⚙ {"{"}Program{"}"} settings” on Group Programs.
        </Text>
        <View className={narrow ? undefined : "flex-row flex-wrap"} style={narrow ? undefined : { marginHorizontal: -8 }}>
          {PROGRAM_DEFAULTS.map((d) => (
            <View
              key={d.key}
              style={narrow ? undefined : { width: "50%", paddingHorizontal: 8 }}
              className="mb-5"
            >
              <Text className="mb-1.5 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                {d.label}
              </Text>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TextInput
                  value={values[d.key] ?? ""}
                  onChangeText={(text) => setValues((v) => ({ ...v, [d.key]: text }))}
                  keyboardType="numeric"
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  className="rounded-lg border border-stone-300 px-4 py-3 text-base"
                  style={{ fontFamily: fonts.sans, width: 88 }}
                />
                <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {d.unit}
                </Text>
              </View>
              {d.hint ? (
                <Text className="mt-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  {d.hint}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <Pressable
          onPress={handleSaveAll}
          disabled={savingKey === "all"} style={{ opacity: savingKey === "all" ? 0.5 : 1 }}
          className="mt-1 self-start rounded-lg bg-primary px-5 py-3"
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {savingKey === "all" ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>
      </View>
      )}

      {tab === "equipment" && (
      <View className="rounded-xl border border-stone-200 p-5">
        <Text className="mb-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Specialty Bars
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Named bars (trap bar, safety squat bar, etc.) and their real weight — members pick one of these from the weight calculator instead of typing a weight in from memory.
        </Text>

        {specialtyBars.map((bar, i) => (
          <View key={`${bar.name}-${i}`} className="mb-2.5 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              {bar.name}
            </Text>
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                {bar.weight} lb
              </Text>
              <Pressable onPress={() => handleDeleteSpecialtyBar(i)} disabled={savingBars} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {specialtyBars.length === 0 ? (
          <Text className="mb-3 text-sm text-stone-400" style={{ fontFamily: fonts.sans }}>
            No specialty bars added yet.
          </Text>
        ) : null}

        <View className="mt-3 flex-row items-end" style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Name
            </Text>
            <TextInput
              value={newBarName}
              onChangeText={setNewBarName}
              placeholder="e.g. Safety Squat Bar"
              className="rounded-lg border border-stone-300 px-4 py-3 text-base"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
          <View style={{ width: 110 }}>
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Weight (lb)
            </Text>
            <TextInput
              value={newBarWeight}
              onChangeText={setNewBarWeight}
              placeholder="65"
              keyboardType="decimal-pad"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              className="rounded-lg border border-stone-300 px-4 py-3 text-base"
              style={{ fontFamily: fonts.sans }}
            />
          </View>
          <Pressable
            onPress={handleAddSpecialtyBar}
            disabled={savingBars} style={{ opacity: savingBars ? 0.5 : 1 }}
            className="rounded-lg bg-primary px-5 py-3"
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              + Add
            </Text>
          </Pressable>
        </View>
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
            choicesEnabled
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

        <View className="mt-5 rounded-xl border border-stone-200 p-5">
          <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
            "Check-in available" notification
          </Text>
          <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            Sent to every nutrition client once a week when the new week's check-in opens.
          </Text>

          <View className="mb-4 flex-row items-center justify-between gap-4 py-1">
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Enabled
            </Text>
            <Switch
              value={checkinNotif.enabled}
              onValueChange={handleToggleCheckinNotifEnabled}
              disabled={savingCheckinNotif}
              trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={{ opacity: checkinNotif.enabled ? 1 : 0.4 }} pointerEvents={checkinNotif.enabled ? "auto" : "none"}>
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Title
            </Text>
            <TextInput
              value={checkinNotif.title}
              onChangeText={(t) => setCheckinNotif((c) => ({ ...c, title: t }))}
              className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Body
            </Text>
            <TextInput
              value={checkinNotif.body}
              onChangeText={(t) => setCheckinNotif((c) => ({ ...c, body: t }))}
              multiline
              inputAccessoryViewID={NUMERIC_DONE_ID}
              className="mb-4 min-h-[70px] rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Progress-photo reminder
            </Text>
            <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Added to the push only for clients whose photos are due on that check-in. It can&apos;t appear in the in-app popup, which is one shared message for everyone.
            </Text>
            <TextInput
              value={checkinNotif.photoLine}
              onChangeText={(t) => setCheckinNotif((c) => ({ ...c, photoLine: t }))}
              multiline
              className="mb-4 min-h-[60px] rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: fonts.sans }}
            />

            <Text className="mb-1.5 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Send on
            </Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((d) => {
                const active = checkinNotif.weekday === d.value;
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => setCheckinNotif((c) => ({ ...c, weekday: d.value }))}
                    className="rounded-full border px-3 py-1.5"
                    style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? colors.primary : "transparent" }}
                  >
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: active ? "white" : "#57534e" }}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-1.5 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              At (Boise time)
            </Text>
            <View className="mb-1" style={{ maxWidth: 200 }}>
              {isWeb ? (
                <select
                  value={checkinNotif.time}
                  onChange={(e) => setCheckinNotif((c) => ({ ...c, time: e.target.value }))}
                  style={{ fontFamily: fonts.sans, fontSize: 14, padding: "10px 10px", borderRadius: 8, border: "1px solid #d6d3d1" }}
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <NativePickerField options={TIME_OPTIONS} value={checkinNotif.time} onChange={(v) => setCheckinNotif((c) => ({ ...c, time: v }))} placeholder="Pick a time" />
              )}
            </View>

            <Pressable
              onPress={handleSaveCheckinNotif}
              disabled={savingCheckinNotif} style={{ opacity: savingCheckinNotif ? 0.5 : 1 }}
              className="mt-4 self-start rounded-lg bg-primary px-5 py-3"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {savingCheckinNotif ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </View>
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

      {tab === "messaging" && (
      <View className="rounded-xl border border-stone-200 p-5">
        <Text className="mb-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
          Messaging
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          The message bubble on the member and coach apps, plus the coach Messages inbox.
        </Text>

        <View className="flex-row items-center justify-between gap-4 py-4" style={{ borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
          <View className="flex-1">
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Messaging enabled
            </Text>
            <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Turns the message bubble and Messages inbox on or off for the whole gym.
            </Text>
          </View>
          <Switch
            value={messagingEnabledValue}
            onValueChange={handleToggleMessagingEnabled}
            disabled={savingMessaging}
            trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={{ opacity: messagingEnabledValue ? 1 : 0.4 }} pointerEvents={messagingEnabledValue ? "auto" : "none"}>
          <Text className="mb-1 mt-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
            Who can message
          </Text>
          <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Leave "Everyone" on for the whole gym, or turn it off to restrict messaging to specific memberships.
          </Text>

          <View className="flex-row items-center justify-between gap-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
            <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Everyone
            </Text>
            <Switch
              value={messagingAudience.includes(MESSAGING_AUDIENCE_ALL)}
              onValueChange={handleToggleMessagingEveryone}
              disabled={savingMessaging || !messagingEnabledValue}
              trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={{ opacity: messagingAudience.includes(MESSAGING_AUDIENCE_ALL) ? 0.4 : 1 }} pointerEvents={messagingAudience.includes(MESSAGING_AUDIENCE_ALL) ? "none" : "auto"}>
            {[
              { key: MESSAGING_AUDIENCE_NUTRITION, label: "Nutrition" },
              { key: MESSAGING_AUDIENCE_SPC, label: "SPC" },
              ...groupPrograms.map((p) => ({ key: p.id, label: p.name })),
            ].map((scope) => (
              <View key={scope.key} className="flex-row items-center justify-between gap-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
                <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  {scope.label}
                </Text>
                <Switch
                  value={messagingAudience.includes(scope.key)}
                  onValueChange={(v) => handleToggleMessagingScope(scope.key, v)}
                  disabled={savingMessaging || !messagingEnabledValue || messagingAudience.includes(MESSAGING_AUDIENCE_ALL)}
                  trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
                  thumbColor="#ffffff"
                />
              </View>
            ))}
          </View>
        </View>
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
          disabled={sendingPush} style={{ opacity: sendingPush ? 0.5 : 1 }}
          className="self-start rounded-lg border border-primary px-5 py-3"
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
