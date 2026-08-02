// Shared by send-push (one user, caller-triggered) and scan-spc-alerts (many
// users, cron-triggered) — both just need "look up a user's tokens, hit
// Expo's push API." Kept here instead of duplicated so the two functions
// can't drift on the actual send mechanics.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  const { data: tokens, error: tokensError } = await adminClient
    .schema("core")
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId);

  if (tokensError) throw tokensError;
  if (!tokens || tokens.length === 0) return { sent: 0 };

  const messages = tokens.map((t) => ({
    to: t.expo_push_token,
    title,
    body,
    data,
  }));

  const expoResponse = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const expoResult = await expoResponse.json();

  return { sent: messages.length, expoResult };
}
