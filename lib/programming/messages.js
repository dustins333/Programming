import { core, programming } from "../supabase/client";

// One flat thread per client (migration 0032) — any coach can read/reply
// to any client's thread (RLS is staff-wide, matching this app's
// "all coaches see all clients" design), and a member reads/writes only
// their own.
export async function listMessages(userId) {
  const { data, error } = await programming
    .from("client_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMemberMessage(userId, body) {
  const { error } = await programming
    .from("client_messages")
    .insert({ user_id: userId, sender_id: userId, sender_role: "member", body });
  if (error) throw error;
}

export async function sendStaffMessage(userId, senderId, body) {
  const { error } = await programming
    .from("client_messages")
    .insert({ user_id: userId, sender_id: senderId, sender_role: "staff", body });
  if (error) throw error;
}

// Coach inbox summary (migration 0034) — one row per client with any
// message history, sorted by most-recent activity. Client-side reduction
// over the full message set (same "fetch everything, group in JS" pattern
// as listDayTimeline elsewhere in this app) rather than a DISTINCT ON,
// since supabase-js's query builder doesn't expose that.
export async function listThreadSummaries() {
  const { data: messages, error } = await programming
    .from("client_messages")
    .select("user_id, sender_role, body, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!messages || messages.length === 0) return [];

  const latestByUser = new Map();
  for (const m of messages) {
    if (!latestByUser.has(m.user_id)) latestByUser.set(m.user_id, m);
  }
  const userIds = [...latestByUser.keys()];

  const [{ data: users, error: usersError }, { data: reads, error: readsError }] = await Promise.all([
    core.from("users").select("id, name").in("id", userIds),
    programming.from("client_message_reads").select("user_id, last_read_by_staff_at").in("user_id", userIds),
  ]);
  if (usersError) throw usersError;
  if (readsError) throw readsError;

  const nameById = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));
  const lastReadByStaffById = Object.fromEntries((reads ?? []).map((r) => [r.user_id, r.last_read_by_staff_at]));

  return userIds
    .map((userId) => {
      const last = latestByUser.get(userId);
      const lastReadByStaffAt = lastReadByStaffById[userId] ?? null;
      // "Unread" is a reasonable simplification (the most recent thing
      // needs my attention, not full per-message history) — same kind of
      // simplification this app already leans on elsewhere (e.g.
      // listDayTimeline's combined session/set counts).
      return {
        userId,
        clientName: nameById[userId] ?? "Unknown",
        lastMessage: last.body,
        lastMessageAt: last.created_at,
        lastSenderRole: last.sender_role,
        unread: last.sender_role === "member" && (!lastReadByStaffAt || last.created_at > lastReadByStaffAt),
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

export async function markThreadReadByStaff(userId) {
  const { error } = await programming
    .from("client_message_reads")
    .upsert({ user_id: userId, last_read_by_staff_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function markThreadUnreadByStaff(userId) {
  const { error } = await programming
    .from("client_message_reads")
    .upsert({ user_id: userId, last_read_by_staff_at: null }, { onConflict: "user_id" });
  if (error) throw error;
}

// Member self-service — goes through the narrow security-definer RPC
// (mark_own_thread_read, migration 0034) since RLS can't restrict which
// single column a plain update touches, and a member must never be able to
// write last_read_by_staff_at.
export async function markThreadReadByMember() {
  const { error } = await programming.rpc("mark_own_thread_read");
  if (error) throw error;
}

// Member-side unread check for My Week's chat-bubble icon — true only when
// the thread's latest message is staff-authored and newer than this
// member's own last read timestamp.
export async function hasUnreadMessages(userId) {
  const [{ data: lastMessage, error: msgError }, { data: readRow, error: readError }] = await Promise.all([
    programming
      .from("client_messages")
      .select("sender_role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    programming.from("client_message_reads").select("last_read_by_member_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (msgError) throw msgError;
  if (readError) throw readError;
  if (!lastMessage || lastMessage.sender_role !== "staff") return false;
  const lastReadAt = readRow?.last_read_by_member_at ?? null;
  return !lastReadAt || lastMessage.created_at > lastReadAt;
}
