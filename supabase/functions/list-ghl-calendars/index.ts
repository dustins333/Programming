// Admin-only: lists the gym's real GoHighLevel calendars so Settings -> Team
// can offer a dropdown instead of asking an admin to paste a 20-character
// opaque id (t7fAF1sImGuso1im6UR6) by hand. A typo in a hand-typed id fails
// silently -- the member just gets "couldn't load open times" -- so picking
// from the real list is the difference between a wrong calendar being
// impossible and being undetectable.
//
// Admin-only rather than staff-only: the calendar a coach's clients book
// onto is gym infrastructure, edited from Settings -> Team, which is itself
// admin-only. Enforced here rather than left to RLS, same as invite-staff --
// there's no Kova table involved at all, so RLS has nothing to gate.
//
// Deploy with: supabase functions deploy list-ghl-calendars
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GHL_VERSION = "2021-04-15";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: jsonHeaders });
  }

  const { data: callerProfile } = await adminClient.schema("core").from("users").select("role").eq("id", caller.id).maybeSingle();
  if (callerProfile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only an admin can change scheduling calendars" }), { status: 403, headers: jsonHeaders });
  }

  const apiKey = Deno.env.get("GHL_API_KEY");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!apiKey || !locationId) {
    return new Response(JSON.stringify({ error: "The GoHighLevel connection isn't configured yet." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const resp = await fetch(`https://services.leadconnectorhq.com/calendars/?locationId=${locationId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error("GHL list-calendars failed:", resp.status, body);
    // A missing scope on the integration token is the one failure worth
    // naming -- it's fixed in GHL, not by retrying.
    const scope = resp.status === 401 && /scope/i.test(body);
    return new Response(
      JSON.stringify({
        error: scope
          ? "GoHighLevel refused the request — the integration token needs calendar read access."
          : "Couldn't load calendars from GoHighLevel right now — try again in a bit.",
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  const body = await resp.json();
  const calendars = (body?.calendars ?? [])
    .filter((c: { id?: string; name?: string }) => c?.id && c?.name)
    .map((c: { id: string; name: string; calendarType?: string }) => ({
      id: c.id,
      name: c.name,
      type: c.calendarType ?? null,
    }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  return new Response(JSON.stringify({ calendars }), { status: 200, headers: jsonHeaders });
});
