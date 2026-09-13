import { Stack } from "expo-router";

// Same fix as templates/_layout.js — without it, one-offs/[oneOffId]
// flattens into its own top-level tab in the parent Tabs navigator.
export default function OneOffsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
