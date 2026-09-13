import { programming } from "../supabase/client";
import { todayInBoise, mondayOnOrBefore, addDays } from "../boiseDate";

// Conditioning (migration 0130): zone 2 cardio with no programming behind it.
// A member logs average heart rate, time, how it felt and notes; the weekly
// target is `sessions_per_week` on her enrolment row, and logging more than
// the target still counts.

// How it felt, 1-5. The word under each face matters as much as the face: an
// emoji alone reads differently to different people.
export const FEEL_OPTIONS = [
  { value: 1, emoji: "😣", label: "Rough" },
  { value: 2, emoji: "🙁", label: "Hard" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export function feelOption(value) {
  return FEEL_OPTIONS.find((o) => o.value === Number(value)) ?? null;
}

// ---------------------------------------------------------------- enrolment

export async function getConditioningClient(userId) {
  const { data, error } = await programming.from("conditioning_clients").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export function isConditioningActive(client) {
  return client?.status === "active";
}

// Turning it on creates the row the first time and reactivates it after that,
// so a frequency set before it was switched off comes back.
export async function setConditioningEnrolled(userId, enrolled) {
  if (enrolled) {
    const { error } = await programming
      .from("conditioning_clients")
      .upsert({ user_id: userId, status: "active" }, { onConflict: "user_id" });
    if (error) throw error;
    return;
  }
  await updateConditioningClient(userId, { status: "inactive" });
}

// Asks for the touched row back and treats none as a failure. An update RLS
// filters out affects zero rows and returns no error, which reads as saved.
export async function updateConditioningClient(userId, fields) {
  const { data, error } = await programming
    .from("conditioning_clients")
    .update(fields)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Nothing was updated. That change did not save, try again.");
}

// --------------------------------------------------------------------- logs

export async function listConditioningLogs(userId, { limit = 200 } = {}) {
  const { data, error } = await programming
    .from("conditioning_logs")
    .select("*")
    .eq("user_id", userId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listConditioningLogsForRange(userId, startDate, endDate) {
  const { data, error } = await programming
    .from("conditioning_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("performed_on", startDate)
    .lte("performed_on", endDate)
    .order("performed_on", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// This week so far, Monday to Sunday in Boise.
export async function listConditioningLogsThisWeek(userId, today = todayInBoise()) {
  const start = mondayOnOrBefore(today);
  return listConditioningLogsForRange(userId, start, addDays(start, 6));
}

export async function getConditioningLog(id) {
  const { data, error } = await programming.from("conditioning_logs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

function toRow({ performedOn, avgHeartRate, durationMinutes, feel, notes }) {
  const row = {};
  if (performedOn !== undefined) row.performed_on = performedOn;
  if (avgHeartRate !== undefined) row.avg_heart_rate = avgHeartRate ?? null;
  if (durationMinutes !== undefined) row.duration_minutes = durationMinutes;
  if (feel !== undefined) row.feel = feel ?? null;
  if (notes !== undefined) row.notes = notes?.trim() ? notes.trim() : null;
  return row;
}

export async function createConditioningLog({ userId, ...fields }) {
  const { data, error } = await programming
    .from("conditioning_logs")
    .insert({ user_id: userId, performed_on: fields.performedOn ?? todayInBoise(), ...toRow({ ...fields, performedOn: undefined }) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConditioningLog(id, fields) {
  const { data, error } = await programming
    .from("conditioning_logs")
    .update({ ...toRow(fields), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Nothing was updated. That change did not save, try again.");
  return data[0];
}

export async function deleteConditioningLog(id) {
  const { error } = await programming.from("conditioning_logs").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------------ display

// "45 min | 132 bpm | 🙂 Good". Anything she left blank is simply absent.
export function describeConditioningLog(log, { separator = " | " } = {}) {
  if (!log) return "";
  const parts = [`${log.duration_minutes} min`];
  if (log.avg_heart_rate != null) parts.push(`${log.avg_heart_rate} bpm`);
  const feel = feelOption(log.feel);
  if (feel) parts.push(`${feel.emoji} ${feel.label}`);
  return parts.join(separator);
}

// Validates the form's raw strings. Returns { values } or { error }.
export function parseConditioningForm({ heartRate, minutes, feel, notes }) {
  const minutesNum = Number(String(minutes ?? "").trim());
  if (!String(minutes ?? "").trim() || !Number.isFinite(minutesNum) || minutesNum < 1) {
    return { error: "Add how many minutes you did." };
  }
  if (minutesNum > 600) return { error: "That time looks too long. Check the minutes." };

  let hr = null;
  if (String(heartRate ?? "").trim()) {
    hr = Number(String(heartRate).trim());
    if (!Number.isFinite(hr) || hr < 30 || hr > 240) return { error: "Average heart rate should be between 30 and 240." };
  }

  return {
    values: {
      durationMinutes: Math.round(minutesNum),
      avgHeartRate: hr == null ? null : Math.round(hr),
      feel: feel ? Number(feel) : null,
      notes: notes ?? "",
    },
  };
}
