import { Stack } from "expo-router";

// Same fix as blocks/_layout.js — scopes [workoutId] under the "builder"
// tab instead of flattening into its own top-level tab.
export default function BuilderLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
