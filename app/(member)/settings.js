import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Switch, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { getClient, getCoachRow } from "../../lib/nutrition/clients";
import { updateOwnNotificationPrefs } from "../../lib/notifications/memberPrefs";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// design_handoff_v2_settings_nutrition — new member-facing Settings screen,
// reached via the gear icon on My Week's header (app/(member)/index.js).
// Not a 5th tab; registered as a hidden route in _layout.js, same pattern
// as plan-block/plan-spc-block.

function Card({ children }) {
  return (
    <View
      className="mb-5 rounded-xl p-4"
      style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white", shadowColor: "#44403c", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1 }}
    >
      {children}
    </View>
  );
}

function CardTitle({ children }) {
  return (
    <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

function Row({ label, value, actionLabel, onPress, last }) {
  return (
    <View className="flex-row items-center justify-between py-3" style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
      <View>
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        {value ? (
          <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {value}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text className="text-sm" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
            {actionLabel} ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ToggleRow({ label, description, value, onValueChange, last }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-3" style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: "#f1efed" }}>
      <View className="flex-1">
        <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
          {label}
        </Text>
        <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#e7e5e4", true: "#4d6142" }} thumbColor="#ffffff" />
    </View>
  );
}

// Inline text-entry field, expand/collapse — used for both the email and
// password change rows so neither needs its own separate route/modal.
function InlineChangeForm({ visible, placeholder, secure, submitLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!visible) return null;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
      setValue("");
      onCancel();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-3 mt-1">
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        secureTextEntry={secure}
        autoCapitalize="none"
        className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      {error ? (
        <Text className="mb-2 text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={onCancel} className="rounded-lg border border-stone-300 px-4 py-2.5">
          <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSubmit} disabled={saving || !value} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {saving ? "Saving…" : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const CONFIRM_TEXT = "DELETE";

function DeleteAccountModal({ visible, email, onClose, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!visible) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message ?? String(err));
      setDeleting(false);
    }
  };

  return (
    <View className="mt-2 rounded-lg p-4" style={{ backgroundColor: "#fdece5", borderWidth: 1, borderColor: "#f5c9b8" }}>
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
        Type {CONFIRM_TEXT} to confirm. This permanently deletes your account, logs, and photos — it can't be undone.
      </Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder={CONFIRM_TEXT}
        autoCapitalize="characters"
        className="mb-2 rounded-lg border border-stone-300 bg-white px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      {error ? (
        <Text className="mb-2 text-xs text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable onPress={onClose} className="rounded-lg border border-stone-300 bg-white px-4 py-2.5">
          <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          disabled={typed !== CONFIRM_TEXT || deleting}
          className="rounded-lg px-4 py-2.5 disabled:opacity-50"
          style={{ backgroundColor: "#b23a22" }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {deleting ? "Deleting…" : "Delete account"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function MemberSettings() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [changingEmail, setChangingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notifValues, setNotifValues] = useState(null);
  const [coachName, setCoachName] = useState(undefined); // undefined = loading, null = no nutrition client row
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setNotifValues({
      dailyLogReminder: profile.notify_daily_log_reminder ?? true,
      checkinAvailable: profile.notify_checkin_available ?? true,
      coachMessages: profile.notify_coach_messages ?? true,
    });
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const client = await getClient(profile.id);
        if (!client) {
          setCoachName(null);
          return;
        }
        const coach = await getCoachRow(client.coach_id);
        setCoachName(coach?.name ?? null);
      } catch (err) {
        console.error("Failed to load assigned coach:", err);
        setCoachName(null);
      }
    })();
  }, [profile]);

  const handleChangeEmail = async (email) => {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
    Alert.alert("Check your email", "Confirm the change from the link we just sent.");
  };

  const handleChangePassword = async (password) => {
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    Alert.alert("Password updated");
  };

  const handleToggleNotif = async (key, value) => {
    const previous = notifValues;
    const next = { ...notifValues, [key]: value };
    setNotifValues(next);
    try {
      await updateOwnNotificationPrefs(next);
    } catch (err) {
      setNotifValues(previous);
      Alert.alert("Failed to save", err.message ?? String(err));
    }
  };

  const handleDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) throw error;
    await signOut();
    router.replace("/login");
  };

  if (!profile || !notifValues) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-5 pb-8" contentContainerStyle={{ paddingTop: insets.top + 12 }}>
      <Pressable onPress={() => router.back()} className="mb-3 self-start">
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
      </Pressable>
      <Text className="mb-5 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Settings
      </Text>

      <Card>
        <CardTitle>Account</CardTitle>
        <Row label="Email" value={profile.email} actionLabel="Change" onPress={() => setChangingEmail((v) => !v)} />
        <InlineChangeForm
          visible={changingEmail}
          placeholder="New email address"
          submitLabel="Save"
          onSubmit={handleChangeEmail}
          onCancel={() => setChangingEmail(false)}
        />
        <Row label="Password" actionLabel="Change" onPress={() => setChangingPassword((v) => !v)} last={!changingPassword} />
        <InlineChangeForm
          visible={changingPassword}
          placeholder="New password"
          secure
          submitLabel="Save"
          onSubmit={handleChangePassword}
          onCancel={() => setChangingPassword(false)}
        />
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <ToggleRow
          label="Daily log reminder"
          description="An evening nudge if today's nutrition log isn't finalized."
          value={notifValues.dailyLogReminder}
          onValueChange={(v) => handleToggleNotif("dailyLogReminder", v)}
        />
        <ToggleRow
          label="Weekly check-in available"
          description="Sunday announcement that the new week's check-in is open."
          value={notifValues.checkinAvailable}
          onValueChange={(v) => handleToggleNotif("checkinAvailable", v)}
        />
        <ToggleRow
          label="Coach messages"
          description="New comments from your coach."
          value={notifValues.coachMessages}
          onValueChange={(v) => handleToggleNotif("coachMessages", v)}
          last
        />
      </Card>

      {coachName ? (
        <Card>
          <CardTitle>About</CardTitle>
          <Row label="Assigned coach" value={coachName} last />
        </Card>
      ) : null}

      <Pressable onPress={signOut} className="mb-5 items-center rounded-lg border border-stone-300 py-3.5">
        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>Sign out</Text>
      </Pressable>

      <View className="rounded-xl p-4" style={{ backgroundColor: "#fdece5", borderWidth: 1, borderColor: "#f5c9b8" }}>
        <CardTitle>Danger zone</CardTitle>
        <Text className="mb-3 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
          Permanently deletes your account, logs, and photos. This can't be undone.
        </Text>
        {!deleteOpen ? (
          <Pressable onPress={() => setDeleteOpen(true)} className="self-start rounded-lg px-4 py-2.5" style={{ backgroundColor: "#b23a22" }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Delete account
            </Text>
          </Pressable>
        ) : (
          <DeleteAccountModal visible={deleteOpen} email={profile.email} onClose={() => setDeleteOpen(false)} onConfirm={handleDeleteAccount} />
        )}
      </View>
    </ScrollView>
  );
}
