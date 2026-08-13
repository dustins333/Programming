// Admin-only: adds a coach/admin account — either promoting an account
// that already exists (a member being upgraded, or anyone with a login
// from the shared Nutrition Tracker auth project) or, only when the email
// is genuinely new to the project, inviting one by email. Deploy with:
//   supabase functions deploy invite-staff
//
// Runs with the service-role key server-side so it can call the Auth Admin
// API (auth.admin.inviteUserByEmail) — not something the client app can do
// directly, same reason send-push needs the service role to read
// core.push_tokens past RLS. Caller must already be an admin themselves;
// enforced below, not left to RLS (core.users' "admin can manage users"
// insert policy would let this through anyway, but the auth-user-creation
// half has no RLS equivalent at all, so the check has to live here).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: jsonHeaders });
  }

  const { data: callerProfile } = await adminClient
    .schema("core")
    .from("users")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only an admin can add staff accounts" }), { status: 403, headers: jsonHeaders });
  }

  const { name, email, role, existingUserId, permissions } = await req.json();
  if (!name || !email || !["coach", "admin"].includes(role)) {
    return new Response(
      JSON.stringify({ error: "name, email, and role ('coach' or 'admin') are required" }),
      { status: 400, headers: jsonHeaders }
    );
  }

  // Module access is always set explicitly by the admin adding the account
  // — no column falls back to its table default here. 0015's defaults
  // (SPC/Nutrition/Library on) exist so pre-0015 rows kept working, but a
  // brand-new coach silently starting with three modules on isn't what an
  // admin choosing their access expects.
  const PERMISSION_FIELDS = [
    "can_view_spc",
    "can_view_nutrition",
    "can_view_exercise_library",
    "can_log_ops_hours",
  ];
  const permissionPatch: Record<string, boolean> = {};
  for (const field of PERMISSION_FIELDS) {
    permissionPatch[field] = permissions?.[field] === true;
  }

  // Whether this account already exists decides whether anyone gets emailed.
  // Two ways we can know: the admin picked a real client out of the search
  // (existingUserId), or the email turns out to already have an auth.users
  // row — this project's auth is shared with the standalone Nutrition
  // Tracker app, so that's common. Either way the person already has a
  // working login and a set-your-password email would just be confusing.
  let authUserId = existingUserId ?? null;
  let invited = false;

  if (!authUserId) {
    const { data: existing, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: jsonHeaders });
    }
    const match = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) authUserId = match.id;
  }

  if (!authUserId) {
    // Genuinely new to the whole project — they have no password, so this
    // is the one path where an invite email is the right thing to send.
    const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://app.kovastrength.com/set-password",
    });
    if (invite.error) {
      // See import-client's identical fix: Supabase's real duplicate-email
      // error text is "already been registered", not "already registered".
      // Only reachable if an account appeared between the lookup above and
      // here, or sat past listUsers' first 1000 rows.
      const alreadyExists = /already.*registered|already exists|email_exists/i.test(invite.error.message ?? "");
      if (!alreadyExists) {
        return new Response(JSON.stringify({ error: invite.error.message }), { status: 500, headers: jsonHeaders });
      }
      return new Response(
        JSON.stringify({ error: "That email already has an account, but it couldn't be found. Search for them under \"Existing client\" instead." }),
        { status: 409, headers: jsonHeaders }
      );
    }
    authUserId = invite.data.user.id;
    invited = true;
  }

  // Upsert on id: inserts a fresh row for a brand-new invite, or promotes
  // an existing profile (member → coach) in place, keeping the same login.
  // Permission columns are always part of the payload, so a promoted
  // account's old flags are replaced by whatever the admin just chose
  // rather than surviving underneath the new role.
  const { data: profile, error: upsertError } = await adminClient
    .schema("core")
    .from("users")
    .upsert({ id: authUserId, name, email, role, ...permissionPatch }, { onConflict: "id" })
    .select()
    .single();

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500, headers: jsonHeaders });
  }

  // Also keep public.coaches in sync — that's the table the standalone
  // Nutrition Tracker app's is_coach() RLS helper checks (Kova's nutrition
  // module reads/writes the same live public.* tables that app uses). A
  // fresh coach/admin needs a row there before they can manage any nutrition
  // client; ensure-nutrition-coach covers the same gap for accounts that
  // never went through this function (e.g. a role promoted via raw SQL).
  if (["coach", "admin"].includes(role)) {
    const { error: coachUpsertError } = await adminClient
      .from("coaches")
      .upsert({ id: authUserId, name, email }, { onConflict: "id" });
    if (coachUpsertError) {
      return new Response(JSON.stringify({ error: coachUpsertError.message }), { status: 500, headers: jsonHeaders });
    }
  }

  // `invited` tells the app whether an email actually went out, so it can
  // say "Invited X" vs "X is now a coach" honestly instead of guessing.
  return new Response(JSON.stringify({ profile, invited }), {
    status: 200,
    headers: jsonHeaders,
  });
});
