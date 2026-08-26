import { Stack } from "expo-router";

// Without this, every nested route under documents/ flattens into the
// native (coach) Tabs navigator and shows up as its own tab — the same bug
// that once leaked exercises/merge into the tab bar. A Stack here means a
// route added to this folder later can't repeat it.
export default function DocumentsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
