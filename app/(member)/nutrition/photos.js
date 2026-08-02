import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listAllPhotos } from "../../../lib/nutrition/photos";
import { PhotoUpload } from "../../../components/nutrition/PhotoUpload";
import { PhotoCompare } from "../../../components/nutrition/PhotoCompare";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NUTRITION_TABS } from "../../../lib/nutrition/tabs";
import { fonts, colors } from "../../../lib/theme";

export default function NutritionPhotos() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const access = useNutritionAccess(profile.id);
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setPhotos(await listAllPhotos(profile.id));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile.id]);

  useEffect(() => {
    if (access.status === "active") load();
  }, [access.status, load]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} />;
  }

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your photos: {loadError}
        </Text>
      </View>
    );
  }

  if (!photos) {
    return <NutritionAccessMessage status="loading" />;
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 pb-8" contentContainerStyle={{ paddingTop: insets.top + 6 }}>
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
