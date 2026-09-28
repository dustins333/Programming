import { Stack } from "expo-router";

// A Stack for the folder so the client route can't flatten into its own
// top-level native tab (same reason as prep/_layout.js), and so "‹ Today"
// is a real back within this stack.
export default function StrategyLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
