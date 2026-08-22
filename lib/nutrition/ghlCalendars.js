import { supabase } from "../supabase/client";

// Same extraction every supabase.functions.invoke() caller in this app
// needs (see sendPush.js's header comment) — a non-2xx response only
// carries a real message in its body, never in error.message.
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

// The gym's real GoHighLevel calendars, for the Settings -> Team picker.
// Admin-only server-side (list-ghl-calendars).
export async function listGhlCalendars() {
  const { data, error } = await supabase.functions.invoke("list-ghl-calendars");
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data.calendars ?? [];
}
