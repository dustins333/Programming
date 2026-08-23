import { Stack } from "expo-router";

// A Stack for the folder so nested routes can't flatten into their own
// top-level native tabs — the bug app/(coach)/exercises/ shipped with when
// merge.js leaked into the tab bar.
export default function PrepLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
