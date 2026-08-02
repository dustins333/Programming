import { Stack } from "expo-router";

// Same fix as blocks/_layout.js — scopes questions and clients/[userId]
// under the "nutrition" tab instead of flattening into their own tabs.
export default function NutritionLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
