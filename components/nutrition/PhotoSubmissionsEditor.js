import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Image, Modal, Alert, ActivityIndicator, Platform } from "react-native";
import { getPhotoSignedUrls, updatePhotoSubmission } from "../../lib/nutrition/photos";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

const isWeb = Platform.OS === "web";
const ANGLES = ["front", "side", "back"];
const ANGLE_LABELS = { front: "Front", side: "Side", back: "Back" };

// Web: a real <select>. Native: a Pressable that opens a small option list —
// same platform split as PhotoCompare.js's DatePicker.
function AngleDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);

  if (isWeb) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: fonts.sans, fontSize: 12.5, width: "100%", padding: "6px 4px", borderRadius: 6, border: "1px solid #d9d4cd", color: "#44403c", backgroundColor: "white", textAlign: "center" }}
      >
        {ANGLES.map((a) => (
          <option key={a} value={a}>
            {ANGLE_LABELS[a]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="items-center rounded border border-stone-300 py-1.5">
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5 }}>{ANGLE_LABELS[value]} ▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl bg-white p-2">
            {ANGLES.map((a) => (
              <Pressable
                key={a}
                onPress={() => {
                  onChange(a);
                  setOpen(false);
                }}
                className="rounded-xl px-4 py-3"
                style={a === value ? { backgroundColor: "#fdf6f2" } : undefined}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: a === value ? colors.primaryOnWhite : "#44403c" }}>{ANGLE_LABELS[a]}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function DayEditor({ date, photos, onSaved }) {
  const [rows, setRows] = useState(photos.map((p) => ({ ...p })));
  const [urls, setUrls] = useState({});
  const [weight, setWeight] = useState(String(photos.find((p) => p.weight != null)?.weight ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPhotoSignedUrls(photos.map((p) => p.storage_path))
      .then((byPath) => setUrls(Object.fromEntries(rows.map((r) => [r.id, byPath[r.storage_path]]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const setAngle = (id, angle) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, angle } : r)));
  };

  // Requiring exactly one of each angle (not just "no duplicates") — a day
  // saved with only 2 angles, or 2 fronts and no back, breaks the
  // requirement-gate/compare logic elsewhere, which assumes a complete
  // front/side/back set per date.
  const angles = rows.map((r) => r.angle);
  const isValidSet = rows.length === ANGLES.length && ANGLES.every((a) => angles.filter((x) => x === a).length === 1);

  const handleSave = async () => {
    if (!isValidSet) {
      setError("Needs exactly one front, one side, and one back photo before saving");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sharedWeight = weight === "" ? null : Number(weight);
      for (const r of rows) {
        await updatePhotoSubmission(r.id, { angle: r.angle, weight: sharedWeight });
      }
      await onSaved();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View className="flex-row gap-3">
        {rows.map((r) => (
          <View key={r.id} className="flex-1">
            <View className="items-center justify-center overflow-hidden rounded-lg bg-stone-100" style={{ aspectRatio: 3 / 4 }}>
              {urls[r.id] ? <Image source={{ uri: urls[r.id] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <ActivityIndicator color={colors.primary} />}
            </View>
            <View className="mt-1.5">
              <AngleDropdown value={r.angle} onChange={(a) => setAngle(r.id, a)} />
            </View>
          </View>
        ))}
      </View>

      <View className="mt-4" style={{ maxWidth: 160 }}>
        <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Weight (applies to all)
        </Text>
        <TextInput
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          inputAccessoryViewID={NUMERIC_DONE_ID}
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
          style={{ fontFamily: fonts.sans }}
        />
      </View>

      {!isValidSet ? (
        <Text className="mt-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Needs exactly one front, one side, and one back to save.
        </Text>
      ) : null}
      {error ? (
        <Text className="mt-3 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
          {error}
        </Text>
      ) : null}

      <Pressable onPress={handleSave} disabled={saving || !isValidSet} className="mt-4 self-end rounded px-3 py-1.5 disabled:opacity-50" style={{ backgroundColor: colors.primary }}>
        <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {saving ? "Saving…" : "Save"}
        </Text>
      </Pressable>
    </View>
  );
}

// "Fix a day's photos" — photos come in dated groups of up to 3, so this
// groups by upload date (not angle) since a mistagged batch usually needs
// fixing together. Matches the standalone app's PhotoSubmissionsEditor.
export function PhotoSubmissionsEditor({ photosByDate, onSaved }) {
  const dates = Object.keys(photosByDate);
  const [open, setOpen] = useState(false);
  const [dateIndex, setDateIndex] = useState(0);

  if (dates.length === 0) return null;
  const date = dates[dateIndex];

  return (
    <>
      <Pressable
        onPress={() => {
          setDateIndex(0);
          setOpen(true);
        }}
        className="self-start rounded border border-stone-300 px-3 py-1.5"
      >
        <Text className="text-sm" style={{ fontFamily: fonts.sansMedium }}>
          Edit
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full rounded-2xl bg-white p-5" style={{ maxWidth: 480 }}>
            <Text className="mb-3" style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>
              Fix a day's photos
            </Text>

            <View className="mb-4 flex-row items-center gap-2">
              <Pressable onPress={() => setDateIndex((i) => Math.min(dates.length - 1, i + 1))} disabled={dateIndex >= dates.length - 1} hitSlop={8}>
                <Text style={{ color: dateIndex >= dates.length - 1 ? "#d6d3d1" : "#57534e" }}>‹</Text>
              </Pressable>
              <Text className="flex-1 text-center text-sm" style={{ fontFamily: fonts.sansMedium }}>
                {formatDateMDY(date)} ({photosByDate[date].length} photo{photosByDate[date].length === 1 ? "" : "s"})
              </Text>
              <Pressable onPress={() => setDateIndex((i) => Math.max(0, i - 1))} disabled={dateIndex <= 0} hitSlop={8}>
                <Text style={{ color: dateIndex <= 0 ? "#d6d3d1" : "#57534e" }}>›</Text>
              </Pressable>
            </View>

            <DayEditor
              key={date}
              date={date}
              photos={photosByDate[date]}
              onSaved={async () => {
                if (onSaved) await onSaved();
                setOpen(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
