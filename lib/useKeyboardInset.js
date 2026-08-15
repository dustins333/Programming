import { useEffect, useState } from "react";
import { Platform } from "react-native";

// The piece components/WebKeyboardViewport.js explicitly can't cover.
//
// That shim fixes the app shell by shrinking the ROOT element to the visual
// viewport, which cascades through `height:100%` and re-lays out every
// in-page screen inside the visible strip. Its own header calls out the
// limit: `position: fixed` resolves against the LAYOUT viewport, and
// react-native-web portals every <Modal> to body as `position:fixed;
// inset:0`. So a modal keeps spanning the full layout viewport while the
// keyboard is up, and anything it anchors to the bottom lands behind the
// keyboard.
//
// For a bottom sheet that's the whole thing: `justifyContent:"flex-end"`
// pins it to a bottom that is no longer visible, and `maxHeight:"85%"` is
// 85% of a height that never changed — so it appears to shrink and jump
// the moment a field is focused.
//
// Returns the occluded strip in px plus the visible height, so a modal can
// pad itself above the keyboard and size to what's actually on screen.
// Native returns zeros and callers keep their existing percentage sizing,
// so nothing about the native app changes.
export function useKeyboardInset() {
  const [state, setState] = useState({ keyboardInset: 0, visibleHeight: null });

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;

    let frame = 0;
    const apply = () => {
      // A deliberate pinch-zoom also shrinks the visual viewport; reflowing
      // against it would fight the user. Same guard WebKeyboardViewport uses.
      if (vv.scale > 1.01) {
        setState({ keyboardInset: 0, visibleHeight: null });
        return;
      }
      // innerHeight is the LAYOUT viewport and doesn't move for the
      // keyboard, so the remainder is the occluded strip. offsetTop counts
      // too — Safari pans the visual viewport rather than only resizing it.
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // The 80px floor keeps URL-bar collapse and rounding noise from
      // reading as a keyboard, matching WebKeyboardViewport's threshold so
      // the two can't disagree about whether one is open.
      setState({
        keyboardInset: occluded > 80 ? Math.round(occluded) : 0,
        visibleHeight: Math.round(vv.height),
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    };
  }, []);

  return state;
}
