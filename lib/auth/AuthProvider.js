import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase, core } from "../supabase/client";

const AuthContext = createContext(null);

const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fire-and-forget: makes sure a coach/admin has a public.coaches row (the
// standalone Nutrition Tracker app's is_coach() RLS check looks for one —
// Kova's nutrition module reads/writes that app's live public.* tables, see
// CLAUDE.md's nutrition-rebuild section). Cheap idempotent upsert server-
// side; never blocks render, and members no-op harmlessly on the server.
function ensureNutritionCoach(role) {
  if (role !== "coach" && role !== "admin") return;
  supabase.functions.invoke("ensure-nutrition-coach").catch((error) => {
    console.error("ensure-nutrition-coach failed:", error);
  });
}

// Superseded by migration 0022 — see core.get_login_activity, which reads
// auth.users.last_sign_in_at directly instead of a custom-stamped column.
// A brand-new column has no history: it only reflects reality from the
// moment it's added forward, so real already-active clients (confirmed
// against real data) showed as "Never signed in" simply because they hadn't
// force-reopened the app since the migration ran — indistinguishable from
// someone who's genuinely never signed in, which defeated the entire point.
// auth.users has tracked last_sign_in_at natively since every account was
// created, with no gap, so that's the correct source of truth instead.

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  // Set only when the retry-exhausted fetch itself failed (network/5xx) —
  // distinct from "fetch succeeded, no row exists". pending-setup.js uses
  // this to tell a real "not set up yet" account apart from "we couldn't
  // even check," which needs a retry affordance, not just Sign Out.
  const [profileError, setProfileError] = useState(null);
  // Every background token refresh (roughly hourly) re-runs loadProfile, and
  // more than one call can be in flight at once (e.g. the initial
  // getSession() call and an onAuthStateChange INITIAL_SESSION event landing
  // close together). profileRequestId lets a call recognize when a newer
  // call has since started and bail out instead of clobbering fresher state
  // with a stale result. hasLoadedProfile tracks whether we've ever
  // successfully loaded a profile for the current session, so a transient
  // fetch error doesn't wipe out a profile that was already loaded.
  const profileRequestId = useRef(0);
  const hasLoadedProfile = useRef(false);

  const loadProfile = useCallback(async (currentSession) => {
    const requestId = ++profileRequestId.current;

    if (!currentSession?.user) {
      hasLoadedProfile.current = false;
      setProfile(null);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    let data = null;
    let error = null;
    // A bare network blip during a background refresh shouldn't be
    // indistinguishable from "this account genuinely has no profile" — retry
    // a couple of times before treating it as a real failure. Real "no
    // profile row" is data: null / error: null from .maybeSingle(), a
    // different case handled below, so this loop only ever retries actual
    // errors (network, transient 5xx, etc.).
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ data, error } = await core
        .from("users")
        .select("id, name, email, role, phone, created_at, can_view_spc, can_view_nutrition, can_view_exercise_library, can_log_ops_hours, notify_daily_log_reminder, notify_checkin_available, notify_coach_messages")
        .eq("id", currentSession.user.id)
        .maybeSingle());

      if (!error) break;
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }

    if (requestId !== profileRequestId.current) return; // superseded by a newer call

    if (error) {
      console.error("Failed to load core.users profile after retries:", error);
      // Don't clear an already-loaded profile over a transient error — stale
      // (but correct) profile data beats bouncing the user to the
      // pending-setup screen, which reads exactly like being signed out.
      if (!hasLoadedProfile.current) {
        setProfile(null);
        setProfileError(error.message ?? String(error));
      }
      setProfileLoading(false);
      return;
    }

    if (data) {
      hasLoadedProfile.current = true;
      setProfile(data);
      setProfileLoading(false);
      ensureNutritionCoach(data.role);
      return;
    }

    // No core.users row yet. Only the bootstrap admin email is allowed to
    // self-insert (see the RLS policy in 0001_core_users_settings.sql) —
    // anyone else with no profile is a stuck invite state a real admin
    // needs to resolve, not something the app should quietly work around.
    if (currentSession.user.email === ADMIN_EMAIL) {
      const { data: created, error: insertError } = await core
        .from("users")
        .insert({
          id: currentSession.user.id,
          name: "Admin",
          email: currentSession.user.email,
          role: "admin",
        })
        .select("id, name, email, role, phone, created_at, can_view_spc, can_view_nutrition, can_view_exercise_library, can_log_ops_hours, notify_daily_log_reminder, notify_checkin_available, notify_coach_messages")
        .single();

      if (requestId !== profileRequestId.current) return; // superseded by a newer call

      if (insertError) {
        console.error("Admin bootstrap insert failed:", insertError);
        setProfile(null);
      } else {
        hasLoadedProfile.current = true;
        setProfile(created);
        ensureNutritionCoach(created.role);
      }
    } else {
      setProfile(null);
    }
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession ?? null);
      loadProfile(initialSession ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // scope: "local" signs out only this device. supabase-js defaults to "global",
  // which revokes every refresh token for the account everywhere — so one person
  // tapping Sign out would bounce the same account off every other device (and out
  // of the standalone Nutrition Tracker app, which shares this auth.users table)
  // the next time their token refreshed.
  const signOut = useCallback(() => supabase.auth.signOut({ scope: "local" }), []);
  const retryProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const value = {
    session,
    profile,
    profileError,
    retryProfile,
    // "ready" means we've resolved both the session AND (if a session
    // exists) the profile fetch — callers redirecting on role should wait
    // for this rather than acting on a still-loading profile. Once a
    // profile has been loaded successfully at least once, a background
    // refresh's profileLoading flip no longer flips this back to false —
    // without that, every ~hourly token refresh (and on native, every
    // foreground per client.js's AppState-triggered refresh) unmounted the
    // whole navigation tree back to a spinner mid-session.
    ready: session !== undefined && (!session || !profileLoading || hasLoadedProfile.current),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
