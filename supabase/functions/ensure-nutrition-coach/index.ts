// Self-service: a coach/admin's own session calls this to make sure they
// have a public.coaches row (the standalone Nutrition Tracker app's
// is_coach() RLS helper checks that table by row existence). Unlike
// invite-staff, this isn't admin-only — it's the caller provisioning
// themselves — since public.coaches has no client-side INSERT policy at all
// (only "coach can view own row" for SELECT), so a coach can never
// self-provision via a plain insert no matter which path created their
// core.users row (invite-staff, or a manual SQL role promotion like the
// test2@kovastrength.com account CLAUDE.md documents). Deploy with:
//   supabase functions deploy ensure-nutrition-coach --no-verify-jwt=false
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

  const { data: profile, error: profileError } = await adminClient
    .schema("core")
    .from("users")
    .select("name, email, role")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: jsonHeaders });
  }
  if (!profile || !["coach", "admin"].includes(profile.role)) {
    // Not staff — nothing to provision, and not an error worth surfacing to
    // the caller (AuthProvider fires this for every login, including
    // members, who should just no-op here).
    return new Response(JSON.stringify({ provisioned: false }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const { error: upsertError } = await adminClient
    .from("coaches")
    .upsert({ id: caller.id, name: profile.name, email: profile.email }, { onConflict: "id" });

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ provisioned: true }), {
    status: 200,
    headers: jsonHeaders,
  });
});
