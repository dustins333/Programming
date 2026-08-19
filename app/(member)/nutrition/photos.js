import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listAllPhotos, isPhotoRequirementWeek, photosForRequirementWeek } from "../../../lib/nutrition/photos";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { todayInBoise } from "../../../lib/boiseDate";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { PhotoCompare } from "../../../components/nutrition/PhotoCompare";
import { NutritionTabHeader } from "../../../components/nutrition/NutritionTabHeader";
import { fonts, colors } from "../../../lib/theme";
import { Eyebrow } from "../../../components/Eyebrow";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

const CANVAS = "#faf8f6";

export default function NutritionPhotos() {
  // Tabs keep this screen mounted, so a mount-only load never re-runs
  // on a return visit — see lib/useRefreshOnFocus.js.
  const focusKey = useRefreshOnFocus();

  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const access = useNutritionAccess(profile.id);
  useFocusEffect(useCallback(() => access.refetch(), [access.refetch]));
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setPhotos(await listAllPhotos(profile.id));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile.id]);

  useEffect(() => {
    if (access.status === "active") load();
  }, [access.status, load, focusKey]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1" style={{ backgroundColor: CANVAS }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24 }}>
          <NutritionTabHeader activeKey="photos" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your photos: {loadError}
          </Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!photos) {
    return <NutritionAccessMessage status="loading" />;
  }

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
      <NutritionTabHeader activeKey="photos" />

      {(() => {
        // "What's still needed" status — this tab never said whether photos
        // were due or which angles were missing, even though check-in two
        // screens over gates on exactly this. Same window as checkin.js's
        // own photosUploaded computation.
        const today = todayInBoise();
        const { currentWeek } = computeWeekWindows(today);
        const dueThisWeek = access.client ? isPhotoRequirementWeek(access.client, currentWeek.start) : false;
        const recent = photosForRequirementWeek(photos, currentWeek);
        const anglesIn = new Set(recent.map((p) => p.angle));
        const ANGLES = ["front", "side", "back"];
        const missing = ANGLES.filter((a) => !anglesIn.has(a));
        const outstanding = dueThisWeek && missing.length > 0;
        const satisfied = dueThisWeek && missing.length === 0;
        // The old "Last uploads — front: …, side: …" line is gone: the
        // slots below already show what's in and when (v5, 5b).
        return (
          <View
            className="mb-4 rounded-2xl px-4 py-3.5"
            style={
              outstanding
                ? { borderColor: "#b23a22", borderWidth: 1.5, backgroundColor: "#fdf6f2" }
                : { borderColor: "#ece7e1", borderWidth: 1, backgroundColor: "white" }
            }
          >
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Ionicons
                name={satisfied ? "checkmark-circle" : outstanding ? "alert-circle" : "camera-outline"}
                size={18}
                color={satisfied ? "#4d6142" : outstanding ? "#b23a22" : "#a8a29e"}
              />
              <Text
                maxFontSizeMultiplier={1.2}
                style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: satisfied ? "#4d6142" : outstanding ? "#b23a22" : "#57534e" }}
              >
                {outstanding
                  ? `Photos due this week. ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(" and ")} still needed`
                  : satisfied
                    ? "This week's photos are in"
                    : "No photos due this week"}
              </Text>
            </View>
          </View>
        );
      })()}

      <Eyebrow style={{ marginBottom: 10 }}>Add today's photos</Eyebrow>
      <PhotoUpload userId={profile.id} onUploaded={load} />

      <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Compare</Eyebrow>
      <PhotoCompare photos={photos} />
    </ScrollView>
  );
}
