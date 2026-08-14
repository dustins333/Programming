import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Web implementation of a NON-BLOCKING full-screen overlay layer, for the
// three things that float over the whole app without owning it: ToastHost,
// WebPushBanner and AppUpdateChecker.
//
// All three used to render through an RN <Modal transparent>, and that was a
// real bug, not a style nit: react-native-web renders a Modal as TWO stacked
// `position: fixed; inset: 0` divs (ModalAnimation's container at z-index
// 9999, then ModalContent's own), portaled to document.body, and NEITHER
// sets pointer-events. `pointerEvents="box-none"` on the child inside is no
// help — the ancestors have already captured the event. Measured in a
// browser against a real RNW Modal: with a banner up, elementFromPoint at
// the top, middle AND bottom of the viewport all returned an element inside
// the Modal, so the entire app underneath was untouchable. That is what made
// scrolling on the PWA "get stuck at times" — a toast is only up for 3-4.5s,
// so it read as intermittent, while the push/update banners blocked until
// dismissed. Same root cause as the FloatingMessageBubble bug on native
// ("its overlaying the whole screen with a clear non clickable page"), which
// was fixed by dropping ITS Modal.
//
// Dropping the Modal for a plain in-tree overlay doesn't work here though:
// every RNW View is `position: relative; z-index: 0`, so it creates a
// stacking context, and an overlay nested anywhere in the app tree is
// trapped inside one — a z-index of 10000 still painted UNDER a real
// Modal's body-level 9999 portal (measured). Toasts genuinely do need to sit
// above an already-open modal; several flows raise one while a create/edit
// modal is deliberately still open.
//
// So: our own portal, matching the Modal's stacking but not its blocking.
// The host is `pointer-events: none`, which lets everything through by
// default; children keep their existing pointerEvents="box-none", whose RNW
// polyfill re-enables `auto` on ITS children, so the toast/banner itself
// stays tappable while the rest of the screen is untouched. Verified all
// three ways in a browser: paints above an open Modal, is clickable itself,
// and hit-testing away from it reaches the content below.
const HOST_CSS = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;pointer-events:none";

export function PassThroughOverlay({ visible = true, children }) {
  // Created lazily in state (not a ref) so the first render already has a
  // node to portal into — an effect-created host would portal nothing on the
  // initial paint and flash the overlay in a frame late.
  const [host] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.setAttribute("style", HOST_CSS);
    return el;
  });

  useEffect(() => {
    if (!host) return undefined;
    document.body.appendChild(host);
    return () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    };
  }, [host]);

  if (!visible || !host) return null;
  return createPortal(children, host);
}
