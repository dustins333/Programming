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

    // Something the keyboard is actually open for.
    const isEditable = (el) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    let frame = 0;

    const release = () => {
      root.style.height = "";
      // Never scroll while a field is focused. On iOS a programmatic scroll
      // during the focus/keyboard-open gesture drops the focus, which closes
      // the keyboard the tap just opened — the "pops up and instantly
      // disappears" report. Unwinding Safari's stale pan is only needed once
      // the keyboard is actually gone, so defer it to that case.
      if (isEditable(document.activeElement)) return;
      // Safari pans the visual viewport to follow the keyboard and does not
      // always pan back when it closes, which leaves the app scrolled down
      // inside a window that cannot scroll (body overflow is hidden), i.e.
      // the header simply gone.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
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
      } else {
        release();
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    // THIS COMPONENT DOES NOTHING WHILE A FIELD IS TAKING FOCUS, ON PURPOSE.
    //
    // It used to also listen on focusin/focusout, and from there it rewrote
    // the viewport <meta> (pinning maximum-scale to stop iOS auto-zooming a
    // sub-16px field), scrolled the window to unwind Safari's pan, and
    // scrollIntoView'd the focused field. On a real iPhone the result was
    // that tapping the email field on /login opened the keyboard and closed
    // it again immediately — you could not sign in at all, in the installed
    // PWA or in a plain browser tab. Every one of those three is a DOM write
    // landing in the middle of the focus gesture, and any of them can cost
    // the focus on WebKit; removing only the scrolls was not enough, because
    // the meta rewrite runs on the browser-tab path.
    //
    // What is left is a passive observer: the visual viewport shrinks, so the
    // root shrinks to match, which is the whole reason the file exists. It
    // never touches focus, the meta, or scroll position while a field is
    // being focused. If auto-zoom or scroll-into-view need solving again,
    // they need a real device in hand first — this has now been reasoned
    // about wrongly twice.
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      if (meta && original) meta.setAttribute("content", original);
      release();
    };
  }, []);

  return null;
}
