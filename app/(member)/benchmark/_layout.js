import { Stack } from "expo-router";

// Required, not tidiness: without a layout here Expo Router flattens every
// nested route in this folder into the parent Tabs navigator, so
// benchmark/[movement] would show up as its own tab in the member tab bar.
export default function MemberBenchmarkLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }} />;
}
