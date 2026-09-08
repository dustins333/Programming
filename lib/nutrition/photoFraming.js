// How one progress photo sits inside its frame. Pure — no React, no
// Supabase — so the arithmetic can be checked without rendering anything.
//
// Stored on the photo itself (public.photos.framing, migration 0124), not
// on a pair: what moved between two shots is the camera, so nudging a photo
// once into a standard frame lines it up against every other adjusted photo
// rather than just the one beside it today.

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.05;

const DEFAULT = { scale: 1, x: 0, y: 0, ar: null };

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Tolerates anything: null, a string, a half-written object, values out of
// range. Returns null for "never adjusted", which is what lets an untouched
// photo take the plain cover path and render byte-identically to before.
export function normalizeFraming(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const scale = clamp(num(raw.scale, 1), MIN_SCALE, MAX_SCALE);
  const x = clamp(num(raw.x, 0), -1, 1);
  const y = clamp(num(raw.y, 0), -1, 1);
  const arRaw = num(raw.ar, 0);
  const ar = arRaw > 0 && arRaw < 100 ? arRaw : null;
  return { scale, x, y, ar };
}

export function isAdjusted(raw) {
  const f = normalizeFraming(raw);
  if (!f) return false;
  return f.scale !== 1 || f.x !== 0 || f.y !== 0;
}

// The size `cover` would draw this image at inside the frame: the smaller
// dimension matches the frame exactly and the other overhangs.
//
// With no `ar` on file we can't know which way it overhangs, so we assume
// it doesn't — the image is treated as exactly filling the frame. That
// degrades to "you can only pan as far as zooming has bought you", which is
// safe at any frame shape and can never expose an edge.
export function coverBox(ar, width, height) {
  if (!ar || ar <= 0) return { w: width, h: height };
  return ar > width / height ? { w: height * ar, h: height } : { w: width, h: width / ar };
}

// How far the image centre may travel from the frame centre before an edge
// of the frame is left uncovered, as a fraction of the frame.
export function panRange(framing, width, height) {
  const f = normalizeFraming(framing) ?? DEFAULT;
  const box = coverBox(f.ar, width, height);
  return {
    x: Math.max(0, (box.w * f.scale - width) / 2 / width),
    y: Math.max(0, (box.h * f.scale - height) / 2 / height),
  };
}

// Clamps a framing to what the given frame can actually show. Called on the
// way in (so nothing silly is stored) and again on the way out (so a
// framing set against a 3:4 pane can't expose an edge in the shareable
// board's much narrower cell, which crops the other axis entirely).
export function clampFraming(framing, width, height) {
  const f = normalizeFraming(framing);
  if (!f) return null;
  const range = panRange(f, width, height);
  return { ...f, x: clamp(f.x, -range.x, range.x), y: clamp(f.y, -range.y, range.y) };
}

// Where the <Image> sits inside its overflow-hidden frame, as FRACTIONS of
// that frame. Everything here is proportional, so the only thing it needs
// to know about the frame is its shape -- which means a caller whose frame
// is sized by flex or a percentage never has to measure it.
//
// That matters more than it looks: react-native-web implements onLayout
// with a ResizeObserver, so a measured version of this would flash empty on
// first paint and would be unverifiable in a headless browser.
export function framingLayoutFractions(framing, frameAspect) {
  const f = normalizeFraming(framing);
  if (!f || !frameAspect || frameAspect <= 0) return null;
  const box = coverBox(f.ar, frameAspect, 1);
  const imageWidth = (box.w / frameAspect) * f.scale;
  const imageHeight = box.h * f.scale;
  const maxX = Math.max(0, (imageWidth - 1) / 2);
  const maxY = Math.max(0, (imageHeight - 1) / 2);
  return {
    imageWidth,
    imageHeight,
    left: (1 - imageWidth) / 2 + clamp(f.x, -maxX, maxX),
    top: (1 - imageHeight) / 2 + clamp(f.y, -maxY, maxY),
  };
}

// The same thing in pixels, for a frame whose size is already known.
export function framingLayout(framing, width, height) {
  const fractions = framingLayoutFractions(framing, width / height);
  if (!fractions) return null;
  return {
    imageWidth: fractions.imageWidth * width,
    imageHeight: fractions.imageHeight * height,
    left: fractions.left * width,
    top: fractions.top * height,
  };
}

const pct = (n) => `${n * 100}%`;

// Ready to spread onto an absolutely-positioned <Image> style.
export function framingPercentStyle(framing, frameAspect) {
  const fractions = framingLayoutFractions(framing, frameAspect);
  if (!fractions) return null;
  return {
    position: "absolute",
    left: pct(fractions.left),
    top: pct(fractions.top),
    width: pct(fractions.imageWidth),
    height: pct(fractions.imageHeight),
  };
}

export function withScale(framing, nextScale, width, height) {
  const f = normalizeFraming(framing) ?? DEFAULT;
  const scale = clamp(Math.round(nextScale * 100) / 100, MIN_SCALE, MAX_SCALE);
  return clampFraming({ ...f, scale }, width, height);
}

export function withPan(framing, dxFraction, dyFraction, width, height) {
  const f = normalizeFraming(framing) ?? DEFAULT;
  return clampFraming({ ...f, x: f.x + dxFraction, y: f.y + dyFraction }, width, height);
}

export function withAspectRatio(framing, ar) {
  const f = normalizeFraming(framing) ?? DEFAULT;
  if (!ar || ar <= 0 || f.ar === ar) return f;
  return { ...f, ar };
}

// What actually gets written to the row. A framing that ends up back at its
// starting point is stored as NULL rather than an identity object, so
// "adjusted" stays an honest question the UI can ask of the data.
export function toStoredFraming(framing) {
  const f = normalizeFraming(framing);
  if (!f || !isAdjusted(f)) return null;
  return {
    scale: Math.round(f.scale * 1000) / 1000,
    x: Math.round(f.x * 10000) / 10000,
    y: Math.round(f.y * 10000) / 10000,
    ...(f.ar ? { ar: Math.round(f.ar * 10000) / 10000 } : {}),
  };
}
