// Self-service account deletion — design_handoff_v2_settings_nutrition's
// member Settings screen "Danger zone". Also a real App Store requirement:
// Guideline 5.1.1(v) requires apps that support account creation to offer
// in-app account deletion, not just a support-email link.
//
// Deletes only the CALLER's own auth.users row, resolved from their own
// JWT (never a userId passed in the body) — the same "caller can only ever
// act on themselves" shape as ensure-nutrition-coach. auth.admin.deleteUser
// cascades through every FK that references auth.users with ON DELETE
// CASCADE (core.users, programming.logs/session_completions/etc., and the
// standalone Nutrition Tracker app's public.clients/daily_logs/photos/etc.
// — same shared-auth project noted throughout CLAUDE.md's nutrition-rebuild
// section) — this does not separately walk those tables.
//
// NOT DEPLOYED as of writing — same manual `supabase functions deploy
// delete-account` step every other Edge Function in this repo needs.
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

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(caller.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: jsonHeaders,
  });
});
