// Sends one announcement's push immediately — the "Send now" path from
// app/(coach)/announcements/index.js, called right after the announcement
// row is inserted (with send_at already set to now()).
// Deploy with: supabase functions deploy send-announcement
//
// JWT-authenticated, admin-only (same "manage announcements" scope as the
// RLS policy in 0024) — checked here explicitly, not left to RLS, since
// this runs with the service-role key and reads/pushes to every matching
// client regardless of RLS.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendAnnouncementPush } from "../_shared/announcementAudience.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (callerProfile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), { status: 403 });
  }

  const { announcementId } = await req.json();
  if (!announcementId) {
    return new Response(JSON.stringify({ error: "announcementId is required" }), { status: 400 });
  }

  const { data: announcement, error: fetchError } = await adminClient
    .schema("programming")
    .from("announcements")
    .select("*")
    .eq("id", announcementId)
    .maybeSingle();
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }
  if (!announcement) {
    return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
  }

  let result;
  try {
    result = await sendAnnouncementPush(adminClient, announcement);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
