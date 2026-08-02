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
    <View className="mt-1.5 flex-row items-center justify-center gap-3">
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

// 2-slot progress-photo comparison — angle tabs, each slot independently
// selectable by date (‹/date-picker/›, matching the standalone app's
// app/components/PhotoCompare.js) rather than a bare index stepper. Selection
// is tracked by date, not array position — switching the angle tab tries to
// keep the same date selected (if that angle has a photo on it) instead of
// resetting to an unrelated photo. Tap either photo to open the full
// pinch-zoom lightbox. Shared by the coach and member sides.
export function PhotoCompare({ photos }) {
  const [angle, setAngle] = useState("front");
  const [urls, setUrls] = useState({});
  const [leftDate, setLeftDate] = useState(null);
  const [rightDate, setRightDate] = useState(null);
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
    // Keep whichever date was already selected if this angle also has a
    // photo on it; otherwise fall back to oldest/newest.
    setLeftDate((prev) => (prev && anglePhotos.some((p) => p.date === prev) ? prev : anglePhotos[0].date));
    setRightDate((prev) => (prev && anglePhotos.some((p) => p.date === prev) ? prev : anglePhotos[anglePhotos.length - 1].date));
    getPhotoSignedUrls(anglePhotos.map((p) => p.storage_path))
      .then((next) => setUrls((prev) => ({ ...prev, ...next })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anglePhotos]);

  const left = anglePhotos.find((p) => p.date === leftDate) ?? null;
  const right = anglePhotos.find((p) => p.date === rightDate) ?? null;

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
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Slot photo={left} url={left ? urls[left.storage_path] : null} onPress={() => left && urls[left.storage_path] && setLightboxUrl(urls[left.storage_path])} />
            <DateStepper anglePhotos={anglePhotos} selectedDate={leftDate} onChange={setLeftDate} />
          </View>
          <View className="flex-1">
            <Slot photo={right} url={right ? urls[right.storage_path] : null} onPress={() => right && urls[right.storage_path] && setLightboxUrl(urls[right.storage_path])} />
            <DateStepper anglePhotos={anglePhotos} selectedDate={rightDate} onChange={setRightDate} />
          </View>
        </View>
      )}

      <Modal visible={!!lightboxUrl} animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        {lightboxUrl ? <ZoomableImage uri={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
      </Modal>
    </View>
  );
}
