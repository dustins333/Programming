import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { getClient } from "../../../../../../lib/nutrition/clients";
import { listAllPhotos, getPhotoSignedUrls } from "../../../../../../lib/nutrition/photos";
import { CoachShell } from "../../../../../../components/CoachShell";
import { formatDateMDY } from "../../../../../../lib/formatDate";
import { fonts, colors } from "../../../../../../lib/theme";

const ANGLE_LABELS = { front: "Front", side: "Side", back: "Back" };

export default function OnboardingPhotos() {
  const { userId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState(null);
  const [startingPhotos, setStartingPhotos] = useState(null);
  const [urls, setUrls] = useState({});
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [clientRow, allPhotos] = await Promise.all([getClient(userId), listAllPhotos(userId)]);
      setClient(clientRow);
      if (allPhotos.length === 0) {
        setStartingPhotos([]);
        return;
      }
      const earliestDate = allPhotos.reduce((min, p) => (p.date < min ? p.date : min), allPhotos[0].date);
      const starting = allPhotos.filter((p) => p.date === earliestDate);
      setStartingPhotos(starting);
      setUrls(await getPhotoSignedUrls(starting.map((p) => p.storage_path)));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!client || !startingPhotos) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 700 }}>
        <Link href={`/(coach)/nutrition/clients/${userId}`} style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ {client.name}
        </Link>
        <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Starting Photos
        </Text>

        {startingPhotos.length === 0 ? (
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No starting photos uploaded yet.
          </Text>
        ) : (
          <View>
            <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              {formatDateMDY(startingPhotos[0].date)}
            </Text>
            <View className="flex-row gap-3">
              {startingPhotos.map((p) => (
                <View key={p.id} className="flex-1">
                  <View className="items-center justify-center overflow-hidden rounded-lg bg-stone-100" style={{ aspectRatio: 3 / 4 }}>
                    {urls[p.storage_path] ? (
                      <Image source={{ uri: urls[p.storage_path] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <ActivityIndicator color={colors.primary} />
                    )}
                  </View>
                  <Text className="mt-1.5 text-center text-xs" style={{ fontFamily: fonts.sansMedium }}>
                    {ANGLE_LABELS[p.angle]}
                    {p.weight ? ` · ${p.weight} lb` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
