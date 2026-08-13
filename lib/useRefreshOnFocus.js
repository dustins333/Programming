import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

// A counter that increments every time the screen is focused *after* the
// first. Add it to a load effect's dependency array to make that effect
// re-run on every return to the screen.
//
// Why this rather than moving the effect into useFocusEffect: the member
// tabs are an Expo Router Tabs navigator, so screens stay mounted across tab
// switches and a mount-only effect never re-runs — a member could log a set
// on My Fitness and find My History unchanged until an app restart. But most
// of these effects also legitimately depend on real values (selected date,
// week window, access status), and useFocusEffect's callback would re-fire
// on every one of those changes too, plus needs cleanup-return discipline.
// Feeding a focus counter into the existing dependency array keeps both
// behaviours without restructuring the effect.
//
// Skipping the first focus matters: without it the initial mount would fire
// the load twice, once from the effect and once from the bump.
export function useRefreshOnFocus() {
  const [focusKey, setFocusKey] = useState(0);
  const seenFirstFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!seenFirstFocus.current) {
        seenFirstFocus.current = true;
        return;
      }
      setFocusKey((k) => k + 1);
    }, [])
  );

  return focusKey;
}
