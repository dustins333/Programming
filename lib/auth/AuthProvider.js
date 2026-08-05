import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, core } from "../supabase/client";

const AuthContext = createContext(null);

const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL;

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

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    const { data, error } = await core
      .from("users")
      .select("id, name, email, role, phone, created_at, can_view_spc, can_view_nutrition, can_view_exercise_library, notify_daily_log_reminder, notify_checkin_available, notify_coach_messages")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    if (error) {
      // RLS legitimately blocks this only if the row doesn't belong to the
      // caller, which can't happen for an eq(id, own uid) query — any error
      // here is a real problem (network, schema not exposed yet, etc.), not
      // an expected "no profile" case, so surface it rather than swallow it.
      console.error("Failed to load core.users profile:", error);
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    if (data) {
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
        .select("id, name, email, role, phone, created_at, can_view_spc, can_view_nutrition, can_view_exercise_library, notify_daily_log_reminder, notify_checkin_available, notify_coach_messages")
        .single();

      if (insertError) {
        console.error("Admin bootstrap insert failed:", insertError);
        setProfile(null);
      } else {
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

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  const value = {
    session,
    profile,
    // "ready" means we've resolved both the session AND (if a session
    // exists) the profile fetch — callers redirecting on role should wait
    // for this rather than acting on a still-loading profile.
    ready: session !== undefined && (!session || !profileLoading),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
