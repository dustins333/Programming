import { supabase, programming } from "../supabase/client";
import { todayInBoise, boiseInstantFrom, dateInBoise, formatTimeInBoise, addDays } from "../boiseDate";

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

// The coach side of the same concept: which clients have a check-in call on
// the calendar. Batched over the whole roster in one query rather than one
// per client (see getNutritionRoster's other reads).
//
// "Upcoming" starts at midnight Boise TODAY, not at this instant, so a call
// that happened at 9am still reads as scheduled when the coach sits down to
// review that afternoon -- which is exactly when she is looking. Rolls off
// at the next Boise midnight.
//
// Returns Map<userId, { startsAt, endsAt }> holding each client's SOONEST
// such booking. A client who rebooks has more than one row; the next one is
// the only one worth putting on a roster line.
export async function listUpcomingCheckinBookings(userIds, today = todayInBoise()) {
  if (userIds.length === 0) return new Map();
  const { data, error } = await programming
    .from("nutrition_checkin_bookings")
    .select("user_id, starts_at, ends_at")
    .in("user_id", userIds)
    .gte("starts_at", boiseInstantFrom(today, "00:00"))
    .order("starts_at", { ascending: true });
  if (error) throw error;

  const byUser = new Map();
  (data ?? []).forEach((row) => {
    // Ascending order means the first row seen for a client is the soonest.
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { startsAt: row.starts_at, endsAt: row.ends_at });
  });
  return byUser;
}

// How a booked call is written wherever it appears, so the roster line and
// the preview pane can never word the same appointment differently.
//
// Both the date and the time are resolved in Boise (formatTimeInBoise,
// dateInBoise) rather than the reading device's zone -- a coach on a laptop
// set to another timezone must still see gym time, since gym time is when
// she has to be on the call. The weekday is read off the resolved Boise
// date string at noon, never off the raw instant.
export function formatBookingWhen(startsAt, { today = todayInBoise(), long = false } = {}) {
  if (!startsAt) return "";
  const date = dateInBoise(new Date(startsAt));
  const time = formatTimeInBoise(startsAt);
  const at = long ? " at " : " ";

  if (date === today) return `Today${at}${time}`;
  if (date === addDays(today, 1)) return `Tomorrow${at}${time}`;

  const noon = new Date(`${date}T12:00:00`);
  const day = long
    ? noon.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : noon.toLocaleDateString("en-US", { weekday: "short" });
  return `${day}${at}${time}`;
}
