import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// Client-side compression before upload — the standalone web app does this
// with the browser Canvas API (lib/compressImage.js), which doesn't exist
// on native, so this is expo-image-manipulator instead: resize to a
// reasonable max width and re-encode as JPEG, keeping progress-photo
// uploads small without a visible quality hit.
async function compress(uri) {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1200 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, mimeType: "image/jpeg" };
}

// source: "camera" | "library" — camera-or-library per the confirmed
// nutrition-rebuild decision (matches the standalone app's behavior, which
// accepts any file). Returns null if the user cancels or denies permission.
export async function pickPhoto(source) {
  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });

  if (result.canceled || !result.assets?.[0]) return null;
  return compress(result.assets[0].uri);
}
