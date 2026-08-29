import { Platform } from "react-native";
import { programming, supabase } from "../supabase/client";

// Crash reporting — programming.client_errors (0100).
//
// components/AppErrorBoundary.js fixed what a member SEES when a screen
// crashes; this is what lets the coach know it happened at all. She reads
// these by asking directly rather than through a screen in the app, which is
// why there's no list view anywhere.

// Reported crashes are worth having; a reporting bug that makes a crash worse
// is not. Everything below is best-effort: it swallows its own failures, and
// nothing awaits it.
export async function reportClientError({ error, componentStack }) {
  try {
    // RLS only accepts an insert from a signed-in caller (no anon writes), so
    // there's nothing to send if the session hasn't resolved. user_id is left
    // to the column's auth.uid() default rather than passed — the client can't
    // file a crash under someone else's name even by accident.
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;

    const isWeb = Platform.OS === "web";
    const hasWindow = isWeb && typeof window !== "undefined";

    await programming.from("client_errors").insert({
      screen: hasWindow ? window.location.pathname : null,
      message: String(error?.message ?? error ?? "Unknown error").slice(0, 2000),
      component_stack: componentStack ? String(componentStack).slice(0, 4000) : null,
      platform: Platform.OS,
      // "Is it her phone?" is the first question asked about any single-client
      // report — Chrome and Android versions answer it with no round trip.
      user_agent: hasWindow ? String(navigator.userAgent ?? "").slice(0, 500) : null,
      // A member running a stale cached bundle is a real, recurring cause of a
      // blank screen. Capturing which one she's on makes that visible instead
      // of guessed at.
      app_build: hasWindow ? currentBundle() : null,
    });
  } catch {
    // Deliberately silent. The member is already looking at an error screen;
    // a failed report must not add anything on top of it.
  }
}

// The entry bundle filename Expo's static export is currently serving
// ("entry-<hash>.js"). Compared against what the site serves now, this is what
// tells a stale installed copy apart from a genuine bug.
function currentBundle() {
  try {
    const scripts = Array.from(document.getElementsByTagName("script"));
    const entry = scripts.map((s) => s.src || "").find((src) => src.includes("/entry-"));
    return entry ? entry.split("/").pop().slice(0, 200) : null;
  } catch {
    return null;
  }
}
