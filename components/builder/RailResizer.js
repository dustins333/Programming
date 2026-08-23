import { useCallback, useEffect, useRef } from "react";

// Drag handle between the session column and the builder's right rail.
//
// WEB ONLY — raw DOM, so only import it from a .web.js screen. It's a plain
// <div> rather than a react-native-web View on purpose: this needs a real
// col-resize cursor, and going through RNW's event normalisation buys
// nothing here.
//
// The listeners live on `window`, not on the handle, because the pointer
// routinely leaves a 7px-wide element mid-drag — bind to the handle and the
// drag dies the moment you move faster than the re-render.
//
// Sits outside every dnd-kit draggable, so there's nothing for its
// PointerSensor to claim.

export const RAIL_WIDTH_KEY = "kova.builderRailWidth";
export const RAIL_DEFAULT = 268;
export const RAIL_MIN = 240;
export const RAIL_MAX = 620;
const HANDLE_WIDTH = 7;
// What the session column itself must keep, however wide the rail is dragged.
const MAIN_MIN = 520;

// `available` is the width of the ROW the rail lives in, not the viewport.
// That distinction matters: the builder also has a ~288px exercise library
// pinned to the left, so clamping against the window would happily leave the
// session column 290px narrower than this floor claims to guarantee.
export function clampRailWidth(width, available) {
  const room = Number.isFinite(available) && available > 0 ? available - MAIN_MIN - HANDLE_WIDTH : RAIL_MAX;
  const ceiling = Math.max(RAIL_MIN, Math.min(RAIL_MAX, room));
  return Math.round(Math.max(RAIL_MIN, Math.min(ceiling, width)));
}

// Read at mount only. There's no DOM to measure yet, so this is a coarse
// guard — the component re-clamps against the real row width on mount.
export function loadRailWidth(fallback = RAIL_DEFAULT) {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage?.getItem(RAIL_WIDTH_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return fallback;
  return clampRailWidth(stored, window.innerWidth);
}

export function RailResizer({ width, onResize }) {
  const handleRef = useRef(null);
  const drag = useRef(null);
  // Kept in a ref so the pointer listeners don't have to be torn down and
  // rebound on every pixel of a drag.
  const widthRef = useRef(width);
  widthRef.current = width;

  const persist = useCallback((value) => {
    try {
      window.localStorage?.setItem(RAIL_WIDTH_KEY, String(value));
    } catch {
      // Private mode / storage disabled — the width just won't stick.
    }
  }, []);

  // A measured 0 means the row hasn't laid out yet (or is degenerate), not
  // "unlimited room" — fall back to the viewport rather than letting the
  // clamp open all the way up.
  const rowWidth = useCallback(() => {
    const measured = handleRef.current?.parentElement?.getBoundingClientRect().width ?? 0;
    return measured > 0 ? measured : window.innerWidth;
  }, []);

  // Re-clamp on mount and on window resize — a rail dragged wide on a big
  // monitor would otherwise squeeze the session column to nothing when the
  // same coach opens the builder on a laptop.
  useEffect(() => {
    const reclamp = () => {
      const next = clampRailWidth(widthRef.current, rowWidth());
      if (next !== widthRef.current) onResize(next);
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [onResize, rowWidth]);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      // Dragging left widens the rail, so the delta is inverted.
      onResize(clampRailWidth(drag.current.startWidth - (e.clientX - drag.current.startX), drag.current.row));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      // Text selection is suppressed for the whole drag — without it, moving
      // across the session list highlights every lift name on the way past.
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      persist(widthRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onResize, persist]);

  return (
    <div
      ref={handleRef}
      onPointerDown={(e) => {
        // Row width is measured once per drag rather than per move: it can't
        // change mid-drag, and reading layout on every pointermove forces a
        // reflow each frame.
        drag.current = { startX: e.clientX, startWidth: width, row: rowWidth() };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      }}
      // Reset persists too — otherwise "back to default" silently comes back
      // as the old width on the next load.
      onDoubleClick={() => {
        const next = clampRailWidth(RAIL_DEFAULT, rowWidth());
        onResize(next);
        persist(next);
      }}
      title="Drag to resize · double-click to reset"
      style={{
        width: HANDLE_WIDTH,
        flex: `0 0 ${HANDLE_WIDTH}px`,
        cursor: "col-resize",
        background: "#ece7e1",
        // A 7px hit area with a 1px line down the middle: wide enough to grab,
        // narrow enough to still read as the divider that was there before.
        backgroundClip: "content-box",
        borderLeft: "3px solid #faf8f6",
        borderRight: "3px solid #faf8f6",
        boxSizing: "border-box",
      }}
    />
  );
}
