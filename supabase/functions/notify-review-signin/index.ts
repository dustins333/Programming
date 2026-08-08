// REVIEW_SIGNIN_SECRET-authenticated — its own dedicated secret (same
// precedent as GHL_IMPORT_SECRET being separate from CRON_SECRET) rather
// than reusing CRON_SECRET, since the CLI can only set secrets, not read
// an already-set one back to embed in the trigger's SQL below. Called by
// a Postgres trigger on
// auth.users (see migration 0035_review_signin_notify.sql) whenever
// review@kovastrength.com's last_sign_in_at changes — i.e. every time
// Apple's App Review account actually signs into the app. Texts Terra via
// GHL's Conversations API, the same call request-registration-code already
// makes, using her own GHL contact id — hardcoded, since this is a single
// personal notification, not a general-purpose feature.
// Deploy with: supabase functions deploy notify-review-signin --no-verify-jwt
import { corsHeaders } from "../_shared/cors.ts";

const TERRA_GHL_CONTACT_ID = "Y5bLtvYia5p7cF86alWt";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const triggerSecret = req.headers.get("x-trigger-secret");
  if (triggerSecret !== Deno.env.get("REVIEW_SIGNIN_SECRET")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { signed_in_at } = await req.json().catch(() => ({}));
  const when = signed_in_at
    ? new Date(signed_in_at).toLocaleString("en-US", { timeZone: "America/Boise" })
    : "just now";

  const ghlResponse = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GHL_API_KEY")}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locationId: Deno.env.get("GHL_LOCATION_ID"),
      contactId: TERRA_GHL_CONTACT_ID,
      type: "SMS",
      message: `Kova alert: Apple's App Review account just signed in (${when}).`,
    }),
  });

  if (!ghlResponse.ok) {
    console.error("notify-review-signin: GHL send failed", ghlResponse.status, await ghlResponse.text());
    return new Response("GHL send failed", { status: 502, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
