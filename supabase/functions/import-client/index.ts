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

  // Confirmed against a real GHL "Webhook" workflow action payload (not
  // just the synthetic contract this was originally written against):
  // name/email/phone/etc. are native top-level fields on every such
  // payload regardless of the action's own Custom Data config — only
  // contact_id needs to be added there explicitly (GHL has no native
  // top-level contactId field on this trigger type), landing under
  // `customData` as a result.
  const name = body?.name ?? body?.full_name ?? [body?.first_name, body?.last_name].filter(Boolean).join(" ");
  const email = body?.email;
  const contactId = body?.customData?.contact_id ?? body?.customData?.contactId ?? body?.contact_id ?? body?.contactId;

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
    // Supabase's real duplicate-email error text is "A user with this email
    // address has already been registered" — note "already been registered",
    // not "already registered". A tighter regex here missed that phrasing
    // entirely and 500'd instead of falling through to the existing-user
    // lookup below, for every real client who already had a standalone-app
    // account (i.e. almost everyone in the actual bulk-import case).
    const alreadyExists = /already.*registered|already exists|email_exists/i.test(created.error.message ?? "");
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

  const baseProfile = { id: authUserId, name, email, role: existingProfile?.role ?? "member" };

  let { data: profile, error: upsertError } = await adminClient
    .schema("core")
    .from("users")
    .upsert({ ...baseProfile, ghl_contact_id: String(contactId) }, { onConflict: "id" })
    .select()
    .single();

  // core.users.ghl_contact_id is UNIQUE (0026). The upsert conflicts on `id`,
  // so a contact id already held by a DIFFERENT row raises 23505 rather than
  // resolving. That used to 500 — and GHL surfaces nothing on a non-2xx, so
  // the import looked identical to a success while actually leaving the worst
  // possible state behind: an auth.users row with no core.users row. Someone
  // in that state cannot register (request-registration-code looks them up in
  // core.users, finds nothing, and returns the same uniform {sent:true} it
  // returns for everyone), does not appear on the Clients list, and is
  // invisible to every screen. It reads as "the text never arrived."
  //
  // So: land a usable profile without the contact id rather than nothing at
  // all, and say so in the response instead of failing silently.
  // Match on the SQLSTATE plus the column name, checking BOTH message and
  // details. Verified against the live database: Postgres returns 23505 with
  // message `duplicate key value violates unique constraint
  // "users_ghl_contact_id_key"` and detail `Key (ghl_contact_id)=(...)
  // already exists.` — the column name appears in both. Checking both because
  // this codebase has already been bitten once by matching a provider's error
  // on the exact wording of a single field (see the "already been registered"
  // regex above).
  let contactIdConflict = false;
  const conflictBlob = `${upsertError?.message ?? ""} ${(upsertError as { details?: string } | null)?.details ?? ""}`;
  if (upsertError?.code === "23505" && conflictBlob.includes("ghl_contact_id")) {
    contactIdConflict = true;
    const retry = await adminClient
      .schema("core")
      .from("users")
      .upsert(baseProfile, { onConflict: "id" })
      .select()
      .single();
    profile = retry.data;
    upsertError = retry.error;
  }

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
  }

  if (contactIdConflict) {
    // Deliberately 200, not an error status. GHL's webhook action shows
    // nothing on a non-2xx, so a 500 here is invisible; a 200 carrying a
    // warning at least lands in its log, and the account is usable.
    const { data: holder } = await adminClient
      .schema("core")
      .from("users")
      .select("email")
      .eq("ghl_contact_id", String(contactId))
      .maybeSingle();
    console.warn(
      `import-client: ghl_contact_id ${contactId} already belongs to ${holder?.email ?? "another account"}; imported ${email} without it`,
    );
    return new Response(
      JSON.stringify({
        imported: true,
        warning: "ghl_contact_id_conflict",
        detail:
          `Imported, but GHL contact ${contactId} is already linked to ${holder?.email ?? "another account"}. ` +
          `${email} has no contact id, so SMS registration codes will not reach them until it is reassigned.`,
        profile,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ imported: true, profile }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
