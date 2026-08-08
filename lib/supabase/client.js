import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { LargeSecureStore } from "./largeSecureStore";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in .env.local"
  );
}

// Web has real browser storage (defaults to localStorage); native needs the
// LargeSecureStore wrapper since expo-secure-store alone can't hold a full
// session object. detectSessionInUrl only matters on web (OAuth/magic-link
// redirects land in a URL there, never on native).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

// Supabase's token refresh timer keeps running in the background even when
// the app is backgrounded unless told otherwise — tying it to AppState avoids
// pointless refresh calls (and battery/network use) while backgrounded, and
// makes sure a refresh actually fires the moment the app comes back to
// foreground rather than waiting on its own timer. Web ignores this (no
// meaningful foreground/background lifecycle the same way).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

// Programming and Nutrition each own their tables in a dedicated schema;
// `core` holds the shared identity/role layer both modules read. One
// client, schema selected per query — see supabase.com/docs/guides/api/using-custom-schemas.
export const core = supabase.schema("core");
export const programming = supabase.schema("programming");
export const nutrition = supabase.schema("nutrition");
export const payroll = supabase.schema("payroll");
