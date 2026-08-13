import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, Modal, ActivityIndicator, Platform, useWindowDimensions } from "react-native";
import { getPhotoSignedUrls } from "../../lib/nutrition/photos";
import { ZoomableImage } from "./ZoomableImage";
import { formatDateMD, formatDateMDY } from "../../lib/formatDate";
import { daysBetween } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// The coach's Photos tab (coach web v2, screen 23) — compare first, browse
// second. Distinct from PhotoCompare, which the member's own Photos tab and
// the dedicated Photo Compare tool both use: that one signs every photo of
// the selected angle up front so its date stepper can flick through them.
//
// That is exactly what this screen must not do. A weekly client passes 150
// images inside a year (handoff data note 7), and a coach opening this tab
// would sit through 150 signed-URL requests to look at two pictures. Only the
// two on screen are ever fetched; every other date is text in a dropdown.

const ANGLES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

const LEFT = "#44403c";
const RIGHT = "#a46a57";

// These photos are the content of this screen, so they get the window.
//
// Sizing them off the CONTAINER WIDTH is what went wrong twice: unbounded,
// a 3:4 pane on a wide desktop card works out ~550px wide and ~730px tall,
// taller than the viewport and pushing everything below it off screen;
// capped at a fixed width, they end up tiny on a big monitor. So height
// leads — the pair fills whatever vertical room the window has left — and
// width follows from the aspect ratio, clamped so a narrow window still fits
// two side by side.
//
// Everything above the panes on this page: page padding, the back link, the
// client header, the tab bar, this toolbar, and the caption below. Measuring
// it would mean a page-relative measurement RN doesn't give portably, and
// being 20px out just means 20px of slack under the images.
const CHROME_HEIGHT = 330;
const MIN_PANE_HEIGHT = 280;
const PANE_GAP = 14;

const isWeb = Platform.OS === "web";

// Listens to `resize` directly on web rather than going through
// useWindowDimensions. Not because that was proven broken — under test it
// looked stale, but that turned out to be the harness resizing the viewport
// without dispatching a resize event at all (a dispatched one updated
// everything instantly). This is one short subscription with no indirection,
// on the screen where getting the height wrong is most visible. Native keeps
// useWindowDimensions; there is no window to drag there.
function useViewportHeight() {
  const { height: nativeHeight } = useWindowDimensions();
  const [webHeight, setWebHeight] = useState(() => (isWeb && typeof window !== "undefined" ? window.innerHeight : 0));

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    const onResize = () => setWebHeight(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isWeb ? webHeight || nativeHeight : nativeHeight;
}

// The date pill on each photo is also that side's picker: tap it, get every
// date on file for this angle, choose the one you want in that frame. Its own
// modal rather than OptionPicker because the trigger has to stay the pill
// sitting on the image — a bare <select> can't be that.
function DatePill({ tone, photo, options, onChange, isStart }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ position: "absolute", top: 10, left: 10, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: tone }}
      >
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "white" }}>
            {formatDateMD(photo.date)}
            {isStart ? " · start" : ""}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: "rgba(255,255,255,0.75)" }}>▾</Text>
        </View>
        {photo.weight ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "rgba(255,255,255,0.82)", marginTop: 1 }}>{photo.weight} lb</Text>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full rounded-2xl bg-white p-2" style={{ maxWidth: 320, maxHeight: "70%" }}>
            <Text
              className="px-3 pb-1 pt-2"
              style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Pick the {tone === LEFT ? "left" : "right"} photo
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((option) => (
                <Pressable
                  key={option.date}
                  onPress={() => {
                    onChange(option.date);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between rounded-xl px-3 py-2.5"
                  style={option.date === photo.date ? { backgroundColor: "#fdf6f2" } : undefined}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: option.date === photo.date ? colors.primaryOnWhite : "#44403c" }}>
                    {formatDateMDY(option.date)}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>{option.weight ? `${option.weight} lb` : "—"}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Pane({ photo, url, tone, options, onChange, isStart, onOpenLightbox, width, height }) {
  if (!photo) {
    return (
      <View
        className="items-center justify-center rounded-xl border border-dashed"
        style={{ width, height, borderColor: "#ddd6cd", backgroundColor: "#faf8f6" }}
      >
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>No photo</Text>
      </View>
    );
  }
  return (
    <View style={{ width, height, position: "relative" }}>
      {url ? (
        <Pressable onPress={onOpenLightbox}>
          <Image source={{ uri: url }} style={{ width, height, borderRadius: 12, backgroundColor: "#f1efed" }} resizeMode="cover" />
        </Pressable>
      ) : (
        <View className="items-center justify-center rounded-xl" style={{ width, height, backgroundColor: "#f1efed" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      <DatePill tone={tone} photo={photo} options={options} onChange={onChange} isStart={isStart} />
    </View>
  );
}

export function PhotoCompareRail({ photos, startDate, onManage }) {
  const windowHeight = useViewportHeight();
  const [railWidth, setRailWidth] = useState(0);
  const [angle, setAngle] = useState("front");
  const [leftDate, setLeftDate] = useState(null);
  const [rightDate, setRightDate] = useState(null);
  const [urls, setUrls] = useState({});
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const attemptedRef = useRef(new Set());

  // Oldest first — a comparison reads left-to-right as time passing, and the
  // default pair is "where she started" against "where she is".
  const anglePhotos = useMemo(
    () =>
      photos
        .filter((p) => p.angle === angle)
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [photos, angle]
  );

  // Switching angle keeps the dates selected wherever that angle also has a
  // photo, and only falls back to oldest/newest for the ones it doesn't —
  // flicking Front→Side to see the same two weeks shouldn't silently
  // renegotiate which two weeks you're looking at.
  useEffect(() => {
    if (anglePhotos.length === 0) {
      setLeftDate(null);
      setRightDate(null);
      return;
    }
    const has = (date) => date && anglePhotos.some((p) => p.date === date);
    setLeftDate((cur) => (has(cur) ? cur : anglePhotos[0].date));
    setRightDate((cur) => (has(cur) ? cur : anglePhotos[anglePhotos.length - 1].date));
  }, [anglePhotos]);

  const leftPhoto = anglePhotos.find((p) => p.date === leftDate) ?? null;
  const rightPhoto = anglePhotos.find((p) => p.date === rightDate) ?? null;

  // The whole point of this component: two paths, never the full history.
  //
  // "Already tried" is tracked in a ref rather than inferred from `urls`.
  // Inferring it (missing = paths with no entry in urls) reads correctly but
  // loops forever the moment signing yields a null URL for a path — which
  // Supabase does per-path for an object that no longer exists. The write
  // lands, the key is still falsy, the effect re-runs, and it re-signs on
  // every render. Caught at 244 requests for what should have been two.
  useEffect(() => {
    const paths = [leftPhoto?.storage_path, rightPhoto?.storage_path].filter(Boolean);
    const missing = paths.filter((path) => !attemptedRef.current.has(path));
    if (missing.length === 0) return;
    missing.forEach((path) => attemptedRef.current.add(path));
    let cancelled = false;
    getPhotoSignedUrls(missing)
      .then((next) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, ...next }));
      })
      // A failed path stays marked as attempted. Clearing the mark to allow a
      // retry looks generous and is the same bug in slower motion: signing
      // fails, the mark clears, the next render re-signs, forever. A blank
      // frame until reload beats a request every render.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leftPhoto?.storage_path, rightPhoto?.storage_path]);

  const weeksApart = leftPhoto && rightPhoto ? Math.abs(Math.round(daysBetween(rightPhoto.date, leftPhoto.date) / 7)) : null;
  const weightDelta =
    leftPhoto?.weight !== null && leftPhoto?.weight !== undefined && rightPhoto?.weight !== null && rightPhoto?.weight !== undefined
      ? Number(rightPhoto.weight) - Number(leftPhoto.weight)
      : null;

  const setCount = new Set(photos.map((p) => p.date)).size;

  // Height first, then width from the 3:4 ratio, then clamp to whatever the
  // container can actually give two panes.
  const paneHeight = Math.max(MIN_PANE_HEIGHT, windowHeight - CHROME_HEIGHT);
  const widthFromHeight = paneHeight * 0.75;
  const widthFromRail = railWidth > 0 ? (railWidth - PANE_GAP) / 2 : widthFromHeight;
  const paneWidth = Math.max(120, Math.min(widthFromHeight, widthFromRail));
  const finalHeight = paneWidth / 0.75;

  return (
    <View>
      <View className="mb-4 flex-row flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Compare
          </Text>
          <View className="flex-row rounded-full p-1" style={{ backgroundColor: "#f1ede8" }}>
            {ANGLES.map((a) => (
              <Pressable
                key={a.key}
                onPress={() => setAngle(a.key)}
                className="rounded-full px-4 py-1.5"
                style={{ backgroundColor: angle === a.key ? "white" : "transparent" }}
              >
                <Text
                  style={{
                    fontFamily: angle === a.key ? fonts.sansSemiBold : fonts.sansMedium,
                    fontSize: 12.5,
                    color: angle === a.key ? "#2a211c" : "#8a8279",
                  }}
                >
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
          {weeksApart !== null ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
              {weeksApart} week{weeksApart === 1 ? "" : "s"} apart
            </Text>
          ) : null}
          {weightDelta !== null ? (
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: weightDelta < 0 ? "#4d6142" : weightDelta > 0 ? "#8a5a2e" : "#78716c" }}>
              {weightDelta > 0 ? "+" : ""}
              {weightDelta.toFixed(1)} lb
            </Text>
          ) : null}
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c3bdb4" }}>
            {setCount} set{setCount === 1 ? "" : "s"} on file
          </Text>
          {onManage ? (
            <Pressable onPress={onManage} className="rounded-lg px-3.5 py-2" style={{ borderWidth: 1, borderColor: "#ddd6cd", backgroundColor: "white" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Manage photos</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {anglePhotos.length === 0 ? (
        <View className="items-center justify-center rounded-xl border border-dashed py-14" style={{ borderColor: "#ddd6cd" }}>
          <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>No {angle} photos on file yet.</Text>
        </View>
      ) : (
        <>
          <View
            className="flex-row justify-center"
            style={{ gap: PANE_GAP }}
            onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
          >
            <Pane
              photo={leftPhoto}
              url={leftPhoto ? urls[leftPhoto.storage_path] : null}
              tone={LEFT}
              options={anglePhotos}
              onChange={setLeftDate}
              isStart={Boolean(startDate && leftPhoto && leftPhoto.date <= startDate)}
              onOpenLightbox={() => leftPhoto && urls[leftPhoto.storage_path] && setLightboxUrl(urls[leftPhoto.storage_path])}
              width={paneWidth}
              height={finalHeight}
            />
            <Pane
              photo={rightPhoto}
              url={rightPhoto ? urls[rightPhoto.storage_path] : null}
              tone={RIGHT}
              options={anglePhotos}
              onChange={setRightDate}
              onOpenLightbox={() => rightPhoto && urls[rightPhoto.storage_path] && setLightboxUrl(urls[rightPhoto.storage_path])}
              width={paneWidth}
              height={finalHeight}
            />
          </View>
          <Text className="mt-3 text-center" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            Tap either date to pick a different photo for that side. Tap a photo to open it full size.
          </Text>
        </>
      )}

      <Modal visible={!!lightboxUrl} animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        {lightboxUrl ? <ZoomableImage uri={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
      </Modal>
    </View>
  );
}
