import { supabase } from "../supabase/client";

// Same extraction supabase.functions.invoke()'s callers need everywhere
// else in this app (see sendPush.js's header comment) — a non-2xx response
// only carries a real message in the body, not in error.message.
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

export async function getCheckinBookingSlots() {
  const { data, error } = await supabase.functions.invoke("get-checkin-booking-slots");
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data.days ?? [];
}

export async function bookCheckinSession(startTime) {
  const { data, error } = await supabase.functions.invoke("book-checkin-session", { body: { startTime } });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data;
}
