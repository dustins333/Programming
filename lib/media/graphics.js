import { supabase } from "../supabase/client";
import { pickImage } from "../imagePicker";

// Marketing artwork — the Canva export attached to an announcement or an
// event. Deliberately a DIFFERENT bucket from nutrition's `photos`, and
// deliberately a PUBLIC one:
//
//   * a graphic is a poster meant for the whole gym, not client-specific
//     data (the reason `photos` is private does not apply),
//   * signed URLs expire — `photos` re-signs at 300s, which is fine for a
//     compare view a coach opens deliberately and wrong for a card that may
//     sit on a member's screen much longer,
//   * a public URL is the only kind that can ever be embedded in a push
//     notification, if rich push happens later.
//
// The tradeoff is that anyone holding the URL can fetch it, so NOTHING
// client-specific may be uploaded here. Progress photos keep going to
// `photos` via lib/nutrition/photos.js.
const BUCKET = "graphics";

// Wider and less compressed than a progress photo. A Canva export is flat
// text and hard edges on a solid background, which is the worst case for
// JPEG ringing — 0.7 at 1200px visibly muddies small type.
const GRAPHIC_MAX_WIDTH = 1400;
const GRAPHIC_QUALITY = 0.85;

// Post-compression backstop. A 1400px JPEG at 0.85 lands well under a
// megabyte in practice, so anything past this means the compression step
// didn't run (or ran on something pathological) and the upload would hang
// rather than fail cleanly.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function pickGraphic() {
  return pickImage("library", { maxWidth: GRAPHIC_MAX_WIDTH, quality: GRAPHIC_QUALITY });
}

// RN has no File/FormData-from-disk shortcut like the browser — read the
// local picker/manipulator URI as an ArrayBuffer and hand that to
// supabase-js's storage upload, same as lib/nutrition/photos.js does.
export async function uploadGraphic({ uri, mimeType, folder = "announcements" }) {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("That image is too large to upload. Try exporting it at a smaller size.");
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, { contentType: mimeType });
  if (error) throw error;
  return path;
}

// Plain public URL — no signing round-trip, so this is safe to call inline
// during render rather than needing an effect the way signed photo URLs do.
export function graphicUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteGraphic(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
