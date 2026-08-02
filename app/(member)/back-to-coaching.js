import { Redirect } from "expo-router";

// The "Coaching" tab (staff-only, see (member)/_layout.js) is a pure exit
// hatch — tapping it just bounces straight back to the coach dashboard,
// same "routable but not really a screen" shape as a tab that just redirects.
export default function BackToCoaching() {
  return <Redirect href="/(coach)" />;
}
