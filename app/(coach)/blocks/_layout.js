import { Stack } from "expo-router";

// Without an explicit layout here, Expo Router's parent Tabs navigator
// (app/(coach)/_layout.js) auto-flattens every nested route in this folder
// (history, [blockId]) into its own top-level tab, even though only
// "blocks" itself (the index route) is declared as a Tabs.Screen — this is
// what caused the "ton of tabs" bug on native. An explicit Stack here
// scopes the whole folder as one opaque group under the "blocks" tab.
export default function BlocksLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
