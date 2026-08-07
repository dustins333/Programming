import { programming } from "../supabase/client";

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
