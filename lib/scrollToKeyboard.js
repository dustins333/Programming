import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

// KeyboardDoneButton (components/KeyboardDoneButton.js) floats a "Done" bar
// directly above the keyboard whenever one's open. iOS's own automatic
// keyboard-avoidance (ScrollView's native inset tracking, KeyboardAvoidingView's
// padding behavior) only knows about the real system keyboard's height — it
// has no way to know this extra bar exists, so anything relying purely on
// that automatic behavior reveals a focused field right up to the
// keyboard's own edge, and the bar (sitting on top of that) covers it right
// back up. Every place computing "how much of the bottom of the screen is
// unusable" needs to add this on top of the raw keyboard height — matches
// the bar's own rendered height (16px vertical padding + ~19px text line +
// 1px border), rounded up a little for safety.
export const DONE_BAR_HEIGHT = 44;

// Robust "scroll this focused input above the keyboard" helper for a
// ScrollView, shared by ExerciseCard (superset logging) and MessageThread
// (embedded-card usage). Originally built on
// ScrollView.scrollResponderScrollNativeHandleToKeyboard — confirmed on a
// real device that this legacy RN ScrollResponder-mixin API is unreliable
// under this app's New Architecture (newArchEnabled: true, app.json): it
// happened to work when retried against a fresh keyboardDidShow event (the
// first exercise's fields, keyboard opening for the first time), but
// tapping a field while the keyboard was *already* open — no new
// keyboardDidShow to retry against, the legacy API's own cached-frame
// lookup is the only remaining path — silently did nothing. That's exactly
// the "second exercise in a superset" symptom reported after the first fix.
//
// Replaced with a hand-rolled version using only modern, Fabric-safe
// primitives: measureInWindow (the field's real current on-screen
// position) and a live-tracked scroll offset (RN has no synchronous "get
// current scroll offset" — the returned onScroll handler is the standard
// way to know it), fed into a real scrollTo. No dependency on RN's own
// internal keyboard-frame caching at all, so it doesn't matter whether the
// keyboard was already open or not.
//
// scrollOffsetRef is owned by whichever component actually renders the
// ScrollView (My Fitness's session page, or the page hosting an embedded
// MessageThread) — every ExerciseCard/MessageThread instance sharing one
// ScrollView must read the same live offset, not track its own separately.
// Native only — the web PWA never fires these keyboard events at all.
export function useScrollToKeyboard(scrollViewRef, scrollOffsetRef) {
  const pendingRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const keyboardHeightRef = useRef(keyboardHeight);
  keyboardHeightRef.current = keyboardHeight;

  const performScroll = (ref) => {
    if (!scrollViewRef?.current || !ref?.measureInWindow) return;
    ref.measureInWindow((x, y, width, height) => {
      const screenHeight = Dimensions.get("window").height;
      const occludedHeight = keyboardHeightRef.current > 0 ? keyboardHeightRef.current + DONE_BAR_HEIGHT : 0;
      const visibleBottom = screenHeight - occludedHeight - 24;
      const overlap = y + height - visibleBottom;
      if (overlap > 0) {
        const current = scrollOffsetRef?.current ?? 0;
        scrollViewRef.current?.scrollTo({ y: Math.max(0, current + overlap), animated: true });
      }
    });
  };

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (pendingRef.current) performScroll(pendingRef.current);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (ref) => {
    if (Platform.OS === "web" || !ref) return;
    pendingRef.current = ref;
    performScroll(ref);
  };
}

// KeyboardAvoidingView's "padding" behavior measures its own on-screen
// position via onLayout to decide how much bottom padding to add — a
// documented RN limitation is that this measurement gets unreliable once
// the view is nested several levels deep below other content (a screen
// header, a back link, other text above it), which is exactly
// MessageThread's `fill` layout inside a Tabs-navigator screen: confirmed
// on a real device, the compose box vanished into a large dead gap above
// the keyboard instead of sitting right above it. Tracking the keyboard's
// real height directly from the OS event and applying it as explicit
// padding sidesteps that measurement entirely — no dependency on where in
// the tree this ends up mounted. iOS only, matching every other
// KeyboardAvoidingView `behavior` prop in this app — Android's own
// windowSoftInputMode resize already handles this without JS help.
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    const showSub = Keyboard.addListener("keyboardWillShow", (e) => setHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
