import { Stack } from "expo-router";

// Without an explicit layout here, Expo Router's parent Tabs navigator
// (app/(coach)/_layout.js) auto-flattens every nested route in this folder
// ([eventId], [eventId]/responses) into its own top-level tab, even though
// only "events" itself is declared as a Tabs.Screen. Same bug that put a
// stray "merge" tab in the coach nav from app/(coach)/exercises/.
export default function EventsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
