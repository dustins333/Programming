import { useEffect, useMemo, useState } from "react";
import { View, Text, Image, Pressable, Modal, ActivityIndicator } from "react-native";
import { getPhotoSignedUrls } from "../../lib/nutrition/photos";
import { OptionStepper } from "./OptionPicker";
import { ZoomableImage } from "./ZoomableImage";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

function photoOptionLabel(photo) {
  return `${formatDateMDY(photo.date)}${photo.weight ? ` | ${photo.weight} lb` : ""}`;
}

export function DateStepper({ anglePhotos, selectedDate, onChange }) {
  const options = anglePhotos.map((p) => ({ value: p.date, label: photoOptionLabel(p) }));
  return <OptionStepper options={options} value={selectedDate} onChange={onChange} placeholder="Pick a date" />;
}

function Slot({ photo, url, onPress }) {
  if (!photo) {
    return (
      <View className="flex-1 items-center justify-center rounded-lg border border-dashed border-stone-300" style={{ aspectRatio: 3 / 4 }}>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
          No photo
        </Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} className="flex-1">
      {url ? (
        <Image source={{ uri: url }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: "#f1efed" }} resizeMode="cover" />
      ) : (
        <View className="items-center justify-center rounded-lg bg-stone-100" style={{ aspectRatio: 3 / 4 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

// Picks `count` evenly-spaced dates from oldest to newest inclusive (e.g.
// oldest/newest for 2 slots, oldest/middle/newest for 3) — same "tell a
// story" default the standalone app's PhotoCompareBoard uses for its slots.
export function defaultDates(anglePhotos, count) {
  if (anglePhotos.length === 0) return Array(count).fill(null);
  if (count === 1) return [anglePhotos[anglePhotos.length - 1].date];
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round((i / (count - 1)) * (anglePhotos.length - 1));
    return anglePhotos[idx].date;
  });
}

// Progress-photo comparison board — angle tabs, each slot independently
// selectable by date (‹/date-picker/›, controls above the photo — matches
// the standalone app's app/dashboard/photo-compare/PhotoCompareBoard.js)
// rather than a bare index stepper. Selection is tracked by date, not array
// position — switching the angle tab tries to keep the same dates selected
// (wherever that angle also has a photo) instead of resetting to unrelated
// photos. Tap any photo to open the full pinch-zoom lightbox. A low-opacity
// logo watermark sits in the corner, same as the original — meant for a
// manual screenshot, not an automated export. Shared by the coach and
// member sides. `slots` defaults to 2 (a client's own quick before/after) —
// only the dedicated coach Photo Compare tool page opts into 3.
export function PhotoCompare({ photos, slots = 2 }) {
  const [angle, setAngle] = useState("front");
  const [urls, setUrls] = useState({});
  const [slotDates, setSlotDates] = useState(() => Array(slots).fill(null));
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Oldest-first so the first entry is the earliest photo — matches
  // "compare your starting photo against a recent one" being the common use
  // case, and gives DateStepper's prev/next a stable chronological order.
  const anglePhotos = useMemo(
    () =>
      photos
        .filter((p) => p.angle === angle)
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [photos, angle]
  );

  useEffect(() => {
    if (anglePhotos.length === 0) return;
    const fallback = defaultDates(anglePhotos, slots);
    setSlotDates((prev) => fallback.map((d, i) => (prev[i] && anglePhotos.some((p) => p.date === prev[i]) ? prev[i] : d)));
    getPhotoSignedUrls(anglePhotos.map((p) => p.storage_path))
      .then((next) => setUrls((prev) => ({ ...prev, ...next })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anglePhotos, slots]);

  const setSlotDate = (index, date) => {
    setSlotDates((prev) => prev.map((d, i) => (i === index ? date : d)));
  };

  return (
    <View>
      <View className="mb-3 flex-row gap-2">
        {ANGLES.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => setAngle(a.key)}
            className="rounded-full border px-3.5 py-1.5"
            style={{ borderColor: angle === a.key ? colors.primary : "#d6d3d1", backgroundColor: angle === a.key ? colors.primary : "transparent" }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: angle === a.key ? "white" : "#57534e" }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {anglePhotos.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No {angle} photos yet.
        </Text>
      ) : (
        <View style={{ position: "relative" }}>
          <View className="flex-row gap-3">
            {slotDates.map((date, i) => {
              const photo = anglePhotos.find((p) => p.date === date) ?? null;
              const url = photo ? urls[photo.storage_path] : null;
              return (
                <View key={i} className="flex-1">
                  <DateStepper anglePhotos={anglePhotos} selectedDate={date} onChange={(d) => setSlotDate(i, d)} />
                  <View className="mt-1.5">
                    <Slot photo={photo} url={url} onPress={() => photo && url && setLightboxUrl(url)} />
                  </View>
                </View>
              );
            })}
          </View>
          <Image
            source={require("../../assets/kova-logo.jpg")}
            pointerEvents="none"
            style={{ position: "absolute", bottom: 8, right: 8, width: 40, height: 40, borderRadius: 20, opacity: 0.3 }}
          />
        </View>
      )}

      <Modal visible={!!lightboxUrl} animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        {lightboxUrl ? <ZoomableImage uri={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
      </Modal>
    </View>
  );
}
