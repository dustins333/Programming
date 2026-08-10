import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listAllPhotos, isPhotoRequirementWeek, PHOTO_RECENCY_DAYS } from "../../../lib/nutrition/photos";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { PhotoCompare } from "../../../components/nutrition/PhotoCompare";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";

const CANVAS = "#faf8f6";

export default function NutritionPhotos() {
  const { profile } = useAuth();
  const router = useRouter();
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
  }, [access.status, load]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1" style={{ backgroundColor: CANVAS }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24 }}>
          <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            Nutrition
          </Text>
          <SegmentedControl
            segments={NUTRITION_TABS}
            activeKey="photos"
            onSelect={(key) => {
              const seg = NUTRITION_TABS.find((s) => s.key === key);
              if (seg && seg.key !== "photos") router.push(seg.href);
            }}
          />
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
      <Text className="mb-3 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My Nutrition
      </Text>

      <SegmentedControl
        segments={NUTRITION_TABS}
        activeKey="photos"
        onSelect={(key) => {
          const seg = NUTRITION_TABS.find((s) => s.key === key);
          if (seg && seg.key !== "photos") router.push(seg.href);
        }}
      />

      {(() => {
        // "What's still needed" status — this tab never said whether photos
        // were due or which angles were missing, even though check-in two
        // screens over gates on exactly this. Same recency window as
        // checkin.js's own photosUploaded computation.
        const today = todayInBoise();
        const { currentWeek } = computeWeekWindows(today);
        const dueThisWeek = access.client ? isPhotoRequirementWeek(access.client, currentWeek.start) : false;
        const recent = photos.filter((p) => p.date >= addDays(today, -PHOTO_RECENCY_DAYS));
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

      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: "#a8a29e", marginBottom: 10 }}
      >
        Add today's photos
      </Text>
      <PhotoUpload userId={profile.id} onUploaded={load} />

      <Text
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: "#a8a29e", marginTop: 24, marginBottom: 10 }}
      >
        Compare
      </Text>
      <PhotoCompare photos={photos} />
    </ScrollView>
  );
}
