import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { getSettings, updateSetting } from "../../lib/settings";

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

  if (!settings) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#a46a57" size="large" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8">
      <Text className="mb-6 text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Settings
      </Text>
      {settings.map((row) => (
        <View key={row.key} className="mb-6">
          <Text className="mb-1 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            {LABELS[row.key] ?? row.key}
          </Text>
          <View className="flex-row items-center gap-3">
            <TextInput
              value={values[row.key] ?? ""}
              onChangeText={(text) => setValues((v) => ({ ...v, [row.key]: text }))}
              keyboardType="numeric"
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 text-base"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            <Pressable
              onPress={() => handleSave(row.key)}
              disabled={savingKey === row.key}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {savingKey === row.key ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
