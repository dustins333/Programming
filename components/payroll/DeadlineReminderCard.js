import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, Switch, ActivityIndicator, Platform } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { NativePickerField } from "../NativePickerField";
import { toastError, toastSuccess } from "../../lib/toast";
import {
  getDeadlineReminderSettings,
  saveDeadlineReminderSettings,
  setDeadlineRemindersEnabled,
  buildHourOptions,
  describeNextReminders,
} from "../../lib/payroll/deadlineReminder";

const isWeb = Platform.OS === "web";
const HOUR_OPTIONS = buildHourOptions();

function TimeField({ label, hint, value, onChange }) {
  return (
    <View className="flex-1" style={{ minWidth: 180 }}>
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <Text className="mb-1.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
        {hint}
      </Text>
      {isWeb ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontFamily: fonts.sans, fontSize: 14, padding: "10px 10px", borderRadius: 8, border: "1px solid #d6d3d1" }}
        >
          {HOUR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <NativePickerField options={HOUR_OPTIONS} value={value} onChange={onChange} placeholder="Pick a time" />
      )}
    </View>
  );
}

// Admin control for the payroll deadline push (scan-payroll-deadline-
// reminders). Until now these three values were only editable by hand in
// core.settings — deliberately NOT added to Settings -> Program Defaults,
// which whitelists its own four keys precisely because rendering that
// shared table wholesale once corrupted unrelated rows.
export function DeadlineReminderCard() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [togglePending, setTogglePending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSettings(await getDeadlineReminderSettings());
    } catch (err) {
      setLoadError(err?.message || "Failed to load reminder settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The switch commits on flip (matching every other notification toggle in
  // the app) while the two times batch behind Save — a half-typed schedule
  // shouldn't go live, but an off switch should take effect immediately.
  const handleToggle = async (next) => {
    const previous = settings.enabled;
    setSettings((s) => ({ ...s, enabled: next }));
    setTogglePending(true);
    try {
      await setDeadlineRemindersEnabled(next);
    } catch (err) {
      setSettings((s) => ({ ...s, enabled: previous }));
      toastError("Failed to update", err);
    } finally {
      setTogglePending(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDeadlineReminderSettings(settings);
      toastSuccess("Reminder schedule saved");
    } catch (err) {
      toastError("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="mb-6 max-w-xl rounded-xl border border-stone-200 p-5">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="mb-6 max-w-xl rounded-xl border border-stone-200 p-5">
        <Text className="mb-2 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
          {loadError}
        </Text>
        <Pressable onPress={load} className="self-start">
          <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const next = describeNextReminders(settings);

  return (
    <View className="mb-6 max-w-xl rounded-xl border border-stone-200 p-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Deadline reminders
          </Text>
          <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Push any coach who hasn&apos;t submitted their payroll for the period that&apos;s ending.
          </Text>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={handleToggle}
          disabled={togglePending}
          trackColor={{ false: "#e7e5e4", true: "#4d6142" }}
          thumbColor="#ffffff"
        />
      </View>

      {settings.enabled ? (
        <>
          <View className="mt-5 flex-row flex-wrap gap-4">
            <TimeField
              label="First reminder"
              hint="On the last day of the pay period."
              value={settings.deadlineTime}
              onChange={(v) => setSettings((s) => ({ ...s, deadlineTime: v }))}
            />
            <TimeField
              label="Follow-up"
              hint="The next day, to anyone still not submitted."
              value={settings.followupTime}
              onChange={(v) => setSettings((s) => ({ ...s, followupTime: v }))}
            />
          </View>

          <View className="mt-4 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#fdf6f2" }}>
            <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>
              Next reminders (Boise time)
            </Text>
            {next.map((item) => (
              <Text key={item.kind} className="mt-1 text-xs" style={{ fontFamily: fonts.sans, color: "#44403c" }}>
                {item.label}
              </Text>
            ))}
          </View>

          <Text className="mt-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            On the hour only — the scan runs hourly, so a half-hour time would just wait for the next one.
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            className="mt-4 self-start rounded-lg px-5 py-3"
            style={{ backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {saving ? "Saving…" : "Save changes"}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
