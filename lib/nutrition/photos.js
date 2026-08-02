import { supabase } from "../supabase/client";

const ANGLES = ["front", "side", "back"];
const CADENCE_WEEKS = { weekly: 1, biweekly: 2, monthly: 4, bimonthly: 8 };

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

export async function listPhotosByAngle(userId, angle) {
  const { data, error } = await supabase.from("photos").select("*").eq("client_id", userId).eq("angle", angle).order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllPhotos(userId) {
  const { data, error } = await supabase.from("photos").select("*").eq("client_id", userId).order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPhotoSignedUrl(storagePath) {
  const { data, error } = await supabase.storage.from("photos").createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
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

export async function setPhotoFrequency(userId, frequency, startedDate) {
  const { error } = await supabase.from("clients").update({ photo_frequency: frequency, photo_frequency_started_at: startedDate }).eq("id", userId);
  if (error) throw error;
}

export async function clearPhotoFrequency(userId) {
  const { error } = await supabase.from("clients").update({ photo_frequency: null, photo_frequency_started_at: null }).eq("id", userId);
  if (error) throw error;
}

export async function requirePhotosNextCheckin(userId, weekStart) {
  const { error } = await supabase.from("clients").update({ photo_requirement_next_checkin: weekStart }).eq("id", userId);
  if (error) throw error;
}

export async function clearPhotosNextCheckin(userId) {
  const { error } = await supabase.from("clients").update({ photo_requirement_next_checkin: null }).eq("id", userId);
  if (error) throw error;
}
