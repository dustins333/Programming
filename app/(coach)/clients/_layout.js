import { Stack } from "expo-router";

// Same fix as blocks/_layout.js — scopes [userId] under the "clients" tab
// instead of it flattening into its own top-level tab.
export default function ClientsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
