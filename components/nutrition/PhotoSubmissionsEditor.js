import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Image, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getPhotoSignedUrls, updatePhotoSubmission, deletePhoto } from "../../lib/nutrition/photos";
import { OptionPicker, OptionStepper } from "./OptionPicker";
import { confirmDeletePhoto } from "../../lib/confirmDialog";
import { toastError } from "../../lib/toast";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { KeyboardDoneButton } from "../KeyboardDoneButton";

const ANGLES = ["front", "side", "back"];
const ANGLE_LABELS = { front: "Front", side: "Side", back: "Back" };
const ANGLE_OPTIONS = ANGLES.map((a) => ({ value: a, label: ANGLE_LABELS[a] }));

function DayEditor({ date, photos, onSaved, onDataChanged }) {
  const [rows, setRows] = useState(photos.map((p) => ({ ...p })));
  const [urls, setUrls] = useState({});
  const [weight, setWeight] = useState(String(photos.find((p) => p.weight != null)?.weight ?? ""));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
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

  // Coach-only, real DB delete (not just removed from this list) — the
  // usual reason this is needed is a duplicate/mistagged upload (e.g. 2
  // fronts + 1 side + 1 back), trimmed back down to a valid 3-photo set.
  // Doesn't auto-close the modal like Save does — a delete alone may still
  // leave angles needing reassignment — but does refresh the parent's data
  // in the background so photosByDate stays correct even if the coach
  // closes without ever hitting Save.
  const handleDelete = async (row) => {
    const confirmed = await confirmDeletePhoto();
    if (!confirmed) return;
    setDeletingId(row.id);
    try {
      await deletePhoto(row);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      toastError("Failed to delete photo", err);
    } finally {
      setDeletingId(null);
    }
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
              <Pressable
                onPress={() => handleDelete(r)}
                disabled={deletingId === r.id}
                className="items-center justify-center rounded-full"
                style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, backgroundColor: "rgba(0,0,0,0.55)" }}
              >
                {deletingId === r.id ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="trash-outline" size={13} color="white" />}
              </Pressable>
            </View>
            <View className="mt-1.5">
              <OptionPicker options={ANGLE_OPTIONS} value={r.angle} onChange={(a) => setAngle(r.id, a)} align="center" />
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
          keyboardType="decimal-pad"
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

      <Pressable onPress={handleSave} disabled={saving || !isValidSet} className="mt-4 self-end rounded px-3 py-1.5" style={{ opacity: saving || !isValidSet ? 0.5 : 1, backgroundColor: colors.primary }}>
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
  // listAllPhotos returns newest-first, so Object.keys is too — but the
  // picker runs oldest-first so ‹ steps back in time and › steps forward,
  // matching the order the dates read in the dropdown itself.
  const dates = Object.keys(photosByDate).slice().sort();
  const [open, setOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(null);

  if (dates.length === 0) return null;
  // Tracked by date, not index, so it survives photosByDate changing under
  // it after a delete. Falls back to the newest day, which is where a coach
  // almost always wants to start.
  const date = pickedDate && photosByDate[pickedDate] ? pickedDate : dates[dates.length - 1];
  const dateOptions = dates.map((d) => ({
    value: d,
    label: `${formatDateMDY(d)} (${photosByDate[d].length} photo${photosByDate[d].length === 1 ? "" : "s"})`,
  }));

  return (
    <>
      <Pressable
        onPress={() => {
          setPickedDate(null);
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

            <View className="mb-4">
              <OptionStepper options={dateOptions} value={date} onChange={setPickedDate} placeholder="Pick a date" align="center" />
            </View>

            {/* Keyed by date, so switching days remounts the editor and
                discards any unsaved angle/weight edits — deliberate (each
                day is its own independent set), but the dropdown makes
                jumping between days easy enough that it's worth knowing. */}
            <DayEditor
              key={date}
              date={date}
              photos={photosByDate[date]}
              onSaved={async () => {
                if (onSaved) await onSaved();
                setOpen(false);
              }}
              onDataChanged={onSaved}
            />
          </Pressable>
        </Pressable>
        <KeyboardDoneButton />
      </Modal>
    </>
  );
}
