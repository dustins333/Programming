import { useEffect, useMemo, useState } from "react";
import { View, Text, Image, Pressable, Modal, Platform, ActivityIndicator } from "react-native";
import { getPhotoSignedUrls } from "../../lib/nutrition/photos";
import { ZoomableImage } from "./ZoomableImage";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";

const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

function photoOptionLabel(photo) {
  return `${formatDateMDY(photo.date)}${photo.weight ? ` | ${photo.weight} lb` : ""}`;
}

// Web: a real <select>. Native: a Pressable that opens a modal list — RN
// has no native <select> equivalent, same platform split this app already
// uses elsewhere (e.g. the SPC roster's coach filter).
function DatePicker({ anglePhotos, selectedDate, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = anglePhotos.find((p) => p.date === selectedDate);

  if (isWeb) {
    return (
      <select
        value={selectedDate ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: fonts.sans, fontSize: 12.5, width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d9d4cd", color: "#44403c", backgroundColor: "white" }}
      >
        {anglePhotos.map((p) => (
          <option key={p.date} value={p.date}>
            {photoOptionLabel(p)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="rounded border border-stone-300 px-2 py-1.5">
        <Text numberOfLines={1} className="text-center text-xs" style={{ fontFamily: fonts.sansMedium }}>
          {selected ? photoOptionLabel(selected) : "Pick a date"}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-white p-2" style={{ maxHeight: "70%" }}>
            {anglePhotos.map((p) => (
              <Pressable
                key={p.date}
                onPress={() => {
                  onChange(p.date);
                  setOpen(false);
                }}
                className="rounded-xl px-4 py-3"
                style={p.date === selectedDate ? { backgroundColor: "#fdf6f2" } : undefined}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: p.date === selectedDate ? colors.primaryOnWhite : "#44403c" }}>{photoOptionLabel(p)}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function DateStepper({ anglePhotos, selectedDate, onChange }) {
  const index = anglePhotos.findIndex((p) => p.date === selectedDate);
  return (
    <View className="flex-row items-center justify-center gap-3">
      <Pressable onPress={() => index > 0 && onChange(anglePhotos[index - 1].date)} disabled={index <= 0} hitSlop={8}>
        <Text style={{ color: index <= 0 ? "#d6d3d1" : colors.primaryOnWhite, fontFamily: fonts.sansMedium }}>‹</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <DatePicker anglePhotos={anglePhotos} selectedDate={selectedDate} onChange={onChange} />
      </View>
      <Pressable onPress={() => index >= 0 && index < anglePhotos.length - 1 && onChange(anglePhotos[index + 1].date)} disabled={index < 0 || index >= anglePhotos.length - 1} hitSlop={8}>
        <Text style={{ color: index < 0 || index >= anglePhotos.length - 1 ? "#d6d3d1" : colors.primaryOnWhite, fontFamily: fonts.sansMedium }}>›</Text>
      </Pressable>
    </View>
  );
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
function defaultDates(anglePhotos, count) {
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
