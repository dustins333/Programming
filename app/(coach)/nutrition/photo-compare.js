import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Platform, ScrollView, ActivityIndicator, Switch, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { listClients } from "../../../lib/nutrition/clients";
import { listAllPhotos, getPhotoSignedUrls } from "../../../lib/nutrition/photos";
import { DateStepper, defaultDates } from "../../../components/nutrition/PhotoCompare";
import { PhotoCompareBoard } from "../../../components/nutrition/PhotoCompareBoard";
import { CoachShell, MOBILE_BREAKPOINT, SIDEBAR_WIDTH } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const isWeb = Platform.OS === "web";
const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];
const SLOT_COUNTS = [2, 3, 4];
// The board is specced against a 1080-wide card and scales from whatever
// width it is handed, so it needs a real number rather than "100%". Working
// it out from the window beats measuring: react-native-web implements
// onLayout with a ResizeObserver, which is a frame late and never fires in
// this repo's preview browser, so a measured board could not be verified
// before shipping.
const BOARD_MAX = 1080;
const PAGE_PADDING = 24;
function boardWidthFor(windowWidth) {
  const sidebar = isWeb && windowWidth >= MOBILE_BREAKPOINT ? SIDEBAR_WIDTH : 0;
  return Math.max(280, Math.min(BOARD_MAX, windowWidth - sidebar - PAGE_PADDING * 2));
}

// Standalone compare board — pick any client, compare their progress
// photos, without going through their full client-detail page. The board
// itself (PhotoCompareBoard) is a distinct branded, screenshot-ready poster
// (design_handoff_photo_compare_v1, "3b Chop"), not the plain PhotoCompare
// widget used on the client-detail Photos tab. Every control stays outside
// the board so a screenshot of the board alone carries none of them.
export default function NutritionPhotoCompare() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const boardWidth = boardWidthFor(windowWidth);
  const [clients, setClients] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [angle, setAngle] = useState("front");
  const [slotCount, setSlotCount] = useState(3);
  const [slotDates, setSlotDates] = useState(() => Array(3).fill(null));
  // One switch over the date range and each photo's own date and weight.
  // Defaults on: the board has always shown them, and a coach sharing
  // publicly is the case that opts out. The client's name is never on the
  // board at all, so it is deliberately not part of this.
  const [showDetails, setShowDetails] = useState(true);
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
    // Resizes as well as seeds: `fallback` is always slotCount long, so
    // adding a slot fills the new one from the even-spacing default while
    // keeping every date the coach already picked, and removing one drops
    // the trailing slot.
    const fallback = defaultDates(anglePhotos, slotCount);
    setSlotDates((prev) => fallback.map((d, i) => (prev[i] && anglePhotos.some((p) => p.date === prev[i]) ? prev[i] : d)));
    if (anglePhotos.length === 0) return;
    getPhotoSignedUrls(anglePhotos.map((p) => p.storage_path))
      .then((next) => setUrls((prev) => ({ ...prev, ...next })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anglePhotos, slotCount]);

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
        contentContainerStyle={{ paddingTop: insets.top + 20, maxWidth: BOARD_MAX + PAGE_PADDING * 2 }}
      >
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back to Nutrition
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Photo Compare
        </Text>
        <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Pick {slotCount} dates, then screenshot the board below to share.
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

            <View className="mb-3 flex-row gap-2">
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

            <View className="mb-5 flex-row items-center gap-2">
              <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                Photos
              </Text>
              {SLOT_COUNTS.map((n) => (
                <Text
                  key={n}
                  onPress={() => setSlotCount(n)}
                  className="rounded-full border px-3.5 py-1.5"
                  style={{
                    fontFamily: fonts.sansMedium,
                    fontSize: 13,
                    borderColor: slotCount === n ? colors.primary : "#d6d3d1",
                    backgroundColor: slotCount === n ? colors.primary : "transparent",
                    color: slotCount === n ? "white" : "#57534e",
                  }}
                >
                  {n}
                </Text>
              ))}
            </View>

            <View className="mb-5 flex-row items-center gap-3">
              <Switch
                value={showDetails}
                onValueChange={setShowDetails}
                trackColor={{ true: colors.primary, false: "#d6d3d1" }}
                thumbColor="#fff"
              />
              <View>
                <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>
                  Show dates &amp; weights
                </Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Turn off for a public post.
                </Text>
              </View>
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
                <View className="mb-4 flex-row gap-3" style={{ width: boardWidth }}>
                  {slotDates.map((date, i) => (
                    <View key={i} style={{ flex: 1 }}>
                      <DateStepper anglePhotos={anglePhotos} selectedDate={date} onChange={(d) => setSlotDate(i, d)} />
                    </View>
                  ))}
                </View>
                <PhotoCompareBoard slots={boardSlots} urls={boardUrls} showDetails={showDetails} width={boardWidth} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
