// Admin-only: invites a new coach/admin account. Deploy with:
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
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
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
  }

  const { data: callerProfile } = await adminClient
    .schema("core")
    .from("users")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only an admin can add staff accounts" }), { status: 403 });
  }

  const { name, email, role } = await req.json();
  if (!name || !email || !["coach", "admin"].includes(role)) {
    return new Response(
      JSON.stringify({ error: "name, email, and role ('coach' or 'admin') are required" }),
      { status: 400 }
    );
  }

  // This Supabase project's auth is shared with the separate Nutrition
  // Tracker app, so the email may already have an auth.users row (e.g.
  // someone who's a Nutrition Tracker client being promoted to coach here)
  // — inviteUserByEmail errors on a duplicate, so fall back to finding the
  // existing user rather than treating that as a hard failure.
  let authUserId;
  const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: "kovastrength://set-password",
  });

  if (invite.error) {
    const alreadyExists = /already registered|already exists|email_exists/i.test(invite.error.message ?? "");
    if (!alreadyExists) {
      return new Response(JSON.stringify({ error: invite.error.message }), { status: 500 });
    }
    const { data: existing, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), { status: 500 });
    }
    const match = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) {
      return new Response(JSON.stringify({ error: "Email already registered but the matching account couldn't be found" }), { status: 500 });
    }
    authUserId = match.id;
  } else {
    authUserId = invite.data.user.id;
  }

  // Upsert on id: a brand-new invite inserts a fresh row (permission
  // columns fall back to their table defaults, all true); promoting an
  // existing profile (e.g. an already-linked member) only touches
  // name/email/role, leaving that row's existing permission flags alone
  // since they're not part of this payload.
  const { data: profile, error: upsertError } = await adminClient
    .schema("core")
    .from("users")
    .upsert({ id: authUserId, name, email, role }, { onConflict: "id" })
    .select()
    .single();

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
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
      return new Response(JSON.stringify({ error: coachUpsertError.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ profile }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
