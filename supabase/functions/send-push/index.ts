// Sends an Expo push notification to one user's registered devices.
// Deploy with: supabase functions deploy send-push
//
// Runs with the service-role key server-side (never shipped to the app) so
// it can read any user's core.push_tokens rows regardless of RLS. Callers
// must be the target user themselves, or staff (admin/coach) — enforced
// below, not left to the client.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";
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

  // One client authenticated as the caller (to identify who's asking),
  // one with the service role (to actually read tokens/roles past RLS).
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

  const { userId, title, body, data, notifyCoachOfClient } = await req.json();

  // notifyCoachOfClient: push a nutrition client's *assigned coach* about
  // that client (check-in submitted, onboarding ready for review). The
  // target is resolved server-side from public.clients.coach_id — a member
  // caller may only ever trigger this about themselves, so the only user a
  // member can reach through this branch is their own coach.
  if (notifyCoachOfClient) {
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title and body are required" }), { status: 400, headers: jsonHeaders });
    }
    if (notifyCoachOfClient !== caller.id) {
      const { data: callerProfile } = await adminClient
        .schema("core")
        .from("users")
        .select("role")
        .eq("id", caller.id)
        .maybeSingle();
      if (!callerProfile || !["admin", "coach"].includes(callerProfile.role)) {
        return new Response(JSON.stringify({ error: "Not allowed to notify other clients' coaches" }), { status: 403, headers: jsonHeaders });
      }
    }
    const { data: clientRow } = await adminClient.from("clients").select("coach_id").eq("id", notifyCoachOfClient).maybeSingle();
    if (!clientRow?.coach_id) {
      return new Response(JSON.stringify({ sent: 0, message: "No assigned coach for this client" }), { status: 200, headers: jsonHeaders });
    }
    try {
      const result = await sendPushToUser(adminClient, clientRow.coach_id, title, body, data ?? {});
      return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: jsonHeaders });
    }
  }

  if (!userId || !title || !body) {
    return new Response(JSON.stringify({ error: "userId, title, and body are required" }), { status: 400, headers: jsonHeaders });
  }

  if (userId !== caller.id) {
    const { data: callerProfile } = await adminClient
      .schema("core")
      .from("users")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || !["admin", "coach"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Not allowed to notify other users" }), { status: 403, headers: jsonHeaders });
    }
  }

  let result;
  try {
    result = await sendPushToUser(adminClient, userId, title, body, data ?? {});
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: jsonHeaders });
  }
  if (result.sent === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No registered devices for this user" }), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: jsonHeaders,
  });
});
