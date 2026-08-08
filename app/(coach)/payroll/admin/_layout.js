import { Stack } from "expo-router";

// Same reason as the parent payroll/_layout.js: without this, the Tabs
// navigator auto-flattens every nested admin route into its own top-level
// tab on native.
export default function PayrollAdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
