import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getSettings, updateSetting } from "../../lib/settings";
import { sendPush } from "../../lib/notifications/sendPush";
import { fonts, colors } from "../../lib/theme";
import { CoachShell } from "../../components/CoachShell";

const LABELS = {
  alert_lead_time_days: "Alert lead time (days before a block ends)",
  default_block_length_flagship_weeks: "Default Flagship block length (weeks)",
  default_block_length_bwa_weeks: "Default Better With Age block length (weeks)",
  default_block_length_spc_weeks: "Default SPC block length (weeks)",
};

export default function Settings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [sendingPush, setSendingPush] = useState(false);

  const load = useCallback(async () => {
    const rows = await getSettings();
    setSettings(rows);
    setValues(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const handleSave = async (key) => {
    setSavingKey(key);
    try {
      const numeric = Number(values[key]);
      await updateSetting(key, Number.isFinite(numeric) ? numeric : values[key]);
      await load();
    } catch (err) {
      Alert.alert("Failed to save", err.message ?? String(err));
    } finally {
      setSavingKey(null);
    }
  };

  const handleSendTestPush = async () => {
    setSendingPush(true);
    try {
      const result = await sendPush({ userId: profile.id, title: "Kova Strength", body: "Push notifications are wired up." });
      Alert.alert("Sent", JSON.stringify(result));
    } catch (err) {
      Alert.alert("Failed to send", err.message ?? String(err));
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
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Settings
      </Text>
      {settings.map((row) => (
        <View key={row.key} className="mb-6">
          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            {LABELS[row.key] ?? row.key}
          </Text>
          <View className="flex-row items-center gap-3">
            <TextInput
              value={values[row.key] ?? ""}
              onChangeText={(text) => setValues((v) => ({ ...v, [row.key]: text }))}
              keyboardType="numeric"
              className="flex-1 rounded-lg border border-stone-300 px-4 py-3 text-base"
              style={{ fontFamily: fonts.sans }}
            />
            <Pressable
              onPress={() => handleSave(row.key)}
              disabled={savingKey === row.key}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {savingKey === row.key ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text className="mb-2 mt-4 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 }}>
        Diagnostics
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
    </ScrollView>
    </CoachShell>
  );
}
