import { Stack } from "expo-router";

// A Stack, for the same reason blocks/ payroll/ and exercises/ have one:
// without it Expo Router flattens every nested route into the parent (coach)
// Tabs navigator and each one leaks out as its own tab.
export default function CcrewLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
