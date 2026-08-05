// Public (no caller JWT — the member has no session yet at this point in
// the flow), rate-limited: looks up a GHL-imported member by email, texts
// them a one-time code via GoHighLevel's Conversations API using their
// stored ghl_contact_id (see import-client + migration 0026) — Kova never
// stores or sees the actual phone number.
//
// Deliberately uniform responses regardless of whether the email exists,
// has a ghl_contact_id, or was just rate-limited — same email-enumeration
// reasoning as Supabase's own resetPasswordForEmail, which this app's
// reset-password.js already relies on behaving this way. Deploy with:
//   supabase functions deploy request-registration-code --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 45;

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0);
  return String(100000 + (n % 900000));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { email } = await req.json().catch(() => ({}));
  const genericResponse = new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  if (!email || typeof email !== "string") {
    return new Response(JSON.stringify({ error: "email is required" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: user } = await adminClient
    .schema("core")
    .from("users")
    .select("id, ghl_contact_id")
    .ilike("email", email)
    .maybeSingle();

  // No account, or no GHL contact to text — same generic response either
  // way, no code sent, nothing to leak.
  if (!user || !user.ghl_contact_id) {
    return genericResponse;
  }

  const { data: recent } = await adminClient
    .schema("core")
    .from("registration_codes")
    .select("id, created_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    return genericResponse;
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  // One live code at a time — clear any other unconsumed codes for this
  // user before inserting the new one.
  await adminClient.schema("core").from("registration_codes").delete().eq("user_id", user.id).is("consumed_at", null);

  const { error: insertError } = await adminClient
    .schema("core")
    .from("registration_codes")
    .insert({ user_id: user.id, code_hash: codeHash, expires_at: expiresAt });

  if (insertError) {
    console.error("Failed to store registration code:", insertError.message);
    return genericResponse;
  }

  const ghlResponse = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GHL_API_KEY")}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locationId: Deno.env.get("GHL_LOCATION_ID"),
      contactId: user.ghl_contact_id,
      type: "SMS",
      message: `Your Kova Strength verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    }),
  });

  if (!ghlResponse.ok) {
    console.error("GHL send-message failed:", ghlResponse.status, await ghlResponse.text());
  }

  return genericResponse;
});
