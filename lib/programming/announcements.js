import { programming, supabase } from "../supabase/client";
import { filterToAudience } from "./audience";

// Coach compose/history — admin-only (see 0024's RLS), newest first.
export async function listAnnouncements() {
  const { data, error } = await programming
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAnnouncement(
  {
    title,
    message,
    sendAt,
    targetType = "all",
    targetGroupProgramId = null,
    requiresReload = false,
    imagePath = null,
    // null means "never expires" — every announcement written before
    // migration 0072 is null, so nothing that already exists changes.
    expiresAt = null,
    // Set when this announcement is the megaphone for a published event —
    // the popup then offers "View details" straight through to it.
    eventId = null,
    // The two delivery channels, independent (migration 0097). Both default
    // true, which is the single-channel behaviour every caller had before.
    // Creating a row with both false has no effect on anyone — don't.
    showInApp = true,
    sendPush = true,
  },
  createdBy
) {
  const trimmedTitle = String(title || "").trim();
  const trimmedMessage = String(message || "").trim();
  if (!trimmedTitle) throw new Error("Title is required");
  if (!trimmedMessage) throw new Error("Message is required");

  const { data, error } = await programming
    .from("announcements")
    .insert({
      title: trimmedTitle,
      message: trimmedMessage,
      send_at: sendAt ?? new Date().toISOString(),
      target_type: targetType,
      target_group_program_id: targetType === "group_program" ? targetGroupProgramId : null,
      requires_reload: requiresReload,
      image_path: imagePath,
      expires_at: expiresAt,
      event_id: eventId,
      show_in_app: showInApp,
      send_push: sendPush,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAnnouncement(id) {
  const { error } = await programming.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

// The most recent announcement made for this event, or null. Two jobs: it
// defaults both channel checkboxes off on a re-publish (so taking an event
// down and putting it back doesn't notify everyone twice), and it's what
// lets the editor state which channels are actually queued once the
// checkboxes themselves are gone.
//
// Read as a row rather than counted, and read here rather than off
// events.pushed_at, which only ever records a real push and so says nothing
// about an in-app-only or still-scheduled announcement.
export async function getLatestAnnouncementForEvent(eventId) {
  const { data, error } = await programming
    .from("announcements")
    .select("id, send_at, pushed_at, show_in_app, send_push")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Cancelling a scheduled event has to cancel the announcement queued to go
// out with it, or scan-announcements would still push people at an event
// they can no longer open. Scoped to pushed_at is null on purpose: an
// announcement that already went out is history, not something to erase.
export async function deletePendingAnnouncementsForEvent(eventId) {
  const { error } = await programming
    .from("announcements")
    .delete()
    .eq("event_id", eventId)
    .is("pushed_at", null);
  if (error) throw error;
}

// Fires the real push immediately (staff-authenticated Edge Function) —
// used right after createAnnouncement() when the coach picked "Send now".
// A scheduled announcement doesn't call this; scan-announcements' cron scan
// picks it up once send_at passes instead. No-ops gracefully (still
// resolves) if push infra isn't fully live yet — see the function's own
// deploy notes.
export async function pushAnnouncementNow(announcementId) {
  const { data, error } = await supabase.functions.invoke("send-announcement", {
    body: { announcementId },
  });
  if (error) throw error;
  return data;
}

// --- Member-side: due, unseen, audience-matched announcements ---
//
// Audience resolution lives in ./audience.js — shared with events, which
// uses the identical target_type shape.

// Oldest-due-first unseen announcements for this member, filtered to ones
// whose audience they're actually in. Returns a queue (usually 0 or 1 item)
// rather than a single row, matching the milestone congrats-popup pattern —
// AnnouncementModal shows them one at a time.
//
// memberSince (the user's core.users.created_at) excludes anything sent
// before this member's account existed — without it, a brand-new member
// (or one just linked/reactivated) would see every announcement ever sent
// to the gym replayed as a popup queue, not just ones from after they
// joined.
export async function listDueUnseenAnnouncementsForUser(userId, memberSince) {
  let query = programming
    .from("announcements")
    .select("*")
    // Mirrors the RLS gate rather than relying on it alone, same as the
    // send_at filter beside it — a push-only announcement is not a popup.
    .eq("show_in_app", true)
    .lte("send_at", new Date().toISOString())
    .order("send_at");
  if (memberSince) query = query.gte("send_at", memberSince);
  const { data: due, error: dueError } = await query;
  if (dueError) throw dueError;
  if (!due || due.length === 0) return [];

  const { data: acks, error: ackError } = await programming
    .from("announcement_acknowledgments")
    .select("announcement_id")
    .eq("user_id", userId);
  if (ackError) throw ackError;
  const seenIds = new Set((acks ?? []).map((a) => a.announcement_id));

  const unseen = due.filter((a) => !seenIds.has(a.id));
  return filterToAudience(userId, unseen);
}

export async function acknowledgeAnnouncement(announcementId, userId) {
  const { error } = await programming
    .from("announcement_acknowledgments")
    .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}
