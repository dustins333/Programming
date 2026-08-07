import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Modal } from "react-native";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  pushAnnouncementNow,
} from "../../../lib/programming/announcements";
import { formatDateTimeInBoise } from "../../../lib/boiseDate";
import { confirmDeleteAnnouncement } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { SegmentedControl } from "../../../components/SegmentedControl";

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

// Deliberately not <input type="datetime-local"> — cross-browser behavior
// for that control is genuinely inconsistent (Safari in particular doesn't
// auto-close on date selection the way Chrome does, and support for a
// combined date+time picker with a `step` restricting minute granularity
// is spotty), and it read as broken in practice. A plain <select> (web) /
// modal list (native) fed by the same explicit option lists is slower to
// scan but behaves identically everywhere — same reasoning as every other
// web/native form control split in this app.
function toDateValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// scan-announcements only scans every 15 minutes anyway (0025's cron
// schedule) — picking anything finer would just be a false promise of
// precision, so TIME_OPTIONS below only ever offers :00/:15/:30/:45, and
// this rounds the default suggested time up to match.
function roundUpToQuarterHour(date) {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

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

function buildDateOptions(daysAhead) {
  const options = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < daysAhead; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    options.push({ value: toDateValue(d), label });
  }
  return options;
}

// Native has no built-in <select>/date-input equivalent — same
// Pressable-opens-a-modal-list pattern already used for PhotoCompare's
// DatePicker and PhotoSubmissionsEditor's angle picker, just with a
// ScrollView added since these lists (96 time slots) are much longer than
// those.
function NativePickerField({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-1 flex-row items-center justify-between rounded-lg border border-stone-300 px-3 py-2.5"
      >
        <Text style={{ fontFamily: fonts.sans, color: selected ? "#44403c" : "#a8a29e" }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#a8a29e" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-white p-2" style={{ maxHeight: "70%" }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="rounded-xl px-4 py-3"
                  style={o.value === value ? { backgroundColor: "#fdf6f2" } : undefined}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, color: o.value === value ? colors.primaryOnWhite : "#44403c" }}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function Announcements() {
  const { profile } = useAuth();
  const [groupPrograms, setGroupPrograms] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [targetGroupProgramId, setTargetGroupProgramId] = useState(null);
  const [timing, setTiming] = useState("now");
  const [scheduleDate, setScheduleDate] = useState(() => toDateValue(roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000))));
  const [scheduleTime, setScheduleTime] = useState(() => toTimeValue(roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000))));
  const [submitting, setSubmitting] = useState(false);

  const dateOptions = useMemo(() => buildDateOptions(60), []);

  const load = useCallback(async () => {
    try {
      const [programs, announcements] = await Promise.all([listGroupPrograms(), listAnnouncements()]);
      setGroupPrograms(programs);
      setHistory(announcements);
    } catch (err) {
      console.error("Failed to load announcements:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setAudience("all");
    setTargetGroupProgramId(null);
    setTiming("now");
    const nextDefault = roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
    setScheduleDate(toDateValue(nextDefault));
    setScheduleTime(toTimeValue(nextDefault));
  };

  const resolveSendAt = () => {
    if (timing === "now") return new Date().toISOString();
    if (!scheduleDate || !scheduleTime) throw new Error("Pick a date and time to schedule for");
    return new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
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
        { title, message, sendAt, targetType: audience, targetGroupProgramId },
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
      <ScrollView className="flex-1 bg-white px-8 py-8">
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Announcements
        </Text>
        <Text className="mb-7 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Send a note to your clients — it pops up the next time they open the app.
        </Text>

        <View className="mb-8 max-w-xl rounded-2xl border border-stone-200 p-5">
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
            numberOfLines={4}
            className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
            style={{ fontFamily: fonts.sans, minHeight: 90, textAlignVertical: "top" }}
          />

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
        ) : history.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            No announcements yet.
          </Text>
        ) : (
          history.map((a) => {
            const isFuture = new Date(a.send_at) > new Date();
            return (
              <View key={a.id} className="mb-2 max-w-xl flex-row items-start justify-between rounded-xl border border-stone-200 p-4">
                <View className="flex-1 pr-3">
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{a.title}</Text>
                  <Text className="mt-0.5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }} numberOfLines={2}>
                    {a.message}
                  </Text>
                  <Text className="mt-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {audienceLabel(a, groupPrograms)} · {isFuture ? "Scheduled for " : "Sent "}
                    {formatDateTimeInBoise(a.send_at)}
                    {a.pushed_at ? " · Pushed" : isFuture ? " · Pending" : " · In-app only"}
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
