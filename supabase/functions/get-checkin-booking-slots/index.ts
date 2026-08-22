// Called by a member's own session right after they answer "Zoom" on their
// weekly check-in (see the booking_option column, migration 0042) — returns
// real open slots on their OWN coach's GHL calendar so the app can render a
// picker instead of the member having to text anyone directly. Which
// calendar that is comes from resolveCheckinCalendarId (0077); it used to
// be one hardcoded id, which meant every client booked onto Terra's
// availability no matter who actually coached them.
// JWT-verified (default supabase functions deploy, no --no-verify-jwt) since
// this is a normal logged-in-member action, same auth pattern as
// ensure-nutrition-coach.
//
// Deploy with: supabase functions deploy get-checkin-booking-slots
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveCheckinCalendarId } from "../_shared/checkinCalendar.ts";

const DAYS_AHEAD = 14;
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

  const apiKey = Deno.env.get("GHL_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Scheduling isn't configured yet — ask your coach to book this for you." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const calendarId = await resolveCheckinCalendarId(adminClient, caller.id);
  if (!calendarId) {
    return new Response(JSON.stringify({ error: "Scheduling isn't set up yet — ask your coach to book this for you." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const startMs = Date.now();
  const endMs = startMs + DAYS_AHEAD * 24 * 60 * 60 * 1000;

  const slotsResp = await fetch(
    `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startMs}&endDate=${endMs}&timezone=America%2FBoise`,
    { headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION } }
  );

  if (!slotsResp.ok) {
    const body = await slotsResp.text();
    console.error("GHL free-slots failed:", slotsResp.status, body);
    return new Response(JSON.stringify({ error: "Couldn't load open times right now — try again in a bit." }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  const slotsBody = await slotsResp.json();
  // Response shape: { "<date>": { slots: [isoString, ...] }, traceId }. Flatten
  // into a single sorted list of {date, slots} the client can render directly.
  const days = Object.entries(slotsBody)
    .filter(([key]) => key !== "traceId")
    .map(([date, value]) => ({ date, slots: (value as { slots?: string[] })?.slots ?? [] }))
    .filter((d) => d.slots.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return new Response(JSON.stringify({ days }), { status: 200, headers: jsonHeaders });
});
