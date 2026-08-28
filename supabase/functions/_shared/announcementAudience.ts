// Shared by send-announcement (one announcement, staff-triggered "send
// now") and scan-announcements (cron-triggered, catches scheduled ones once
// send_at passes) — both just need "resolve who this announcement is for,
// push them, mark it pushed." Kept here so the two functions can't drift on
// audience-resolution logic, same reasoning as expoPush.ts.
//
// Mirrors lib/programming/announcements.js's client-side
// resolveMemberAudienceFlags/matchesAudience, which does the equivalent
// per-member check for the in-app popup — kept in sync by hand, same as
// this app's other client-vs-server duplicated-on-purpose logic.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "./expoPush.ts";

export interface Announcement {
  id: string;
  title: string;
  message: string;
  target_type: "all" | "group_program" | "spc" | "nutrition";
  target_group_program_id: string | null;
  // Set when this announcement is the megaphone for a published event
  // (migration 0061) — makes the push deep-link to the event itself.
  event_id?: string | null;
  // Migration 0097. Optional so a caller reading a narrower column set still
  // type-checks; undefined is treated as "push", matching the DB default.
  send_push?: boolean;
}

export async function resolveAudienceUserIds(admin: SupabaseClient, announcement: Announcement): Promise<string[]> {
  if (announcement.target_type === "group_program") {
    const { data, error } = await admin
      .schema("programming")
      .from("client_program_assignments")
      .select("user_id")
      .eq("group_program_id", announcement.target_group_program_id);
    if (error) throw error;
    return [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
  }

  if (announcement.target_type === "spc") {
    const { data, error } = await admin
      .schema("programming")
      .from("spc_clients")
      .select("user_id")
      .neq("status", "paused");
    if (error) throw error;
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }

  if (announcement.target_type === "nutrition") {
    // public.clients — the standalone Nutrition Tracker app's own table,
    // default schema, no .schema() call needed (same as ensure-nutrition-
    // coach and every other nutrition-facing function).
    const { data, error } = await admin.from("clients").select("id").eq("status", "active");
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  // "all" means everyone with a real account — members, coaches, and
  // admins alike (coaches/admins can be in-audience for the in-app popup
  // via matchesAudience's unconditional default-true, so push needs to
  // match that, not just members).
  //
  // Excluding the gym-floor TV (is_gym_display, migration 0071): it is a
  // screen on the wall, not somebody to notify. The other three branches
  // resolve through membership tables it is not in, so only this one can
  // pick it up.
  const { data, error } = await admin.schema("core").from("users").select("id").eq("is_gym_display", false);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

export async function sendAnnouncementPush(admin: SupabaseClient, announcement: Announcement) {
  // Belt and braces alongside scan-announcements' own filter: this is the
  // single function every push path goes through, so an in-app-only
  // announcement can't be pushed by any caller. Returns without stamping
  // pushed_at — nothing went out, and claiming otherwise would make the
  // coach's history lie.
  if (announcement.send_push === false) {
    return { audience: 0, pushed: 0, skipped: true };
  }

  const userIds = await resolveAudienceUserIds(admin, announcement);

  let pushed = 0;
  for (const userId of userIds) {
    // `url` stays UNPREFIXED by convention — public/sw.js opens it as a real
    // browser path (route groups are transparent in the web export), and
    // lib/notifications/PushDeepLink.js adds the (member) group back for the
    // native router.
    const result = await sendPushToUser(admin, userId, announcement.title, announcement.message, {
      type: "announcement",
      announcementId: announcement.id,
      ...(announcement.event_id ? { url: `/events/${announcement.event_id}` } : {}),
    });
    if (result.sent > 0) pushed += 1;
  }

  await admin
    .schema("programming")
    .from("announcements")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", announcement.id);

  return { audience: userIds.length, pushed };
}
