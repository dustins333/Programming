import { useEffect } from "react";
import { Platform } from "react-native";

// Makes the on-screen keyboard actually push the web app's layout up,
// instead of covering it.
//
// Supersedes ViewportZoomReset, which only cured half of one symptom.
//
// THE BUG THIS FIXES: expo-router's ScrollViewStyleReset pins the app to
// `#root,body,html{height:100%}` + `body{overflow:hidden}`. On iOS (and on
// Android Chrome, whose default is also `resizes-visual`) opening the
// keyboard shrinks the VISUAL viewport but leaves the LAYOUT viewport
// alone — so `height:100%` never changes, the page keeps rendering at full
// height, and whatever sits in the bottom ~45% is simply behind the
// keyboard. Any screen whose content fits the viewport then has nothing to
// scroll: measured on /login at 375x812, the one scrollable ancestor of the
// email field reported scrollHeight 720 === clientHeight 720, with the two
// inputs at y=425 and y=491. There was no scroll position that could bring
// them into view. That is why this reads as "a common theme" rather than
// one screen's bug — it is the app shell, not any individual screen.
//
// Note `automaticallyAdjustKeyboardInsets` (set on AuthScreen's ScrollView
// and elsewhere) is an iOS-NATIVE prop — react-native-web's ScrollView has
// no reference to it at all, so it is a silent no-op on the PWA.
//
// THE FIX: track `visualViewport.height` and set the root element's height
// to it, which cascades through body/#root's `height:100%` and re-lays the
// whole app out inside the visible strip — the same thing Android's native
// adjustResize does, which this codebase already designs for. A screen that
// no longer fits then genuinely overflows its own ScrollView, so it can
// scroll, and we put the focused field on screen ourselves rather than
// trusting each browser's scroll-into-view.
//
// KNOWN LIMIT: `position: fixed` is resolved against the layout viewport,
// not against the root element's height, so full-screen RN <Modal> overlays
// (which react-native-web portals to body as `position:fixed; inset:0`) do
// not shrink with this. In-page screens — every (auth) screen, every tab —
// are covered.
export function WebKeyboardViewport() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute("content") ?? null;

    // Installed-PWA only: pin the scale outright. Zoom in a standalone
    // window is never intentional — there is no browser chrome to reset it
    // from, so a stray pinch or an auto-zoom that fails to unwind leaves the
    // app permanently askew with no way back short of force-quitting ("it
    // doesn't hold its shape"). A normal browser tab keeps pinch-zoom, where
    // it is a real accessibility affordance and the user can undo it.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const baseViewport =
      original && standalone ? `${original}, maximum-scale=1, user-scalable=no` : original;
    if (meta && baseViewport && baseViewport !== original) meta.setAttribute("content", baseViewport);

    let frame = 0;
    let zoomRestore = 0;

    const release = () => {
      root.style.height = "";
      // Safari pans the visual viewport to follow the keyboard and does not
      // always pan back when it closes, which leaves the app scrolled down
      // inside a window that cannot scroll (body overflow is hidden), i.e.
      // the header simply gone.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    // Something the keyboard is actually open for.
    const isEditable = (el) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    // Put the focused field on screen. Done here rather than left to the
    // browser because the field only becomes reachable *after* the resize
    // above makes its container scrollable — by which point Safari has
    // already had (and missed) its chance. `block: "center"` also beats the
    // browser's minimal-scroll default, which happily leaves a field flush
    // against the top of the keyboard.
    const revealFocused = () => {
      const el = document.activeElement;
      if (isEditable(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
    };

    const apply = () => {
      // A deliberate pinch-zoom shrinks the visual viewport too, and fighting
      // it by reflowing the page would be hostile. Only react to a viewport
      // the user did not shrink themselves.
      if (vv.scale > 1.01) {
        release();
        return;
      }
      // innerHeight is the LAYOUT viewport and does not move when the
      // keyboard opens, so the difference is the occluded strip. The
      // threshold keeps URL-bar collapse and rounding noise out of it, and
      // requiring a focused editable keeps anything *else* that shrinks the
      // visual viewport (browser toolbars, an OS overlay) from reflowing the
      // whole app — the keyboard only matters when a field has focus.
      const occluded = window.innerHeight - vv.height;
      if (occluded > 80 && isEditable(document.activeElement)) {
        root.style.height = `${Math.round(vv.height)}px`;
        // Safari pans the visual viewport down as it opens the keyboard;
        // once the page is resized to fit, that pan is stale and leaves the
        // layout offset by the amount it scrolled.
        if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
        revealFocused();
      } else {
        release();
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    // iOS auto-zooms any focused field whose font-size is under 16px, which
    // would trip the pinch-zoom guard above and defeat the whole fix.
    // Pinning maximum-scale while a field is focused suppresses that; the
    // restore on blur is also the long-standing workaround for Safari never
    // zooming back out on its own (the original reason this file existed).
    // <select> is included here — it auto-zooms too — even though it is not
    // "editable" for the resize check above.
    const isField = (el) => isEditable(el) || el?.tagName === "SELECT";

    const handleFocusIn = (e) => {
      if (!isField(e.target)) return;
      clearTimeout(zoomRestore);
      // Already pinned for the whole session when installed — only a browser
      // tab needs the scale held for the duration of the focus.
      if (meta && baseViewport && !standalone) {
        meta.setAttribute("content", `${baseViewport}, maximum-scale=1`);
      }
      // Refocusing between two already-visible fields fires no resize, so
      // the second field would never be brought into view on its own.
      schedule();
    };

    const handleFocusOut = (e) => {
      if (!isField(e.target)) return;
      clearTimeout(zoomRestore);
      zoomRestore = setTimeout(() => {
        if (meta && baseViewport) meta.setAttribute("content", baseViewport);
      }, 100);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    // focusin/focusout bubble where focus/blur do not, so one listener at
    // the document covers every field in the tree.
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(zoomRestore);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (meta && original) meta.setAttribute("content", original);
      release();
    };
  }, []);

  return null;
}
