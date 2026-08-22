// Which GHL calendar a given member's nutrition check-in call books onto.
//
// Shared by get-checkin-booking-slots and book-checkin-session so the slots
// a member is offered and the appointment that actually gets created can
// never come from two different calendars -- the one failure mode here that
// would be invisible until somebody showed up to an empty Zoom room.
//
// Resolution order:
//   1. the member's assigned nutrition coach's own core.users.ghl_calendar_id
//   2. the gym-wide core.settings.nutrition_checkin_calendar_id
// Falls through to (2) whenever the member has no coach assigned
// (public.clients.coach_id is nullable, see 0033) or that coach has not had
// a calendar picked yet in Settings -> Team.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function resolveCheckinCalendarId(adminClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data: client } = await adminClient.from("clients").select("coach_id").eq("id", userId).maybeSingle();

  if (client?.coach_id) {
    const { data: coach } = await adminClient
      .schema("core")
      .from("users")
      .select("ghl_calendar_id")
      .eq("id", client.coach_id)
      .maybeSingle();
    if (coach?.ghl_calendar_id) return coach.ghl_calendar_id;
  }

  const { data: setting } = await adminClient
    .schema("core")
    .from("settings")
    .select("value")
    .eq("key", "nutrition_checkin_calendar_id")
    .maybeSingle();

  // value is jsonb holding a plain JSON string for scalar settings, which
  // supabase-js hands back already parsed.
  return typeof setting?.value === "string" && setting.value ? setting.value : null;
}
