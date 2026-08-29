// Public (no caller JWT), pairs with request-registration-code: checks the
// hashed code (never stored in plaintext), then sets the account's
// password directly via the Admin API — there's no magic-link session to
// exchange here (unlike set-password.js's invite/recovery flow), so the
// client signs in normally with supabase.auth.signInWithPassword right
// after this returns success. Deploy with:
//   supabase functions deploy verify-registration-code --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMemberByEmail } from "../_shared/ghlContacts.ts";

const MAX_ATTEMPTS = 5;

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const { email, code, password } = await req.json().catch(() => ({}));
  if (!email || !code || !password) {
    return new Response(JSON.stringify({ error: "email, code, and password are required" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
  if (String(password).length < 8) {
    return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const invalidResponse = new Response(JSON.stringify({ error: "Invalid or expired code" }), {
    status: 400,
    headers: jsonHeaders,
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Same resolver request-registration-code uses, so an address that could
  // request a code can always verify it too.
  const user = await resolveMemberByEmail(adminClient, email);
  if (!user) return invalidResponse;

  const { data: pending } = await adminClient
    .schema("core")
    .from("registration_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return invalidResponse;
  if (pending.attempts >= MAX_ATTEMPTS) return invalidResponse;
  if (new Date(pending.expires_at).getTime() < Date.now()) return invalidResponse;

  const providedHash = await hashCode(String(code));
  if (providedHash !== pending.code_hash) {
    await adminClient
      .schema("core")
      .from("registration_codes")
      .update({ attempts: pending.attempts + 1 })
      .eq("id", pending.id);
    return invalidResponse;
  }

  const { error: consumeError } = await adminClient
    .schema("core")
    .from("registration_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pending.id);
  if (consumeError) {
    return new Response(JSON.stringify({ error: consumeError.message }), { status: 500, headers: jsonHeaders });
  }

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(user.id, { password });
  if (passwordError) {
    return new Response(JSON.stringify({ error: passwordError.message }), { status: 500, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ verified: true }), {
    status: 200,
    headers: jsonHeaders,
  });
});
