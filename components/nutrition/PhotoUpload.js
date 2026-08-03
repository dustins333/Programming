import { useState } from "react";
import { View, Text, Image, Pressable, Modal, Alert, ActivityIndicator, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { pickPhoto } from "../../lib/nutrition/imagePicker";
import { uploadPhoto } from "../../lib/nutrition/photos";
import { todayInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";

const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

// Custom-made pose guides, restored from the standalone app — full-bleed
// illustrations, rendered edge-to-edge (resizeMode="cover") with a "+" badge
// on top, matching the standalone app's own upload screen (a shrunk/faded
// version tried earlier read as "invisible" against these colorful images).
const POSE_IMAGES = {
  front: require("../../assets/nutrition/photo-poses/front.png"),
  side: require("../../assets/nutrition/photo-poses/side.png"),
  back: require("../../assets/nutrition/photo-poses/back.png"),
};

function SourceModal({ visible, onPick, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <View className="w-full max-w-xs rounded-2xl bg-white p-2">
          <Pressable onPress={() => onPick("camera")} className="rounded-xl px-4 py-3.5">
            <Text className="text-center" style={{ fontFamily: fonts.sansMedium }}>
              Take Photo
            </Text>
          </Pressable>
          <View className="h-px bg-stone-100" />
          <Pressable onPress={() => onPick("library")} className="rounded-xl px-4 py-3.5">
            <Text className="text-center" style={{ fontFamily: fonts.sansMedium }}>
              Choose from Library
            </Text>
          </Pressable>
          <View className="h-px bg-stone-100" />
          <Pressable onPress={onClose} className="rounded-xl px-4 py-3.5">
            <Text className="text-center text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function AngleBox({ angle, label, selected, uploading, onPicked }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = async (source) => {
    setPickerOpen(false);
    const picked = await pickPhoto(source);
    if (picked) onPicked(angle, picked);
  };

  return (
    <View className="flex-1">
      <Pressable
        onPress={() => setPickerOpen(true)}
        disabled={uploading}
        className="items-center justify-center overflow-hidden rounded-lg border border-dashed border-stone-300"
        style={{ aspectRatio: 3 / 4 }}
      >
        {selected ? (
          <Image source={{ uri: selected.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <>
            <Image source={POSE_IMAGES[angle]} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
            <View
              pointerEvents="none"
              style={{ position: "absolute", top: 0, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 36, height: 36, backgroundColor: "rgba(0,0,0,0.35)" }}
              >
                <Ionicons name="add" size={22} color="white" />
              </View>
            </View>
          </>
        )}
      </Pressable>
      <Text className="mt-1 text-center text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <SourceModal visible={pickerOpen} onPick={handlePick} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

// 3 tap-to-pick angle boxes (camera or library) + one "Upload" button that
// sends whichever are filled in — matches the standalone app's
// app/home/PhotoUpload.js, adapted for native picking + expo-image-manipulator
// compression instead of a browser Canvas. `allowDatePick` is the coach-only
// backfill mode (matches CoachPhotoUpload's "add old/starting photos" —
// members can only ever upload as of today).
export function PhotoUpload({ userId, onUploaded, allowDatePick = false }) {
  const [selected, setSelected] = useState({});
  const [uploading, setUploading] = useState(false);
  const [date, setDate] = useState(todayInBoise());

  const handlePicked = (angle, picked) => {
    setSelected((s) => ({ ...s, [angle]: picked }));
  };

  const handleUpload = async () => {
    const angles = Object.keys(selected);
    if (angles.length === 0) return;
    setUploading(true);
    try {
      const uploadDate = allowDatePick ? date : todayInBoise();
      for (const angle of angles) {
        await uploadPhoto({ userId, angle, uri: selected[angle].uri, mimeType: selected[angle].mimeType, date: uploadDate });
      }
      setSelected({});
      await onUploaded();
    } catch (err) {
      Alert.alert("Failed to upload", err.message ?? String(err));
    } finally {
      setUploading(false);
    }
  };

  const hasSelection = Object.keys(selected).length > 0;

  return (
    <View>
      {allowDatePick ? (
        <View className="mb-3">
          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Date photo was taken
          </Text>
          {isWeb ? (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 6, border: "1px solid #d6d3d1", maxWidth: 160, color: "#44403c" }}
            />
          ) : (
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              className="rounded border border-stone-300 px-3 py-2 text-sm"
              style={{ fontFamily: fonts.sans, maxWidth: 160 }}
            />
          )}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        {ANGLES.map((a) => (
          <AngleBox key={a.key} angle={a.key} label={a.label} selected={selected[a.key]} uploading={uploading} onPicked={handlePicked} />
        ))}
      </View>
      <Pressable
        onPress={handleUpload}
        disabled={!hasSelection || uploading}
        className="mt-4 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
      >
        {uploading ? <ActivityIndicator color="white" /> : <Text className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>Upload</Text>}
      </Pressable>
    </View>
  );
}
