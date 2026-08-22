// Reads core.ghl_import_log — the record that a GHL new-client webhook
// arrived and what happened to it (migration 0074). Admin-only at the RLS
// level, so a coach calling any of this gets an empty list rather than an
// error.
//
// `payload` is deliberately never selected: it is GHL's raw contact body
// and can carry a phone number and address that no coach-facing screen
// shows. Only the retry Edge Function reads it, under the service role.
import { core, supabase } from "../supabase/client";

const COLUMNS =
  "id, email, name, ghl_contact_id, user_id, status, error, attempts, first_received_at, last_received_at, resolved_at, last_retried_at";

// `partial` means the account exists but has no GHL contact id, because
// that id already belonged to someone else — they cannot receive an SMS
// registration code, so it needs attention even though the import "worked".
export const NEEDS_ATTENTION = ["failed", "partial"];

export async function listGhlImportIssues() {
  const { data, error } = await core
    .from("ghl_import_log")
    .select(COLUMNS)
    .in("status", NEEDS_ATTENTION)
    .order("first_received_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listGhlImports({ limit = 100 } = {}) {
  const { data, error } = await core
    .from("ghl_import_log")
    .select(COLUMNS)
    .order("last_received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Replays the stored webhook payload through the same import the webhook
// itself runs. Returns the function's own summary so the caller can say
// what actually happened rather than just "done".
export async function retryGhlImport(logId) {
  const { data, error } = await supabase.functions.invoke("retry-ghl-import", { body: { logId } });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data;
}

export async function retryAllGhlImports() {
  const { data, error } = await supabase.functions.invoke("retry-ghl-import", { body: { all: true } });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data;
}

// supabase-js throws a FunctionsHttpError whose .message is always the same
// generic "non-2xx status code" string — the real reason is in the response
// body on .context. Same fix as clients.js / register.js / sendPush.js.
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context?.json();
    if (body?.error) return body.error;
  } catch {
    // Not JSON, or no context at all — fall through to the generic message.
  }
  return error.message ?? "Something went wrong.";
}
