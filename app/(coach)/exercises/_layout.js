import { Stack } from "expo-router";

// Same reason as blocks/_layout.js: without an explicit layout, the parent
// Tabs navigator (app/(coach)/_layout.js) auto-flattens every nested route in
// this folder into its own top-level native tab. Only "exercises" itself (the
// index route) is declared as a Tabs.Screen, so "merge" leaked out as a tab of
// its own on the native coach view. A Stack here scopes the whole folder as
// one opaque group — and keeps the next route added in here from doing it
// again.
export default function ExercisesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
