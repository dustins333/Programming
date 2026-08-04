// Receives new-client webhooks from a GoHighLevel automation and silently
// (no email sent) creates the auth.users + core.users row a client needs
// to exist in Kova at all — same "core.users can't exist without a real
// auth account" rule as everywhere else in this app. Storing GHL's own
// contactId (not a phone number) is what lets the later registration-code
// flow text the member through GHL's Conversations API without Kova ever
// holding a phone number itself — GHL stays the source of truth for the
// actual number and SMS opt-out state.
//
// Auth: shared-secret header (x-import-secret), not a caller JWT — this is
// called by GHL's automation engine, not a signed-in user. Kept as its own
// secret (GHL_IMPORT_SECRET) rather than reusing CRON_SECRET, so rotating
// one doesn't affect the other. Deploy with:
//   supabase functions deploy import-client --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const providedSecret = req.headers.get("x-import-secret");
  const expectedSecret = Deno.env.get("GHL_IMPORT_SECRET");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const name = body?.name;
  const email = body?.email;
  // Accept both casings — GHL's exact webhook field naming hasn't been
  // confirmed against a real automation yet (see CLAUDE.md), only tested
  // with a synthetic payload matching this documented contract.
  const contactId = body?.contact_id ?? body?.contactId;

  if (!name || !email || !contactId) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: name, email, contact_id", received: body }),
      { status: 400 },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // This project's auth is shared with the standalone Nutrition Tracker
  // app (see CLAUDE.md) — a real number of clients already have an
  // auth.users row from that app, so create-or-find rather than treating
  // "already registered" as a hard failure. Same fallback shape as
  // invite-staff. createUser (not inviteUserByEmail) — no email sent,
  // this account is silent until the member self-registers.
  let authUserId;
  const created = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });

  if (created.error) {
    const alreadyExists = /already registered|already exists|email_exists/i.test(created.error.message ?? "");
    if (!alreadyExists) {
      return new Response(JSON.stringify({ error: created.error.message }), { status: 500 });
    }
    const { data: existing, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), { status: 500 });
    }
    const match = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) {
      return new Response(JSON.stringify({ error: "Email already registered but the matching account couldn't be found" }), { status: 500 });
    }
    authUserId = match.id;
  } else {
    authUserId = created.data.user.id;
  }

  // Upsert on id: a brand-new import inserts a fresh member row; re-running
  // an import for the same email (e.g. a GHL automation retry) only
  // refreshes name/email/ghl_contact_id, not role — never downgrade an
  // account that's since become a coach/admin.
  const { data: existingProfile } = await adminClient
    .schema("core")
    .from("users")
    .select("role")
    .eq("id", authUserId)
    .maybeSingle();

  const { data: profile, error: upsertError } = await adminClient
    .schema("core")
    .from("users")
    .upsert(
      { id: authUserId, name, email, role: existingProfile?.role ?? "member", ghl_contact_id: String(contactId) },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ imported: true, profile }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
