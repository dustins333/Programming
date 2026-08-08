import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Robust "scroll this focused input above the keyboard" helper for a
// ScrollView, shared by ExerciseCard (superset logging) and MessageThread
// (embedded-card usage). ScrollView.scrollResponderScrollNativeHandleToKeyboard
// only knows the keyboard's on-screen frame once RN's own ScrollResponder
// mixin has observed a keyboardWillShow/keyboardDidShow event — calling it
// from a field's onFocus works fine once the keyboard is already up
// (switching fields), but on the very first focus of a screen (no keyboard
// event has fired yet) that frame isn't known yet and the call silently
// no-ops, which is exactly the "still happening" symptom this was meant to
// fix. Re-issuing the same scroll once keyboardDidShow actually fires (now
// guaranteed to have real frame data) closes that race without touching the
// onFocus-based fast path. Native only — the web PWA never fires these
// keyboard events at all, so this hook is a no-op there.
export function useScrollToKeyboard(scrollViewRef) {
  const focusedRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (focusedRef.current && scrollViewRef?.current) {
        scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(focusedRef.current, 24, true);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (ref) => {
    if (Platform.OS === "web" || !scrollViewRef?.current || !ref) return;
    focusedRef.current = ref;
    scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(ref, 24, true);
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
