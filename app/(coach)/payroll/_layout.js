import { Stack } from "expo-router";

// Same reason as blocks/_layout.js: without this, the parent Tabs
// navigator auto-flattens every nested route (requests, nutrition, report,
// periods) into its own top-level tab on native.
export default function PayrollLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
