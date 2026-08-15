import { CoachHomeMobile } from "../../components/coach/CoachHomeMobile";

// Native coach home. This used to be its own ~320-line stat-tile screen
// written before the launchpad redesign, so the app had three coach
// dashboards drifting apart — and the native one had never picked up the
// resume card, today-in-the-gym, payroll, or the attention list.
//
// It now renders the same phone screen the mobile web build does. Two
// dashboards total (desktop + mobile) instead of three, and the native app
// stops being the one that's furthest behind.
export default function CoachHome() {
  return <CoachHomeMobile />;
}
