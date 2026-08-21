import { useEffect, useState } from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { getPhotoSignedUrls } from "../../lib/nutrition/photos";
import { photosSinceEngagement } from "../../lib/nutrition/onboarding";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const ANGLES = ["front", "side", "back"];

// Her starting set, shared by the Onboarding tab and the onboarding view of
// the Check-In tab. Renders bare (no card chrome) so each caller can wrap it
// in whatever it already uses.
//
// Scoped with photosSinceEngagement, NOT "earliest photo on file". The nine
// clients migrated off the Google Sheets trackers carry years of imported
// history, so an unscoped earliest-per-angle pick showed 2023 photos as the
// starting set for a client who started this year — the same bug that was
// already fixed in the standalone onboarding/photos.js screen but never in
// the tab's own copy.
export function StartingPhotos({ photos, client, emptyMessage = "Nothing in yet. Not a blocker — you can set targets without them." }) {
  const [urls, setUrls] = useState({});

  const engagement = photosSinceEngagement(photos ?? [], client);
  const starting = ANGLES.map(
    (angle) => engagement.filter((p) => p.angle === angle).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  ).filter(Boolean);

  // Keyed on the joined paths rather than the array — `starting` is rebuilt
  // every render, so depending on it re-signs forever.
  const pathKey = starting.map((p) => p.storage_path).join(",");
  useEffect(() => {
    if (!pathKey) return;
    let cancelled = false;
    getPhotoSignedUrls(pathKey.split(","))
      .then((next) => {
        if (!cancelled) setUrls(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathKey]);

  if (starting.length === 0) {
    return (
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>{emptyMessage}</Text>
    );
  }

  // Angles can legitimately have been shot on different days, so the caption
  // states the earliest of what's actually shown rather than implying one
  // sitting.
  const earliest = starting.map((p) => p.date).sort()[0];

  return (
    <>
      <View className="flex-row" style={{ gap: 8 }}>
        {starting.map((photo) => (
          <View key={photo.id ?? photo.angle} style={{ flex: 1 }}>
            {urls[photo.storage_path] ? (
              <Image
                source={{ uri: urls[photo.storage_path] }}
                style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: "#f1efed" }}
                resizeMode="cover"
              />
            ) : (
              <View className="items-center justify-center rounded-lg" style={{ aspectRatio: 3 / 4, backgroundColor: "#f1efed" }}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            )}
            <Text className="mt-1 text-center" style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>
              {photo.angle}
            </Text>
          </View>
        ))}
      </View>
      <Text className="mt-3" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
        Taken {formatDateMDY(earliest)}
        {starting[0].weight ? ` at ${starting[0].weight} lb` : ""}. These become the left frame in every comparison from here.
      </Text>
    </>
  );
}
