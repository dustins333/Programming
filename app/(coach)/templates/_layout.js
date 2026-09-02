import { Stack } from "expo-router";

// Same fix as blocks/_layout.js and exercises/_layout.js — without it,
// templates/[templateId] flattens into its own top-level tab in the parent
// Tabs navigator instead of staying inside the "templates" entry.
export default function TemplatesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
