import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { NativePickerField } from "../../../components/NativePickerField";
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  pushAnnouncementNow,
} from "../../../lib/programming/announcements";
import { formatDateTimeInBoise, boiseInstantFrom } from "../../../lib/boiseDate";
import { buildDateOptions, TIME_OPTIONS, roundUpToQuarterHour, toDateValue, toTimeValue } from "../../../lib/dateTimeOptions";
import { confirmDeleteAnnouncement } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { GraphicPicker } from "../../../components/GraphicPicker";
import { GraphicImage } from "../../../components/GraphicImage";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

const isWeb = Platform.OS === "web";

const AUDIENCE_OPTIONS = [
  { key: "all", label: "Everyone" },
  { key: "group_program", label: "Group program" },
  { key: "spc", label: "SPC" },
  { key: "nutrition", label: "Nutrition" },
];

const TIMING_OPTIONS = [
  { key: "now", label: "Send now" },
  { key: "later", label: "Schedule" },
];

function audienceLabel(announcement, groupPrograms) {
  if (announcement.target_type === "group_program") {
    const program = groupPrograms.find((p) => p.id === announcement.target_group_program_id);
    return program ? program.name : "Group program (deleted)";
  }
  const found = AUDIENCE_OPTIONS.find((o) => o.key === announcement.target_type);
  return found ? found.label : announcement.target_type;
}

// The date/time option lists moved to lib/dateTimeOptions.js once the event
// composer needed the same scheduling controls — see that file's header for
// why these are explicit <select>/modal lists rather than datetime-local.

// Native's stand-in for <select> — see components/NativePickerField.js,
// extracted from here so PayrollOtherRow's own native type picker could
// reuse it instead of duplicating it.

export default function Announcements() {
  const { profile } = useAuth();
  const router = useRouter();
  const [groupPrograms, setGroupPrograms] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imagePath, setImagePath] = useState(null);
  // KeyboardDoneButton floats above the keyboard on iOS (app/_layout.js) —
  // extra bottom padding when it's showing keeps it from covering the
  // Message field. See lib/scrollToKeyboard.js.
  const keyboardHeight = useKeyboardHeight();
  const extraKeyboardPadding = keyboardHeight > 0 ? DONE_BAR_HEIGHT : 0;
  const [audience, setAudience] = useState("all");
  const [targetGroupProgramId, setTargetGroupProgramId] = useState(null);
  const [requiresReload, setRequiresReload] = useState(false);
  const [timing, setTiming] = useState("now");
  const [scheduleDate, setScheduleDate] = useState(() => toDateValue(roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000))));
  const [scheduleTime, setScheduleTime] = useState(() => toTimeValue(roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000))));
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const dateOptions = useMemo(() => buildDateOptions(60), []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [programs, announcements] = await Promise.all([listGroupPrograms(), listAnnouncements()]);
      setGroupPrograms(programs);
      setHistory(announcements);
    } catch (err) {
      // A console.error only meant a failed load rendered "No announcements
      // yet" as if it were true, while the empty group-program list silently
      // blocked every targeted send behind its own validation.
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Tab root, kept mounted across tab switches on native — refetch on
  // every focus so the History list reflects an announcement just sent.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setImagePath(null);
    setAudience("all");
    setTargetGroupProgramId(null);
    setRequiresReload(false);
    setTiming("now");
    const nextDefault = roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
    setScheduleDate(toDateValue(nextDefault));
    setScheduleTime(toTimeValue(nextDefault));
  };

  const resolveSendAt = () => {
    if (timing === "now") return new Date().toISOString();
    if (!scheduleDate || !scheduleTime) throw new Error("Pick a date and time to schedule for");
    // Boise, not the coach's device timezone — the picker's options are gym
    // time and the History line below renders in gym time, so resolving in
    // device-local meant a travelling coach scheduled the wrong hour and
    // then saw a time they hadn't picked.
    return boiseInstantFrom(scheduleDate, scheduleTime);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toastError("Title and message are both required");
      return;
    }
    if (audience === "group_program" && !targetGroupProgramId) {
      toastError("Pick a group program to target");
      return;
    }

    setSubmitting(true);
    try {
      const sendAt = resolveSendAt();
      const created = await createAnnouncement(
        { title, message, sendAt, targetType: audience, targetGroupProgramId, requiresReload, imagePath },
        profile.id
      );
      if (timing === "now") {
        // Fire-and-report, not fire-and-forget — a coach hitting "Send now"
        // should know if push delivery itself failed, even though the
        // announcement row (and in-app popup) is already created either
        // way. Doesn't block on infra not being fully live yet (no
        // registered devices, functions not deployed) — that surfaces as a
        // normal error here rather than crashing the compose flow.
        try {
          const result = await pushAnnouncementNow(created.id);
          if (result?.pushed === 0 && result?.audience > 0) {
            toastError(
              `Announcement sent, but push didn't go out — ${result.audience} people were in the audience, 0 delivered. Check registered devices.`
            );
          } else {
            toastSuccess("Announcement sent.");
          }
        } catch (pushErr) {
          console.error("Push send failed (announcement was still created):", pushErr);
          toastError("Announcement created, but push failed", pushErr);
        }
      } else {
        toastSuccess("Announcement scheduled.");
      }
      resetForm();
      await load();
    } catch (err) {
      toastError("Failed to send", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmDeleteAnnouncement();
    if (!confirmed) return;
    try {
      await deleteAnnouncement(id);
      await load();
    } catch (err) {
      toastError("Failed to delete", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 32 + extraKeyboardPadding }}>
        {Platform.OS !== "web" ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
            className="mb-4 self-start"
          >
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Announcements
        </Text>
        <Text className="mb-7 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Send a note to your clients — it pops up the next time they open the app.
        </Text>

        <View className="mb-8 max-w-xl rounded-2xl border border-stone-200 p-5">
          <GraphicPicker value={imagePath} onChange={setImagePath} folder="announcements" />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Gym closed Monday"
            className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Message
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="What do you want to tell them?"
            multiline
            inputAccessoryViewID={NUMERIC_DONE_ID}
            numberOfLines={4}
            className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans, minHeight: 90, textAlignVertical: "top" }}
          />

          <Pressable onPress={() => setRequiresReload((v) => !v)} className="mb-4 flex-row items-center gap-2">
            <Ionicons
              name={requiresReload ? "checkbox" : "checkbox-outline"}
              size={20}
              color={requiresReload ? colors.primary : "#a8a29e"}
            />
            <Text className="flex-1 text-sm" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
              Requires a refresh to take effect (adds a "Refresh now" button, web only)
            </Text>
          </Pressable>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Audience
          </Text>
          <SegmentedControl segments={AUDIENCE_OPTIONS} activeKey={audience} onSelect={setAudience} />

          {audience === "group_program" ? (
            <View className="mb-4">
              <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                Which program?
              </Text>
              {isWeb ? (
                <select
                  value={targetGroupProgramId ?? ""}
                  onChange={(e) => setTargetGroupProgramId(e.target.value || null)}
                  style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", maxWidth: 280 }}
                >
                  <option value="">Select a program…</option>
                  {groupPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {groupPrograms.map((p) => {
                    const active = p.id === targetGroupProgramId;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setTargetGroupProgramId(p.id)}
                        className="rounded-full border px-3 py-2"
                        style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? "#fdf6f2" : "white" }}
                      >
                        <Text style={{ fontFamily: fonts.sansMedium, color: active ? colors.primaryOnWhite : "#57534e", fontSize: 13 }}>
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          <Text className="mb-1 mt-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Timing
          </Text>
          <SegmentedControl segments={TIMING_OPTIONS} activeKey={timing} onSelect={setTiming} />

          {timing === "later" ? (
            <View className="mb-4">
              <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                Send at
              </Text>
              {isWeb ? (
                <View className="flex-row gap-2">
                  <select
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", maxWidth: 180 }}
                  >
                    {dateOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", maxWidth: 140 }}
                  >
                    {TIME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <NativePickerField options={dateOptions} value={scheduleDate} onChange={setScheduleDate} placeholder="Pick a date" />
                  <NativePickerField options={TIME_OPTIONS} value={scheduleTime} onChange={setScheduleTime} placeholder="Pick a time" />
                </View>
              )}
            </View>
          ) : null}

          <Pressable
            onPress={handleSend}
            disabled={submitting}
            className="mt-2 items-center rounded-lg px-5 py-3"
            style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {submitting ? "Sending…" : timing === "now" ? "Send now" : "Schedule announcement"}
            </Text>
          </Pressable>
        </View>

        <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
          History
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : loadError ? (
          <View>
            <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load announcements. {loadError}
            </Text>
            <Pressable onPress={load} className="self-start">
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </View>
        ) : history.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            No announcements yet — compose one above and it'll appear here.
          </Text>
        ) : (
          history.map((a) => {
            const isFuture = new Date(a.send_at) > new Date();
            return (
              <View key={a.id} className="mb-2 max-w-xl flex-row items-start justify-between rounded-xl border border-stone-200 p-4">
                {a.image_path ? (
                  <View className="mr-3" style={{ width: 44 }}>
                    <GraphicImage path={a.image_path} minRatio={1} radius={8} />
                  </View>
                ) : null}
                <View className="flex-1 pr-3">
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{a.title}</Text>
                  <Text className="mt-0.5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }} numberOfLines={2}>
                    {a.message}
                  </Text>
                  <Text className="mt-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {audienceLabel(a, groupPrograms)} · {isFuture ? "Scheduled for " : "Sent "}
                    {formatDateTimeInBoise(a.send_at)}
                    {a.pushed_at ? " · Pushed" : isFuture ? " · Pending" : " · In-app only"}
                    {a.requires_reload ? " · Refresh prompt" : ""}
                  </Text>
                </View>
                <Pressable onPress={() => handleDelete(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#a8a29e" />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </CoachShell>
  );
}
