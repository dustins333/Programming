import { supabase } from "../supabase/client";

const programming = supabase.schema("programming");

// Photos a member attaches to one lift on one day (migration 0126). Hers
// alone: the table has no staff policy at all, so a coach reading this would
// get zero rows rather than a permission error. Nothing coach-side calls in
// here, and that is deliberate.
//
// Its own bucket rather than the nutrition `photos` one, which grants
// is_coach() ALL on everything in it -- see 0126's header.
const BUCKET = "lift-photos";

// The storage policy requires the first path segment to be the owner's id, so
// this shape is load bearing, not a convention. The timestamp keeps several
// photos on one lift on one day from colliding.
function storagePathFor(userId, exerciseId, date, ext) {
  return `${userId}/${exerciseId}/${date}-${Date.now()}.${ext}`;
}

// Same read-the-local-uri-as-an-ArrayBuffer dance as the progress-photo
// upload: React Native has no File-from-disk shortcut, and the same call
// accepts the web File/blob path unchanged.
//
// Unlike that one, a failed row insert cleans the uploaded file back up. The
// backend audit turned up 107 orphaned progress-photo files, which is exactly
// what "upload, then insert, and never reconcile" produces over time.
export async function uploadLiftPhoto({ userId, exerciseId, datePerformed, uri, mimeType }) {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = storagePathFor(userId, exerciseId, datePerformed, ext);

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { data, error } = await programming
    .from("lift_photos")
    .insert({ user_id: userId, exercise_id: exerciseId, date_performed: datePerformed, storage_path: path })
    .select("id, exercise_id, date_performed, storage_path, created_at")
    .single();

  if (error) {
    // Best effort: if this also fails the file is orphaned, which is no worse
    // than not trying, and the insert's error is the one worth reporting.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

// Every photo this member has on this lift, newest day first.
//
// `before` mirrors listLogsForExercise's cutoff EXACTLY, and it has to. That
// screen is opened two ways: from My History with no cutoff (show me
// everything), and from a lift's history sheet mid-session with one (show me
// what came BEFORE today, so my own half-finished sets don't read as "last
// time"). Without the same filter here, the second route stripped today's sets
// and kept today's photo -- so the session she was standing in rendered as a
// card holding a picture and nothing else. A cutoff has to apply to everything
// on the screen or it invents a day that never looked like that.
export async function listLiftPhotos(userId, exerciseId, before = null) {
  let query = programming
    .from("lift_photos")
    .select("id, exercise_id, date_performed, storage_path, created_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (before) query = query.lt("date_performed", before);
  const { data, error } = await query
    .order("date_performed", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// One day's photos for a whole session's worth of lifts, as
// exercise_id -> photos. Batched deliberately: this backs the thumbnail strip
// on the logging card, and a per-card query would be one round trip per lift
// on every session load. Same shape and the same reasoning as
// listSessionExerciseNotes, which SessionLogger already batches this way.
export async function listLiftPhotosForDate({ userId, exerciseIds, date }) {
  const map = new Map();
  if (!userId || !date || !exerciseIds?.length) return map;
  const { data, error } = await programming
    .from("lift_photos")
    .select("id, exercise_id, date_performed, storage_path, created_at")
    .eq("user_id", userId)
    .eq("date_performed", date)
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const photo of data ?? []) {
    if (!map.has(photo.exercise_id)) map.set(photo.exercise_id, []);
    map.get(photo.exercise_id).push(photo);
  }
  return map;
}

// Every lift photo this member has, with the lift's name, newest day first.
// One indexed read for the whole My History tab: the By Day timeline needs to
// know which days have a photo, and the session popup needs the photos
// themselves, and those two MUST come from the same rows -- a count that
// disagrees with the list it opens is how the live board once advertised "16
// sets logged" on a board that turned out to be empty.
//
// The name is embedded rather than looked up per photo, and falls back at the
// render site: member RLS on programming.exercises requires is_active, so an
// archived lift comes back with no name attached.
export async function listLiftPhotosForUser(userId) {
  const { data, error } = await programming
    .from("lift_photos")
    .select("id, exercise_id, date_performed, storage_path, created_at, exercises ( name )")
    .eq("user_id", userId)
    .order("date_performed", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// date_performed -> that day's photos. Built once by the caller and handed
// both to the timeline row and to the popup it opens.
export function groupPhotosByDate(photos) {
  const byDate = new Map();
  for (const photo of photos) {
    if (!byDate.has(photo.date_performed)) byDate.set(photo.date_performed, []);
    byDate.get(photo.date_performed).push(photo);
  }
  return byDate;
}

// Signed because the bucket is private. Five minutes is plenty for a viewer
// that opens on tap, and matches what the progress-photo lightbox uses.
export async function getLiftPhotoSignedUrls(storagePaths) {
  if (storagePaths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(storagePaths, 300);
  if (error) throw error;
  return Object.fromEntries(data.map((d) => [d.path, d.signedUrl]));
}

// File first, then the row: a missing row with a stray file is recoverable,
// where a row pointing at a file that is already gone renders as a broken
// photo she cannot get rid of.
export async function deleteLiftPhoto(photo) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  if (storageError) throw storageError;
  const { error } = await programming.from("lift_photos").delete().eq("id", photo.id);
  if (error) throw error;
}
