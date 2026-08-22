import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors, statusColors } from "../lib/theme";

// A dropdown of real GoHighLevel calendars rather than a text field for the
// calendar id. The ids are 20 opaque characters (t7fAF1sImGuso1im6UR6) and a
// typo has no visible symptom on this screen at all -- the member is the one
// who finds out, days later, when the slot picker comes back empty. Picking
// from the live list makes a wrong calendar impossible instead of silent.
//
// The calendar list is passed in rather than fetched here: the Team tab
// already needs it to label each coach's row, and fetching it twice would
// mean two GoHighLevel round trips every time this opens.
//
// `prompted` is set when this opened by itself right after Nutrition access
// was switched on for someone, rather than from the Nutrition calendar row
// on their own line. Only the framing changes -- an interruption should say
// why it interrupted, and its dismiss should read as "later", not "undo".
export function CoachCalendarPicker({
  visible,
  coach,
  calendars,
  loading,
  loadError,
  onRetry,
  defaultCalendarId,
  prompted = false,
  onClose,
  onSave,
}) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(coach?.ghl_calendar_id ?? null);
    setSaveError(null);
    // coach?.id rather than the whole object: the parent rebuilds its coaches
    // array on every optimistic permission toggle, and re-running this on a
    // new object identity would wipe a selection mid-pick.
  }, [visible, coach?.id, coach?.ghl_calendar_id]);

  if (!coach) return null;

  const defaultName = calendars.find((c) => c.id === defaultCalendarId)?.name;
  const dirty = (selected ?? null) !== (coach.ghl_calendar_id ?? null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(coach, selected ?? null);
      onClose();
    } catch (err) {
      // Stay open on failure -- closing would silently drop the pick and
      // leave the row still reading "Not set".
      setSaveError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const firstName = (coach.name ?? "").trim().split(/\s+/)[0] || coach.name;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6" style={{ maxHeight: "88%" }}>
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            {prompted ? `${firstName} now coaches nutrition` : "Nutrition calendar"}
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {prompted
              ? `Which calendar should ${firstName}'s check-in calls book onto? You can change this any time from this page.`
              : `Weekly check-in Zoom calls for ${firstName}'s nutrition clients get booked onto this calendar.`}
          </Text>

          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : loadError ? (
            <View className="py-4">
              <Text className="mb-3 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                {loadError}
              </Text>
              <Pressable onPress={onRetry} className="self-start rounded-lg border border-stone-300 px-4 py-2.5">
                <Text style={{ fontFamily: fonts.sansMedium }}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ flexShrink: 1 }}>
              <CalendarOption
                label="Use the gym default"
                sublabel={defaultName ? `Currently ${defaultName}` : "The gym-wide check-in calendar"}
                selected={selected === null}
                onPress={() => setSelected(null)}
              />
              {calendars.map((cal) => (
                <CalendarOption
                  key={cal.id}
                  label={cal.name}
                  sublabel={cal.type === "round_robin" ? "Round robin" : cal.type === "personal" ? "Personal" : null}
                  selected={selected === cal.id}
                  onPress={() => setSelected(cal.id)}
                />
              ))}
              {calendars.length === 0 ? (
                <Text className="py-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  No calendars found in GoHighLevel.
                </Text>
              ) : null}
            </ScrollView>
          )}

          {saveError ? (
            <Text className="mt-3 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
              {saveError}
            </Text>
          ) : null}

          <View className="mt-5 flex-row justify-end gap-3">
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ opacity: saving ? 0.5 : 1 }}
              className="rounded-lg border border-stone-300 px-4 py-3"
            >
              <Text style={{ fontFamily: fonts.sansMedium }}>{prompted ? "Not now" : "Cancel"}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || loading || Boolean(loadError) || !dirty}
              style={{ opacity: saving || loading || loadError || !dirty ? 0.5 : 1 }}
              className="rounded-lg bg-primary px-4 py-3"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Saving…" : "Save calendar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CalendarOption({ label, sublabel, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: selected ? colors.primary : "#e7e5e4", backgroundColor: selected ? "#fdf6f2" : "#ffffff" }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: 20, height: 20, borderWidth: selected ? 0 : 1.5, borderColor: "#d9d4cd", backgroundColor: selected ? colors.primary : "#ffffff" }}
      >
        {selected ? <Ionicons name="checkmark" size={13} color="#ffffff" /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-stone-800" style={{ fontFamily: fonts.sansMedium, fontSize: 14 }}>
          {label}
        </Text>
        {sublabel ? (
          <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// The at-a-glance half of this feature, on each coach's row in Settings ->
// Team. A coach with no calendar of their own is not broken -- their clients
// fall back to the gym default -- but it IS the state an admin wants to
// notice, so it renders in the needsAction tone rather than as quiet grey
// text. Set calendars show their real name, not the id: "Abby Nutrition" is
// checkable at a glance in a way E1KaRpNIxn3JMFNl2iVs never is.
export function CoachCalendarRow({ coach, calendars, loading, onPress, compact = false }) {
  const set = Boolean(coach.ghl_calendar_id);
  const match = set ? calendars.find((c) => c.id === coach.ghl_calendar_id) : null;
  // A set id with no matching calendar means it was removed in GHL since it
  // was picked — worth saying plainly rather than rendering a blank name.
  const label = !set
    ? "Nutrition calendar not set"
    : match
      ? match.name
      : loading
        ? "Nutrition calendar…"
        : "Calendar no longer in GoHighLevel";
  const tone = set && (match || loading) ? { color: "#78716c", icon: "calendar-outline" } : { color: statusColors.needsAction.text, icon: "alert-circle-outline" };

  return (
    <Pressable onPress={onPress} hitSlop={6} className="mt-1 flex-row items-center gap-1.5 self-start">
      <Ionicons name={tone.icon} size={compact ? 12 : 13} color={tone.color} />
      <Text style={{ fontFamily: fonts.sans, fontSize: compact ? 11.5 : 12, color: tone.color }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: compact ? 11.5 : 12, color: colors.primaryOnWhite }}>
        {set ? "Change" : "Set"}
      </Text>
    </Pressable>
  );
}
