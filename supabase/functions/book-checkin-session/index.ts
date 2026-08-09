// Books a real appointment on Terra's GHL "Nutrition Check In" calendar for
// the calling member, using their stored ghl_contact_id (see import-client +
// migration 0026 — Kova never stores a phone number, only the GHL contact
// id). Called right after a member picks a slot from
// get-checkin-booking-slots. JWT-verified (default deploy), same auth
// pattern as ensure-nutrition-coach.
//
// Deploy with: supabase functions deploy book-checkin-session
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const CALENDAR_ID = "t7fAF1sImGuso1im6UR6";
const GHL_VERSION = "2021-04-15";

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

  const { startTime } = await req.json().catch(() => ({}));
  if (!startTime || typeof startTime !== "string") {
    return new Response(JSON.stringify({ error: "startTime is required" }), { status: 400, headers: jsonHeaders });
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

  const { data: profile } = await adminClient.schema("core").from("users").select("ghl_contact_id").eq("id", caller.id).maybeSingle();
  if (!profile?.ghl_contact_id) {
    return new Response(JSON.stringify({ error: "We can't find your scheduling contact yet — ask your coach to book this one for you." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const apiKey = Deno.env.get("GHL_API_KEY");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!apiKey || !locationId) {
    return new Response(JSON.stringify({ error: "Scheduling isn't configured yet — ask your coach to book this for you." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  // Slot duration comes from the calendar itself rather than being
  // hardcoded here, so a future change to the calendar's own slot length
  // (Settings -> GHL, outside this app) doesn't silently desync endTime.
  let slotDurationMinutes = 30;
  try {
    const calResp = await fetch(`https://services.leadconnectorhq.com/calendars/${CALENDAR_ID}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
    });
    if (calResp.ok) {
      const calBody = await calResp.json();
      if (calBody?.calendar?.slotDuration) slotDurationMinutes = calBody.calendar.slotDuration;
    }
  } catch (err) {
    console.error("Failed to read calendar slot duration, defaulting to 30min:", err);
  }

  const endTime = new Date(new Date(startTime).getTime() + slotDurationMinutes * 60 * 1000).toISOString();

  const bookResp = await fetch("https://services.leadconnectorhq.com/calendars/events/appointments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      calendarId: CALENDAR_ID,
      locationId,
      contactId: profile.ghl_contact_id,
      startTime,
      endTime,
      appointmentStatus: "confirmed",
    }),
  });

  const bookBody = await bookResp.text();
  if (!bookResp.ok) {
    console.error("GHL create-appointment failed:", bookResp.status, bookBody);
    // A slot someone else just took is the one failure worth naming
    // specifically -- everything else collapses to a generic retry message.
    const alreadyTaken = bookResp.status === 422 || /slot|unavailable|conflict/i.test(bookBody);
    return new Response(
      JSON.stringify({
        error: alreadyTaken
          ? "That time was just taken — pick another one."
          : "Couldn't book that time right now — try again in a bit.",
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  return new Response(JSON.stringify({ booked: true }), { status: 200, headers: jsonHeaders });
});
