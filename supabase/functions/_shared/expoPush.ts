// Shared by send-push (one user, caller-triggered), scan-spc-alerts (many
// users, cron-triggered), and (via announcementAudience.ts) every
// announcement/reminder scan — all just need "notify this user everywhere
// they're reachable." Kept here instead of duplicated so callers can't
// drift on the actual send mechanics. As of 2026-08-07 this also delivers
// to PWA sessions via Web Push (webPush.ts) alongside the native Expo push
// below — one call site, two delivery mechanisms, so no caller needed
// updating to pick up web push.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendWebPushToUser } from "./webPush.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
) {
  const { data: tokens, error: tokensError } = await adminClient
    .schema("core")
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId);

  if (tokensError) throw tokensError;
  if (!tokens || tokens.length === 0) return { sent: 0, expoResult: null };

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

export async function sendPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  const [expo, web] = await Promise.all([
    sendExpoPushToUser(adminClient, userId, title, body, data),
    sendWebPushToUser(adminClient, userId, title, body, data).catch((err) => {
      console.error(`web push failed for user ${userId}:`, err instanceof Error ? err.message : err);
      return { sent: 0 };
    }),
  ]);

  return { sent: expo.sent + web.sent, expoResult: expo.expoResult };
}
