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
import { corsHeaders } from "../_shared/cors.ts";
import { findContactIdByEmail, ghlHeaders, resolveMemberByEmail } from "../_shared/ghlContacts.ts";

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

const GHL_BASE = "https://services.leadconnectorhq.com";

function sendCodeSms(contactId: string, code: string) {
  return fetch(`${GHL_BASE}/conversations/messages`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify({
      locationId: Deno.env.get("GHL_LOCATION_ID"),
      contactId,
      type: "SMS",
      message: `Your Kova Strength verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { email } = await req.json().catch(() => ({}));
  const genericResponse = new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (!email || typeof email !== "string") {
    return new Response(JSON.stringify({ error: "email is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const user = await resolveMemberByEmail(adminClient, email);

  // Diagnostic only — never logs the code itself, just enough to tell
  // "wrong email typed" apart from "right email, GHL send failed" without
  // needing to re-trigger a real text. See CLAUDE.md/chat, 2026-08-06.
  console.log(`request-registration-code: email="${email}" matched=${Boolean(user)} hasGhlContact=${Boolean(user?.ghl_contact_id)}`);

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

  let ghlResponse = await sendCodeSms(user.ghl_contact_id, code);
  // Read each failure body exactly once — a Response body can only be
  // consumed a single time, and reading it twice throws.
  let failureBody = ghlResponse.ok ? null : await ghlResponse.text();

  // Self-heal a stale contact id (see findContactIdByEmail). Scoped to the
  // contact-not-found statuses so an auth/rate-limit failure doesn't burn a
  // lookup, and retried exactly once — never in a loop.
  if (!ghlResponse.ok && (ghlResponse.status === 400 || ghlResponse.status === 404)) {
    const healedId = await findContactIdByEmail(user.email);
    if (healedId && healedId !== user.ghl_contact_id) {
      const { error: healError } = await adminClient
        .schema("core")
        .from("users")
        .update({ ghl_contact_id: healedId })
        .eq("id", user.id);
      // ghl_contact_id is UNIQUE (migration 0026). If another member already
      // holds this id the update fails — that's ambiguous enough that we stop
      // rather than text a contact we can't confidently attribute.
      if (healError) {
        console.error("GHL contact heal: could not store repaired id:", healError.message);
      } else {
        console.log("GHL contact heal: repaired stale contact id, retrying send");
        ghlResponse = await sendCodeSms(healedId, code);
        failureBody = ghlResponse.ok ? null : await ghlResponse.text();
      }
    }
  }

  if (!ghlResponse.ok) {
    console.error("GHL send-message failed:", ghlResponse.status, failureBody);
  }

  return genericResponse;
});
