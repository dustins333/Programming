import { Stack } from "expo-router";

// Same fix as blocks/_layout.js — scopes this whole subtree (including
// nested spc/blocks, spc/history, spc/print, spc/templates) as one opaque
// group under the "spc" tab, instead of every nested route flattening into
// its own top-level tab in the parent Tabs navigator.
export default function SpcLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
