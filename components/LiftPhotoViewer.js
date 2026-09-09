import { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ZoomableImage } from "./nutrition/ZoomableImage";
import { PressFade } from "./PressFade";
import { getLiftPhotoSignedUrls, deleteLiftPhoto } from "../lib/programming/liftPhotos";
import { confirmDeleteLiftPhoto } from "../lib/confirmDialog";
import { toastError } from "../lib/toast";
import { fonts } from "../lib/theme";

// One day's lift photos, full screen. Wraps ZoomableImage rather than
// reimplementing it, so a photo of a whiteboard gets the same pinch-zoom the
// progress-photo lightbox already has, and nutrition's own viewer is left
// untouched. Its close button sits top-right and its hint at bottom 40, so
// delete goes top-left and the pager above the hint.
export function LiftPhotoViewer({ photos, onClose, onDeleted }) {
  const [urls, setUrls] = useState(null);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Keyed on the ids, NOT on the array itself: the parent rebuilds that array
  // on every render, and an effect keyed on it would re-sign on a loop.
  const key = useMemo(() => photos.map((p) => p.id).join(","), [photos]);

  // Signed when the viewer opens rather than for the whole list up front. The
  // bucket is private and a signed url lasts five minutes, so signing every
  // photo at screen load would hand back links already dead by the time she
  // scrolls down and taps one.
  useEffect(() => {
    let live = true;
    setUrls(null);
    setLoadError(null);
    (async () => {
      try {
        const map = await getLiftPhotoSignedUrls(photos.map((p) => p.storage_path));
        if (live) setUrls(map);
      } catch (err) {
        if (live) setLoadError(err.message ?? String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);

  // Clamped rather than trusted: a delete shortens the list underneath this.
  const safeIndex = Math.min(index, Math.max(0, photos.length - 1));
  const current = photos[safeIndex];
  // Signing can come back without a url for one path if the object is gone.
  const uri = current && urls ? urls[current.storage_path] : null;

  const handleDelete = async () => {
    if (!current || busy) return;
    if (!(await confirmDeleteLiftPhoto())) return;
    setBusy(true);
    try {
      await deleteLiftPhoto(current);
      // Closing before the parent reloads when that was the only one: there is
      // nothing left to look at, and an empty viewer reads as broken.
      if (photos.length <= 1) onClose();
      else setIndex(Math.max(0, safeIndex - 1));
      onDeleted?.();
    } catch (err) {
      toastError("Couldn't delete that photo", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      {uri ? (
        <ZoomableImage uri={uri} onClose={onClose} />
      ) : (
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          {loadError ? (
            <Text style={{ fontFamily: fonts.sans, color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
              Couldn't load that photo. {loadError}
            </Text>
          ) : urls ? (
            <Text style={{ fontFamily: fonts.sans, color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
              That photo is no longer available.
            </Text>
          ) : (
            <ActivityIndicator color="white" />
          )}
          <PressFade onPress={onClose} hitSlop={12} style={{ marginTop: 18, paddingHorizontal: 16, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "white" }}>Close</Text>
          </PressFade>
        </View>
      )}

      {/* Mirrors ZoomableImage's own close button on the opposite corner. */}
      {current ? (
        <PressFade
          onPress={handleDelete}
          disabled={busy}
          hitSlop={12}
          accessibilityLabel="Delete this photo"
          style={{
            position: "absolute",
            top: 48,
            left: 20,
            zIndex: 10,
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.15)",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Ionicons name="trash-outline" size={19} color="white" />
        </PressFade>
      ) : null}

      {/* Only when there is more than one, and clear of the zoom hint. */}
      {photos.length > 1 ? (
        <View style={{ position: "absolute", bottom: 74, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <PressFade
            onPress={() => setIndex(Math.max(0, safeIndex - 1))}
            disabled={safeIndex === 0}
            hitSlop={12}
            accessibilityLabel="Previous photo"
            style={{ opacity: safeIndex === 0 ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-back" size={26} color="white" />
          </PressFade>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            {safeIndex + 1} of {photos.length}
          </Text>
          <PressFade
            onPress={() => setIndex(Math.min(photos.length - 1, safeIndex + 1))}
            disabled={safeIndex >= photos.length - 1}
            hitSlop={12}
            accessibilityLabel="Next photo"
            style={{ opacity: safeIndex >= photos.length - 1 ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={26} color="white" />
          </PressFade>
        </View>
      ) : null}
    </Modal>
  );
}
