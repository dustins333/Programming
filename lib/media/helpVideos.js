import * as ImagePicker from "expo-image-picker";
import { programming, supabase } from "../supabase/client";

// Member-facing "how do I ...?" videos — short screen recordings Terra
// uploads (how to log a session, how to match TrueCoach history), listed
// under Help in member Settings.
//
// PUBLIC bucket, same reasoning as `graphics` (see lib/media/graphics.js):
// these are published to the whole gym, and a signed URL that expires
// part-way through playback is a worse failure than a guessable one.
// NOTHING client-specific may ever be uploaded here.
const BUCKET = "help-videos";

// Matches the bucket's own file_size_limit in 0082. Checked client-side too
// so an over-size file fails with a sentence rather than an opaque storage
// error after a long upload.
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

// MP4 plays everywhere. .mov (video/quicktime) is accepted by the bucket so
// an iPhone export doesn't hard-fail, but Chrome and Android can't play it
// when it's HEVC-encoded — the admin screen warns rather than blocks, since
// an H.264 .mov usually does play and refusing it outright would be wrong.
export const UNIVERSAL_MIME = "video/mp4";

const EXT_BY_MIME = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// Library only — a how-to video is a screen recording that already exists,
// never something filmed on the spot. On web this is a plain file dialog
// (accept="video/mp4,video/quicktime,video/x-m4v,video/*").
// Returns null when cancelled or when library permission is denied.
export async function pickHelpVideo() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  // mimeType is reliable on web and on current native SDKs, but fall back to
  // the extension rather than uploading with no content type — storage would
  // then reject it against the bucket's allowed_mime_types list.
  const fromName = asset.fileName?.toLowerCase().endsWith(".mov")
    ? "video/quicktime"
    : asset.fileName?.toLowerCase().endsWith(".webm")
      ? "video/webm"
      : UNIVERSAL_MIME;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType || fromName,
    fileName: asset.fileName || null,
    fileSize: asset.fileSize ?? null,
  };
}

// No compression step, unlike lib/media/graphics.js — there is no video
// equivalent of expo-image-manipulator here, so the size guard is a hard
// refusal with an instruction rather than something we can fix silently.
export async function uploadHelpVideo({ uri, mimeType }) {
  const ext = EXT_BY_MIME[mimeType] || "mp4";
  const path = `how-to/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    const mb = Math.round(arrayBuffer.byteLength / (1024 * 1024));
    throw new Error(`That video is ${mb}MB — the limit is 60MB. Export it at a lower resolution and try again.`);
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, { contentType: mimeType });
  if (error) throw error;
  return path;
}

// Plain public URL — no signing round-trip, so it's safe to call inline
// during render rather than needing an effect the way signed photo URLs do.
export function helpVideoUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function listHelpVideos() {
  const { data, error } = await programming
    .from("help_videos")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createHelpVideo({ title, description, storagePath, mimeType, createdBy, position }) {
  const { data, error } = await programming
    .from("help_videos")
    .insert({
      title,
      description: description || null,
      storage_path: storagePath,
      mime_type: mimeType || null,
      position: position ?? 0,
      created_by: createdBy || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHelpVideo(id, fields) {
  const { error } = await programming.from("help_videos").update(fields).eq("id", id);
  if (error) throw error;
}

// Row first, then the file. If the storage remove fails we're left with an
// orphaned object rather than a row pointing at a file that's already gone —
// the former is invisible, the latter renders a dead player to every member.
export async function deleteHelpVideo(video) {
  const { error } = await programming.from("help_videos").delete().eq("id", video.id);
  if (error) throw error;
  if (video.storage_path) {
    await supabase.storage.from(BUCKET).remove([video.storage_path]);
  }
}

// Positions are rewritten as 1..N over the whole list, so they can't drift
// into ties however the rows were reordered (same contract SortableList's
// onReorder hands back).
export async function reorderHelpVideos(orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await programming.from("help_videos").update({ position: i + 1 }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}
