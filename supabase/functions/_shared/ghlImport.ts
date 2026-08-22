// The whole of the GHL new-client import, in one place so the webhook
// (import-client) and the admin retry (retry-ghl-import) cannot drift.
// A retry has to be the *same* import, not a second implementation of it —
// otherwise "I retried it and it worked" says nothing about the path GHL
// actually takes.
//
// Everything here runs under the service-role key. Nothing in this file
// checks a caller; both entry points do their own auth before calling in.

export type GhlImportStatus = "imported" | "partial" | "failed";

export interface GhlImportResult {
  status: GhlImportStatus;
  httpStatus: number;
  name: string | null;
  email: string | null;
  contactId: string | null;
  userId: string | null;
  profile: unknown | null;
  /** Machine-ish reason, stored on the log row. Null on a clean import. */
  error: string | null;
  /** Sentence for a human — the retry UI and the webhook response show it. */
  detail: string | null;
}

/**
 * Confirmed against a real GHL "Webhook" workflow action payload (not just
 * the synthetic contract this was originally written against):
 * name/email/phone are native top-level fields on every such payload
 * regardless of the action's own Custom Data config — only contact_id has
 * to be added there explicitly (GHL has no native top-level contactId on
 * this trigger type), landing under `customData` as a result.
 */
export function extractGhlFields(body: Record<string, any> | null) {
  const name =
    body?.name ??
    body?.full_name ??
    [body?.first_name, body?.last_name].filter(Boolean).join(" ") ??
    null;
  const email = body?.email ?? null;
  const contactId =
    body?.customData?.contact_id ??
    body?.customData?.contactId ??
    body?.contact_id ??
    body?.contactId ??
    null;
  return {
    name: name ? String(name).trim() || null : null,
    email: email ? String(email).trim() || null : null,
    contactId: contactId ? String(contactId) : null,
  };
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * One log row per person, keyed on the email — the identity import-client
 * actually resolves on. A payload with no email at all still gets a record,
 * keyed by its own hash, so a malformed webhook is visible rather than
 * silently dropped.
 */
export async function dedupeKeyFor(email: string | null, payload: unknown) {
  if (email) return email.toLowerCase();
  return `payload:${await sha256(JSON.stringify(payload ?? null))}`;
}

/**
 * Create-or-find the auth account, then land the core.users profile.
 * Never throws — every failure comes back as a `failed` result so the
 * caller can log it and answer GHL with something it will actually record.
 */
export async function runGhlImport(adminClient: any, payload: Record<string, any> | null): Promise<GhlImportResult> {
  const { name, email, contactId } = extractGhlFields(payload);

  const base = { name, email, contactId, userId: null, profile: null };

  if (!name || !email || !contactId) {
    const missing = [!name && "name", !email && "email", !contactId && "contact_id"].filter(Boolean).join(", ");
    return {
      ...base,
      status: "failed",
      httpStatus: 400,
      error: `Missing required fields: ${missing}`,
      detail: `The webhook did not carry ${missing}. Check the GHL action's Custom Data mapping.`,
    };
  }

  // This project's auth is shared with the standalone Nutrition Tracker app
  // (see CLAUDE.md) — a real number of clients already have an auth.users
  // row from that app, so create-or-find rather than treating "already
  // registered" as a hard failure. createUser (not inviteUserByEmail) — no
  // email is sent, the account stays silent until the member self-registers.
  let authUserId: string;
  const created = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });

  if (created.error) {
    // Supabase's real duplicate-email error text is "A user with this email
    // address has already been registered" — note "already been registered",
    // not "already registered". A tighter regex here missed that phrasing
    // entirely and 500'd instead of falling through, for every real client
    // who already had a standalone-app account (i.e. almost everyone in the
    // actual bulk-import case).
    const alreadyExists = /already.*registered|already exists|email_exists/i.test(created.error.message ?? "");
    if (!alreadyExists) {
      return { ...base, status: "failed", httpStatus: 500, error: created.error.message, detail: created.error.message };
    }
    const { data: existing, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return { ...base, status: "failed", httpStatus: 500, error: listError.message, detail: listError.message };
    }
    const match = existing.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) {
      const msg = "Email already registered but the matching account couldn't be found";
      return { ...base, status: "failed", httpStatus: 500, error: msg, detail: msg };
    }
    authUserId = match.id;
  } else {
    authUserId = created.data.user.id;
  }

  // Upsert on id: a brand-new import inserts a fresh member row; re-running
  // an import for the same email (a GHL automation retry, or the retry
  // endpoint) only refreshes name/email/ghl_contact_id, never role — an
  // account that has since become a coach/admin must not be downgraded.
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
    .upsert({ ...baseProfile, ghl_contact_id: contactId }, { onConflict: "id" })
    .select()
    .single();

  // core.users.ghl_contact_id is UNIQUE (0026). The upsert conflicts on `id`,
  // so a contact id already held by a DIFFERENT row raises 23505 rather than
  // resolving. That used to 500 — and GHL surfaces nothing on a non-2xx, so
  // the import looked identical to a success while leaving the worst possible
  // state behind: an auth.users row with no core.users row. Someone in that
  // state cannot register (request-registration-code looks them up in
  // core.users, finds nothing, and returns the same uniform {sent:true} it
  // returns for everyone), does not appear on the Clients list, and is
  // invisible to every screen. It reads as "the text never arrived."
  //
  // So: land a usable profile without the contact id rather than nothing at
  // all, and record it as `partial` so it shows up as needing attention.
  // Match on the SQLSTATE plus the column name, checking BOTH message and
  // details — verified against the live database, Postgres puts the column
  // name in both. Checking both because this codebase has already been bitten
  // once by matching a provider's error on the wording of a single field.
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
    return { ...base, status: "failed", httpStatus: 500, error: upsertError.message, detail: upsertError.message };
  }

  if (contactIdConflict) {
    const { data: holder } = await adminClient
      .schema("core")
      .from("users")
      .select("email")
      .eq("ghl_contact_id", contactId)
      .maybeSingle();
    const detail =
      `Imported, but GHL contact ${contactId} is already linked to ${holder?.email ?? "another account"}. ` +
      `${email} has no contact id, so SMS registration codes will not reach them until it is reassigned.`;
    return {
      name,
      email,
      contactId,
      userId: authUserId,
      profile,
      status: "partial",
      httpStatus: 200,
      error: "ghl_contact_id_conflict",
      detail,
    };
  }

  return {
    name,
    email,
    contactId,
    userId: authUserId,
    profile,
    status: "imported",
    httpStatus: 200,
    error: null,
    detail: null,
  };
}

/**
 * Write the outcome to core.ghl_import_log. Best-effort by design: a
 * logging failure must never turn a successful import into an error
 * response, or GHL would re-fire an import that actually worked.
 */
export async function recordGhlImport(
  adminClient: any,
  args: {
    dedupeKey: string;
    result: Pick<GhlImportResult, "status" | "error" | "name" | "email" | "contactId" | "userId">;
    payload: unknown;
    isRetry?: boolean;
    retriedBy?: string | null;
  },
) {
  const { error } = await adminClient.schema("core").rpc("record_ghl_import", {
    p_dedupe_key: args.dedupeKey,
    p_email: args.result.email,
    p_name: args.result.name,
    p_ghl_contact_id: args.result.contactId,
    p_user_id: args.result.userId,
    p_status: args.result.status,
    p_error: args.result.error,
    p_payload: args.payload ?? {},
    p_is_retry: args.isRetry ?? false,
    p_retried_by: args.retriedBy ?? null,
  });
  if (error) {
    console.error("ghl import log write failed", error.message, args.dedupeKey);
  }
}
