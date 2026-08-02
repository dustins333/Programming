import { useCallback, useEffect, useState } from "react";
import { View, Text, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { listClients } from "../../../lib/nutrition/clients";
import { listAllPhotos } from "../../../lib/nutrition/photos";
import { PhotoCompare } from "../../../components/nutrition/PhotoCompare";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const isWeb = Platform.OS === "web";

// Standalone compare board — pick any client, compare their progress
// photos, without going through their full client-detail page. Reuses the
// same PhotoCompare widget the client-detail Photos tab uses (the
// standalone app's dedicated board additionally does a 3-photo layout with
// a logo watermark for social-media screenshots — not ported, since the
// 2-slot compare already covers the actual coaching use case).
export default function NutritionPhotoCompare() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    listClients()
      .then((rows) => {
        setClients(rows);
        if (rows.length > 0) setSelectedId(rows[0].id);
      })
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, []);

  const loadPhotos = useCallback(async (userId) => {
    if (!userId) return;
    try {
      setPhotos(await listAllPhotos(userId));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    setPhotos(null);
    loadPhotos(selectedId);
  }, [selectedId, loadPhotos]);

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

  if (!clients) {
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
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Nutrition
        </Link>
        <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Photo Compare
        </Text>

        {clients.length === 0 ? (
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
            No nutrition clients yet.
          </Text>
        ) : (
          <>
            {isWeb ? (
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ fontFamily: fonts.sans, fontSize: 14, height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #d9d4cd", marginBottom: 20, maxWidth: 280 }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <View className="mb-5 flex-row flex-wrap gap-2">
                {clients.map((c) => (
                  <Text
                    key={c.id}
                    onPress={() => setSelectedId(c.id)}
                    className="rounded-full border px-3.5 py-1.5"
                    style={{
                      fontFamily: fonts.sansMedium,
                      fontSize: 13,
                      borderColor: selectedId === c.id ? colors.primary : "#d6d3d1",
                      backgroundColor: selectedId === c.id ? colors.primary : "transparent",
                      color: selectedId === c.id ? "white" : "#57534e",
                    }}
                  >
                    {c.name}
                  </Text>
                ))}
              </View>
            )}

            {!photos ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <PhotoCompare photos={photos} />
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
