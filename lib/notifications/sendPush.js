import { supabase } from "../supabase/client";

// On a non-2xx response, supabase-js's functions.invoke() returns
// { data: null, error: FunctionsHttpError } — it does NOT parse the JSON
// body into `data`. send-push's own error responses (missing/expired
// session, not-allowed-to-notify, etc.) carry a real message in the body,
// but reading only error.message gives the generic "Edge Function returned
// a non-2xx status code" for every failure regardless of cause. Same
// extraction register.js already does for its own Edge Function calls —
// see that file's header comment for the full explanation.
async function extractFunctionErrorMessage(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // context wasn't JSON, or was already consumed — fall through
    }
  }
  return error?.message ?? String(error);
}

export async function sendPush({ userId, title, body, data }) {
  const { data: result, error } = await supabase.functions.invoke("send-push", {
    body: { userId, title, body, data },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return result;
}

// Pushes a nutrition client's assigned coach about that client — the target
// is resolved server-side (send-push's notifyCoachOfClient branch reads
// public.clients.coach_id), so a member can only ever reach their own coach
// through this. Fire-and-forget at call sites: a push failure must never
// look like the underlying action (check-in submit etc.) failed.
export async function notifyCoachOfClient({ clientUserId, title, body, data }) {
  const { data: result, error } = await supabase.functions.invoke("send-push", {
    body: { notifyCoachOfClient: clientUserId, title, body, data },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return result;
}
