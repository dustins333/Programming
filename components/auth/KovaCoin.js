import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, View } from "react-native";

const LOGO = require("../../assets/kova-logo.jpg");

// The spinning coin is PRE-RENDERED — a real ray-traced 3D cylinder (both
// logo faces, a machined steel edge, one fixed key light) baked to a
// 120-frame sprite sheet at build time. The player below just windows one
// frame at a time. 120 frames, not 40: at 4.5s a turn, 40 frames is ~9fps
// and Terra immediately read it as jumpy — 120 gives 3° steps at ~27fps,
// which reads as continuous motion. A 12×10 grid rather than one vertical
// strip keeps the bitmap inside GPU texture limits (a 120-frame strip
// would be 36,000px tall; iOS caps at 16,384).
//
// This replaced a five-layer live composite (offset face discs + rim
// "twins" + a centre bar, orthographically squashed), and the reason is
// hard-won, not aesthetic: that approach failed five separate times in ways
// web verification could not catch — SVG gradient ids resolving differently
// on native, opacity-driven face culling letting the far face bleed through
// on a real phone, rim fills reading as background or as void. Every fix
// exposed the next seam, because layered 2D pieces have to *agree* with
// each other frame by frame on every renderer. Pixels don't have to agree
// with anything: a bitmap renders identically on iOS, Android, and web, or
// not at all. Terra called it — "you are putting 2d files together, just
// make it a 3d one."
//
// If the mark or palette ever changes, regenerate the sheet with
// scripts/render_coin.py (a ~100-line numpy ray-tracer) — cylinder of
// radius 1, half-thickness 0.145, logo on the obverse, inverted logo
// sampled mirrored (like a real struck coin) on the reverse, steel edge lit
// by one upper-left key light.
const SHEET = require("../../assets/kova-coin-sheet.webp");
const FRAMES = 120;
const COLS = 12;
const ROWS = 10;
const FRAME_PX = 300; // sheet cell size
const COIN_PX = 270; // coin diameter within a cell; the rest is margin

// useNativeDriver drives transform/opacity off the UI thread on native.
// react-native-web has no native animated module and warns once per app if
// asked, so it's opted out rather than left to complain.
const NATIVE = Platform.OS !== "web";

export function KovaCoin({ size = 140, duration = 4500, bob = true, shadow = true }) {
  // Frame stepping is a plain rAF loop + setState. At 120 frames over 4.5s
  // that's ~27 real re-renders a second (setFrame with an unchanged index
  // bails out) of a single translate — and unlike an Animated-driven approach
  // there is no interpolation, no opacity switching, and no transform math
  // left to behave differently on someone's phone than on this machine.
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let raf;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      setFrame(Math.floor((((now - start) % duration) / duration) * FRAMES) % FRAMES);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  // The bob and shadow stay live — translateY/scaleX-only loops, the one
  // kind of animation that never misbehaved through all of this.
  const bobV = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bob && !shadow) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobV, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(bobV, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bobV, duration, bob, shadow]);

  const lift = bobV.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const shadowScale = bobV.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });

  // Window sized so the coin itself renders at `size`; the frame's
  // transparent margin scales along with it (and doubles as bleed
  // protection at fractional scales — a sub-pixel of the neighbouring
  // frame showing at the window edge is transparent there).
  const win = (size * FRAME_PX) / COIN_PX;

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={{ transform: bob ? [{ translateY: lift }] : [] }}>
        <View style={{ width: win, height: win, overflow: "hidden" }}>
          <Image
            source={SHEET}
            // Android-only prop: kill the default cross-fade so early frame
            // ticks don't flash.
            fadeDuration={0}
            resizeMode="stretch"
            style={{
              width: win * COLS,
              height: win * ROWS,
              transform: [
                { translateX: -(frame % COLS) * win },
                { translateY: -Math.floor(frame / COLS) * win },
              ],
            }}
          />
        </View>
      </Animated.View>

      {shadow ? (
        <Animated.View
          style={{
            marginTop: 2,
            width: size * 0.82,
            height: 24,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scaleX: shadowScale }],
          }}
        >
          {/* RN has no blur filter, so the soft edge is nested ellipses of
              low per-layer opacity accumulating toward the centre. */}
          {[1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28].map((scale) => (
            <View
              key={scale}
              style={{
                position: "absolute",
                width: size * 0.82 * scale,
                height: 24 * scale,
                borderRadius: 12 * scale,
                backgroundColor: "#2a211c",
                opacity: 0.045,
              }}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

// The flat disc the reset/setup screens use instead. The spin is a launch
// moment only, so this one never animates.
export function KovaDisc({ size = 58 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: "#ffffff",
        overflow: "hidden",
        backgroundColor: "#faf8f6",
        shadowColor: "#2a211c",
        shadowOpacity: 0.24,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      }}
    >
      <Image source={LOGO} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
    </View>
  );
}
