import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listAllPhotos, isPhotoRequirementWeek, PHOTO_RECENCY_DAYS } from "../../../lib/nutrition/photos";
import { computeWeekWindows } from "../../../lib/nutrition/weekCycle";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
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
      <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        Nutrition
      </Text>
      <Text className="mb-4 text-base text-stone-500" style={{ fontFamily: fonts.sans }}>
        Progress photos
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
        const lastByAngle = {};
        for (const p of photos) {
          if (!lastByAngle[p.angle]) lastByAngle[p.angle] = p.date; // listAllPhotos is date-desc
        }
        return (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={
              dueThisWeek && missing.length > 0
                ? { borderColor: "#b23a22", borderWidth: 1.5, backgroundColor: "#fdf6f2" }
                : { borderColor: "#ece7e1", borderWidth: 1, backgroundColor: "white" }
            }
          >
            {dueThisWeek ? (
              missing.length > 0 ? (
                <Text className="mb-1 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}>
                  Photos due this week — still needed: {missing.join(", ")}
                </Text>
              ) : (
                <Text className="mb-1 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>
                  This week's photos are in ✓
                </Text>
              )
            ) : (
              <Text className="mb-1 text-sm text-stone-600" style={{ fontFamily: fonts.sansSemiBold }}>
                No photos due this week
              </Text>
            )}
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Last uploads — {ANGLES.map((a) => `${a}: ${lastByAngle[a] ? formatDateMDY(lastByAngle[a]) : "never"}`).join(" · ")}
            </Text>
          </View>
        );
      })()}

      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold }}>
        Add today's photos
      </Text>
      <PhotoUpload userId={profile.id} onUploaded={load} />

      <Text className="mb-2 mt-6 text-sm" style={{ fontFamily: fonts.sansSemiBold }}>
        Compare
      </Text>
      <PhotoCompare photos={photos} />
    </ScrollView>
  );
}
