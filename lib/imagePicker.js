import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// Client-side compression before upload — the standalone web app does this
// with the browser Canvas API (lib/compressImage.js), which doesn't exist
// on native, so this is expo-image-manipulator instead: resize to a max
// width and re-encode as JPEG.
//
// Moved here from lib/nutrition/imagePicker.js once announcement/event
// graphics needed the same picker — it was never nutrition-specific. The
// defaults (1200px / 0.7) are the progress-photo settings it started life
// with, so that call site is unchanged. A marketing graphic overrides them:
// flat text on a solid background is exactly what a low JPEG quality turns
// to mush, so those uploads run wider and less compressed (see
// lib/media/graphics.js).
async function compress(uri, actions, quality) {
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, mimeType: "image/jpeg" };
}

// source: "camera" | "library" — camera-or-library per the confirmed
// nutrition-rebuild decision (matches the standalone app's behavior, which
// accepts any file). Returns null if the user cancels or denies permission.
// Works on web as well as native: launchImageLibraryAsync opens a plain file
// dialog there and the permission request resolves granted.
export async function pickImage(source, { maxWidth = 1200, quality = 0.7 } = {}) {
  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // Only resize when the source is actually wider than the cap — a bare
  // `resize: { width }` will happily upscale a smaller image, which costs
  // bytes and buys nothing.
  const actions = asset.width && asset.width > maxWidth ? [{ resize: { width: maxWidth } }] : [];
  return compress(asset.uri, actions, quality);
}

// The progress-photo call site's original name, kept so that flow reads the
// same as it always has.
export const pickPhoto = pickImage;
