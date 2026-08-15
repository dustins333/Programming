import { useWindowDimensions } from "react-native";
import { CoachHomeDesktop } from "../../components/coach/CoachHomeDesktop";
import { CoachHomeMobile } from "../../components/coach/CoachHomeMobile";

// Expo splits by PLATFORM at bundle time (index.js native / index.web.js
// web) — there is no "mobile web" platform, and the installed PWA loads the
// exact same web bundle desktop Chrome does. So a device split has to happen
// at runtime, on viewport width.
//
// Same breakpoint CoachShell already uses for its sidebar-vs-drawer switch
// (components/CoachShell.js), so the page and its chrome can't disagree
// about which layout they're in. Deliberately a width test rather than any
// attempt to detect "is this the PWA": a desktop browser dragged narrow
// should get the compact layout too, and a tablet in landscape shouldn't be
// forced into a phone screen.
const MOBILE_BREAKPOINT = 768;

export default function CoachHomeWeb() {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT ? <CoachHomeMobile /> : <CoachHomeDesktop />;
}
