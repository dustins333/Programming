import { useState } from "react";
import { View, Text, Image, Pressable, Modal, ActivityIndicator, TextInput, Platform } from "react-native";
import { toastError } from "../../lib/toast";
import { Ionicons } from "@expo/vector-icons";
import { pickPhoto } from "../../lib/imagePicker";
import { uploadPhoto } from "../../lib/nutrition/photos";
import { todayInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";

// design_handoff_member_mobile_v5 (5b) — empty slots are peach dashed drop
// targets, filled ones carry an olive angle chip. Same dashed-means-not-yet
// rule as every other unlogged control in the member app.
const EMPTY_BG = "#fdf1ea";
const EMPTY_BORDER = "#e0b6a5";
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";
const BRAND_TEXT = "#8a5140";

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

function AngleBox({ angle, label, selected, uploading, onPicked, onCleared }) {
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
        className="items-center justify-center overflow-hidden"
        style={{
          aspectRatio: 3 / 4,
          borderRadius: 16,
          borderWidth: selected ? 1 : 1.5,
          borderStyle: selected ? "solid" : "dashed",
          borderColor: selected ? CARD_BORDER : EMPTY_BORDER,
          backgroundColor: selected ? "#fff" : EMPTY_BG,
        }}
      >
        {selected ? (
          <>
            <Image source={{ uri: selected.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            {/* Olive "FRONT ✓" chip — the slot says what it holds without
                needing the caption underneath to be read (v5, 5b). */}
            <View
              pointerEvents="none"
              className="flex-row items-center rounded-full"
              style={{ position: "absolute", top: 6, left: 6, backgroundColor: OLIVE, paddingHorizontal: 7, paddingVertical: 3, gap: 3 }}
            >
              <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.7, color: "#fff" }}>
                {label.toUpperCase()}
              </Text>
              <Ionicons name="checkmark" size={9} color="#fff" />
            </View>
            <Pressable
              onPress={() => onCleared(angle)}
              disabled={uploading}
              className="items-center justify-center rounded-full"
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <Ionicons name="close" size={15} color="white" />
            </Pressable>
          </>
        ) : (
          <>
            {/* The pose illustration is deliberately untouched — the handoff
                keeps it as-is and restyles only the frame around it. Plain
                width/height rather than StyleSheet.absoluteFillObject, which
                renders this Image invisible on native Fabric (2026-08-02). */}
            <Image source={POSE_IMAGES[angle]} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
            <View
              pointerEvents="none"
              style={{ position: "absolute", top: 0, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 34,
                  height: 34,
                  backgroundColor: "#fff",
                  shadowColor: "#44403c",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.16,
                  shadowRadius: 6,
                  elevation: 3,
                }}
              >
                <Ionicons name="add" size={20} color={BRAND_TEXT} />
              </View>
            </View>
          </>
        )}
      </Pressable>
      {/* Empty slots only. The mock puts this label inside the slot; here it
          sits under it, because the pose illustration fills the slot and a
          label on top of it can't be relied on to stay legible. A filled slot
          gets no caption — the olive chip already names the angle, and both
          at once just reads as the word twice. */}
      {selected ? null : (
        <Text
          maxFontSizeMultiplier={1.1}
          className="mt-1.5 text-center"
          style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, textTransform: "uppercase", color: "#a8a29e" }}
        >
          {label}
        </Text>
      )}
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

  const handleCleared = (angle) => {
    setSelected((s) => {
      const next = { ...s };
      delete next[angle];
      return next;
    });
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
      toastError("Failed to upload", err);
    } finally {
      setUploading(false);
    }
  };

  const selectedCount = Object.keys(selected).length;
  const hasSelection = selectedCount > 0;

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
          <AngleBox key={a.key} angle={a.key} label={a.label} selected={selected[a.key]} uploading={uploading} onPicked={handlePicked} onCleared={handleCleared} />
        ))}
      </View>
      {/* Primary CTA, v5 shape — and it names what it's about to send, so a
          member who picked two of three angles can see that before tapping. */}
      <Pressable
        onPress={handleUpload}
        disabled={!hasSelection || uploading}
        className="mt-4 items-center py-4"
        style={{
          opacity: !hasSelection || uploading ? 0.5 : 1,
          borderRadius: 15,
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
          elevation: 3,
        }}
      >
        {uploading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text maxFontSizeMultiplier={1.2} className="text-base text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {selectedCount > 0 ? `Upload ${selectedCount} photo${selectedCount === 1 ? "" : "s"}` : "Upload"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
