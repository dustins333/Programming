// Web Push (VAPID) delivery for PWA-installed sessions — the web
// counterpart to expoPush.ts's native Expo push delivery. Ported from the
// standalone Nutrition Tracker app's app/api/cron/reminders/route.js, which
// has run this exact send pattern (web-push + auto-cleanup on 404/410) in
// production since 2026-07. See CLAUDE.md's "Reuse the standalone app's Web
// Push implementation" section.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) {
    throw new Error("Missing VAPID_SUBJECT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendWebPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  ensureVapid();

  // public.push_subscriptions — shared with the standalone Nutrition
  // Tracker app (same Supabase project, same auth.users). Default schema,
  // no .schema() call needed, same as every other public.* touch point in
  // this codebase (announcementAudience.ts's "nutrition" branch, etc.).
  const { data: subs, error } = await adminClient
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0 };

  const payload = JSON.stringify({ title, body, url: typeof data.url === "string" ? data.url : "/" });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return { sent };
}
