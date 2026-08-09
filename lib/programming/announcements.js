import { programming, supabase } from "../supabase/client";
import { getSpcClient, isSpcActive } from "./spcClients";

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
  { title, message, sendAt, targetType = "all", targetGroupProgramId = null, requiresReload = false },
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

// Mirrors the server-side audience resolution in
// supabase/functions/_shared/announcementAudience.ts — kept in sync by
// hand since one runs in Postgres/Deno and one in the app, same as this
// app's other client-vs-server duplicated-on-purpose logic (e.g. overlap
// checks). A member only ever needs to resolve *their own* audience
// membership, so this is a handful of narrow lookups, not a full roster
// scan like the server side does.
async function resolveMemberAudienceFlags(userId, announcementsNeedingIt) {
  const flags = { groupProgramIds: null, spcActive: null, nutritionActive: null };

  if (announcementsNeedingIt.some((a) => a.target_type === "group_program")) {
    const { data, error } = await programming
      .from("client_program_assignments")
      .select("group_program_id")
      .eq("user_id", userId);
    if (error) throw error;
    flags.groupProgramIds = (data ?? []).map((r) => r.group_program_id);
  }

  if (announcementsNeedingIt.some((a) => a.target_type === "spc")) {
    const spcClient = await getSpcClient(userId);
    flags.spcActive = isSpcActive(spcClient);
  }

  if (announcementsNeedingIt.some((a) => a.target_type === "nutrition")) {
    const { data, error } = await supabase.from("clients").select("status").eq("id", userId).maybeSingle();
    if (error) throw error;
    flags.nutritionActive = data?.status === "active";
  }

  return flags;
}

function matchesAudience(announcement, flags) {
  switch (announcement.target_type) {
    case "group_program":
      return flags.groupProgramIds?.includes(announcement.target_group_program_id) ?? false;
    case "spc":
      return Boolean(flags.spcActive);
    case "nutrition":
      return Boolean(flags.nutritionActive);
    default:
      return true;
  }
}

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
  if (unseen.length === 0) return [];

  const flags = await resolveMemberAudienceFlags(userId, unseen);
  return unseen.filter((a) => matchesAudience(a, flags));
}

export async function acknowledgeAnnouncement(announcementId, userId) {
  const { error } = await programming
    .from("announcement_acknowledgments")
    .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}
