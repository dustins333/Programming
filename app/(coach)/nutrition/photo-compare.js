import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { listClients } from "../../../lib/nutrition/clients";
import { listAllPhotos, getPhotoSignedUrls } from "../../../lib/nutrition/photos";
import { DateStepper, defaultDates } from "../../../components/nutrition/PhotoCompare";
import { PhotoCompareBoard } from "../../../components/nutrition/PhotoCompareBoard";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const isWeb = Platform.OS === "web";
const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

// Standalone compare board — pick any client, compare their progress
// photos, without going through their full client-detail page. The board
// itself (PhotoCompareBoard) is a distinct branded, screenshot-ready design
// from the plain PhotoCompare widget used elsewhere (client-detail Photos
// tab) — date-selection controls stay outside the board as picker "chrome"
// (design_handoff_v2_settings_nutrition, Screen 3b) so a screenshot of the
// board alone doesn't include the pickers.
export default function NutritionPhotoCompare() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [angle, setAngle] = useState("front");
  const [slotDates, setSlotDates] = useState([null, null, null]);
  const [urls, setUrls] = useState({});

  const loadClients = useCallback(() => {
    setLoadError(null);
    listClients()
      .then((rows) => {
        setClients(rows);
        if (rows.length > 0) setSelectedId(rows[0].id);
      })
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, []);

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const anglePhotos = useMemo(
    () => (photos ?? []).filter((p) => p.angle === angle).slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    [photos, angle]
  );

  useEffect(() => {
    if (anglePhotos.length === 0) return;
    const fallback = defaultDates(anglePhotos, 3);
    setSlotDates((prev) => fallback.map((d, i) => (prev[i] && anglePhotos.some((p) => p.date === prev[i]) ? prev[i] : d)));
    getPhotoSignedUrls(anglePhotos.map((p) => p.storage_path))
      .then((next) => setUrls((prev) => ({ ...prev, ...next })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anglePhotos]);

  const setSlotDate = (index, date) => {
    setSlotDates((prev) => prev.map((d, i) => (i === index ? date : d)));
  };

  const boardSlots = slotDates.map((date) => {
    const photo = anglePhotos.find((p) => p.date === date);
    return photo ? { date: photo.date, weight: photo.weight } : null;
  });
  const boardUrls = Object.fromEntries(
    slotDates.map((date) => {
      const photo = anglePhotos.find((p) => p.date === date);
      return [date, photo ? urls[photo.storage_path] : null];
    })
  );

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
          {/* clients is null, not [], when listClients() itself failed —
              which is exactly the error this button exists to recover from,
              so it can't dereference .length unguarded. */}
          <Pressable onPress={() => (!clients?.length ? loadClients() : loadPhotos(selectedId))}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
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
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: "#faf8f6" }}
        contentContainerClassName="px-6 py-8"
        contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: 1100 }}
      >
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Nutrition
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Photo Compare
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Pick 3 dates, then screenshot the board below to share.
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

            <View className="mb-5 flex-row gap-2">
              {ANGLES.map((a) => (
                <Text
                  key={a.key}
                  onPress={() => setAngle(a.key)}
                  className="rounded-full border px-3.5 py-1.5"
                  style={{
                    fontFamily: fonts.sansMedium,
                    fontSize: 13,
                    borderColor: angle === a.key ? colors.primary : "#d6d3d1",
                    backgroundColor: angle === a.key ? colors.primary : "transparent",
                    color: angle === a.key ? "white" : "#57534e",
                  }}
                >
                  {a.label}
                </Text>
              ))}
            </View>

            {!photos ? (
              <ActivityIndicator color={colors.primary} />
            ) : anglePhotos.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No {angle} photos for this client yet.
              </Text>
            ) : (
              <>
                {/* Date pickers are picker "chrome" — kept outside the board
                    so a screenshot of the board alone doesn't include them. */}
                <View className="mb-4 flex-row gap-3">
                  {slotDates.map((date, i) => (
                    <View key={i} style={{ flex: 1 }}>
                      <DateStepper anglePhotos={anglePhotos} selectedDate={date} onChange={(d) => setSlotDate(i, d)} />
                    </View>
                  ))}
                </View>
                <PhotoCompareBoard clientName={clients.find((c) => c.id === selectedId)?.name ?? ""} slots={boardSlots} urls={boardUrls} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
