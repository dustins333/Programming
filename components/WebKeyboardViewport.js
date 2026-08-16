import { useEffect } from "react";
import { Platform } from "react-native";

// Keeps the web app usable while the on-screen keyboard is open.
//
// Supersedes ViewportZoomReset, which only cured half of one symptom.
//
// WHAT THIS DELIBERATELY NO LONGER DOES: set the root element's height to
// `visualViewport.height`. That was the whole point of the file, on the theory
// that iOS shrinks the VISUAL viewport but leaves the LAYOUT viewport alone, so
// `height:100%` (expo-router's ScrollViewStyleReset pins html/body/#root to it)
// never changes and the app keeps rendering underneath the keyboard.
//
// Measured on device, both halves of that are wrong. iPhone 17 Pro, iOS 26.5,
// installed PWA, keyboard open on a long scrolling page:
//
//     innerH 436   vvH 436   offTop 376   scrollY 376
//     documentElement.clientHeight 812   body 812   #root 812   docScroll 812
//
//   * innerHeight DOES shrink. iOS 26 honours interactive-widget=resizes-content
//     (see app/+html.js), so `innerHeight - vv.height` reads 0 and the shrink
//     never ran at all on current iOS — it has been inert since it was written.
//     /login was really fixed by AuthHero collapsing (commit b7b0fe7).
//   * What does not shrink is the INITIAL CONTAINING BLOCK, which is what
//     `height:100%` resolves against — hence body/#root still 812. Safari then
//     scrolls the document (376px here) to reveal the field, and that native
//     reveal is perfectly good on its own.
//
// And where the shrink did fire — a real member's phone, same 26.5, where the
// accessory-bar gap evidently clears the 80px threshold that the simulator
// lands just under — it actively caused the bug it was meant to prevent.
// Resizing the root does NOT take away the scroll offset Safari has already
// applied, so the page ends up scrolled past its own new bottom: content
// crushed against the top, a dead band below it, keyboard under that.
// Reproduced deliberately by forcing the shrink on 26.5, and it matches the
// reported screenshot exactly. Correcting it would mean scrolling, which the
// focus note below explains we may not do — so the shrink is gone instead.
//
// Note `automaticallyAdjustKeyboardInsets` (set on AuthScreen's ScrollView and
// elsewhere) is an iOS-NATIVE prop — react-native-web's ScrollView has no
// reference to it at all, so it is a silent no-op on the PWA.
//
// What remains is the part that earns its keep: pin the scale in an installed
// PWA, and unwind Safari's stale scroll once the keyboard is actually gone.
// If a screen's fields still sit under the keyboard, collapse something on that
// screen (the AuthHero pattern) — a pure render, no scrolling, no focus
// contact. Do not reintroduce a root resize without re-reading the above.
export function WebKeyboardViewport() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const vv = window.visualViewport;
    if (!vv) return;

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

    // The only thing left to do on a viewport change is tidy up after the
    // keyboard has closed; release() is itself a no-op while a field is
    // focused, so the open case correctly does nothing at all.
    const apply = () => {
      release();
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
