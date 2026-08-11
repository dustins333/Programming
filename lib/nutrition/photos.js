import { supabase } from "../supabase/client";
import { addDays } from "../boiseDate";

const ANGLES = ["front", "side", "back"];
export const CADENCE_WEEKS = { weekly: 1, biweekly: 2, monthly: 4, bimonthly: 8 };

// How long after a week ends it stays the "current" week for check-in
// filing: a Mon-Sun week becomes current on its own Sunday and holds until
// the next Sunday (see computeWeekWindows' ANCHOR_DAY comment), so a member
// can be submitting about it any day from that Sunday through the following
// Saturday.
const FILING_GRACE_DAYS = 6;

// Falls back to the nearest logged weight (before or after) when a photo's
// own date has no daily_logs entry, so a photo never gets stored with a
// null weight — same lookup the standalone app's lib/photoWeight.js does.
async function findClosestWeight(userId, date) {
  const [{ data: before }, { data: after }] = await Promise.all([
    supabase.from("daily_logs").select("date, weight").eq("client_id", userId).not("weight", "is", null).lte("date", date).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("daily_logs").select("date, weight").eq("client_id", userId).not("weight", "is", null).gte("date", date).order("date", { ascending: true }).limit(1).maybeSingle(),
  ]);

  if (!before && !after) return null;
  if (!before) return after.weight;
  if (!after) return before.weight;

  const target = new Date(date);
  const beforeDiff = Math.abs(target - new Date(before.date));
  const afterDiff = Math.abs(target - new Date(after.date));
  return beforeDiff <= afterDiff ? before.weight : after.weight;
}

// RN has no File/FormData-from-disk shortcut like the browser — read the
// local picker/manipulator URI as an ArrayBuffer and hand that to
// supabase-js's storage upload, the standard pattern for Supabase Storage
// on React Native (the web File object works with the same call on web).
export async function uploadPhoto({ userId, angle, uri, mimeType, date }) {
  if (!ANGLES.includes(angle)) throw new Error("Invalid angle");

  const { data: todaysLog } = await supabase.from("daily_logs").select("weight").eq("client_id", userId).eq("date", date).maybeSingle();
  const weight = todaysLog?.weight ?? (await findClosestWeight(userId, date));

  const ext = mimeType === "image/png" ? "png" : "jpg";
  const path = `${userId}/${angle}/${date}-${Date.now()}.${ext}`;

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from("photos").upload(path, arrayBuffer, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("photos").insert({
    client_id: userId,
    angle,
    date,
    storage_path: path,
    weight,
    uploaded_by: userId,
  });
  if (insertError) throw insertError;
}

export async function listAllPhotos(userId) {
  const { data, error } = await supabase.from("photos").select("*").eq("client_id", userId).order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPhotoSignedUrls(storagePaths) {
  if (storagePaths.length === 0) return {};
  const { data, error } = await supabase.storage.from("photos").createSignedUrls(storagePaths, 300);
  if (error) throw error;
  return Object.fromEntries(data.map((d) => [d.path, d.signedUrl]));
}

export async function updatePhotoSubmission(photoId, updates) {
  const { error } = await supabase.from("photos").update(updates).eq("id", photoId);
  if (error) throw error;
}

export async function deletePhoto(photo) {
  const { error: storageError } = await supabase.storage.from("photos").remove([photo.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw error;
}

// --- Requirement cadence (coach-set, on public.clients) ---

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isPhotoRequirementWeek(client, weekStart) {
  if (client.photo_requirement_next_checkin === weekStart) return true;
  if (!client.photo_frequency || !client.photo_frequency_started_at) return false;
  const weeksSince = Math.floor((parseDate(weekStart) - parseDate(client.photo_frequency_started_at)) / (7 * 86400000));
  if (weeksSince < 0) return false;
  return weeksSince % CADENCE_WEEKS[client.photo_frequency] === 0;
}

export function hasAllAngles(photos) {
  const present = new Set(photos.map((p) => p.angle));
  return ANGLES.every((a) => present.has(a));
}

// The photos that count toward a required week. ONE definition, deliberately
// shared by the coach timeline and every member-side gate, because the two
// used to disagree and produced a real contradiction.
//
// The coach filtered strictly to week.start..week.end; the member gated on a
// rolling `today - 5 days` with no upper bound. That rolling window was
// never as generous as it looked: a week only becomes current once it's
// over, so today is always >= week.end, which puts `today - 5` at or after
// week.start+1 — it could never reach back before the week started, it only
// ever clipped the week's own first days off the front while letting photos
// from *after* the week count.
//
// The damage showed up on a late submission. A week stays current all the
// way through the following Saturday, by which point the rolling window had
// ZERO overlap with the week being checked in on — so the member could not
// satisfy the gate with any photo from that week, uploaded one dated after
// it, passed both member and submit gates, and the coach's row then rendered
// "Photos missing" on a check-in that had just come in with photos attached.
//
// So: the whole covered week counts, plus the filing window it stays current
// for. Bounded at both ends, so a photo from months later can't retroactively
// satisfy an old missed week.
//
// The coach-reopened path is intentionally NOT routed through this — a
// reopened week is filed long after its grace period, and already has its own
// documented "anything from that week onward" rule.
export function photosForRequirementWeek(photos, week) {
  const cutoff = addDays(week.end, FILING_GRACE_DAYS);
  return photos.filter((p) => p.date >= week.start && p.date <= cutoff);
}

// The one-off extra week (clients.photo_requirement_next_checkin) is now set
// from the Monday picker in ClientSettingsModal, written through that
// modal's own updateClient patch alongside the cadence — so the pair of
// single-purpose setters that used to back the check-in timeline's per-row
// toggle are gone. That toggle silently *moved* the flag off whatever week
// held it, since the column holds exactly one date.
