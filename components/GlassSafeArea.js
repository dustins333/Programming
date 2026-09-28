import { createContext, useContext } from "react";
import { Platform } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

// iOS 26+ paints a frosted "Liquid Glass" fade over the top edge of a
// home-screen web app, and nothing a page does switches it off. Anything
// drawn in that band reads as washed out ("lost in the clouds", Terra's
// words; see docs/history/platform-auth-infra.md).
//
// So in the installed web app, the top inset every screen already pads by
// gets GLASS_CLEARANCE added, app-wide, here. Keyed on "installed", never
// on the inset itself: on Terra's iPhone the page starts below the status
// bar, the inset is 0, and the fade still covers it.
//
// 15 was tuned on her iPhone (32, 22, 15 all sharp). Go back up if the
// haze returns on a newer iOS.
export const GLASS_CLEARANCE = 15;

// True in a home-screen install (standalone display mode, or iOS's older
// navigator.standalone flag); false in a browser tab and on native.
export function isInstalledWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.navigator.standalone === true || Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

// The screen's true top inset, glass clearance included. CoachShell zeroes
// the ordinary inset for the pages under its header (the header already
// cleared the top), so a full-screen overlay opened from one of those pages
// reads this instead to clear the status bar and the fade itself.
const ScreenInsetsContext = createContext(null);

export function useScreenInsets() {
  const screen = useContext(ScreenInsetsContext);
  const ordinary = useContext(SafeAreaInsetsContext);
  return screen ?? ordinary ?? { top: 0, right: 0, bottom: 0, left: 0 };
}

// Mounted once, just inside SafeAreaProvider. The library provides its
// insets only after its first measurement (it renders nothing before), so
// `parent` is always set by the time this renders children.
export function GlassSafeArea({ children }) {
  const parent = useContext(SafeAreaInsetsContext);
  if (Platform.OS !== "web" || !parent) return children;
  const insets = isInstalledWebApp() ? { ...parent, top: parent.top + GLASS_CLEARANCE } : parent;
  return (
    <ScreenInsetsContext.Provider value={insets}>
      <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>
    </ScreenInsetsContext.Provider>
  );
}
