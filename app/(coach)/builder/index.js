import { Redirect } from "expo-router";

// Placeholder index route — this folder only ever has meaning at
// /builder/[workoutId], reached by tapping a session cell. Without this
// file, Expo Router's Tabs navigator can't resolve the bare "builder" name
// declared in (coach)/_layout.js (`<Tabs.Screen name="builder" .../>`),
// which throws "[Layout children]: No route named 'builder' exists in
// nested children" and appears to make the whole Tabs layout fall back to
// auto-generating a flat tab per route (every nested dynamic route included)
// instead of the curated 5-tab bar — this is what was behind the "ton of
// tabs" bug. blocks/spc/exercises/nutrition never hit this because they
// already have their own index.js; builder was the one folder that didn't.
export default function BuilderIndex() {
  return <Redirect href="/(coach)/blocks" />;
}
