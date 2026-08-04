import { core } from "../supabase/client";

// Per-user notification preferences (Settings screen) — distinct from the
// admin's gym-wide toggles in lib/settings.js, which gate whether a feature
// sends push at all. Written through a narrow security-definer RPC (see
// migration 0020) rather than a plain table update, since core.users has no
// general "user can update own row" RLS policy — that would let a member
// write any column on their own row, not just these three.
export async function updateOwnNotificationPrefs({ dailyLogReminder, checkinAvailable, coachMessages }) {
  const { error } = await core.rpc("update_own_notification_prefs", {
    p_daily_log_reminder: dailyLogReminder,
    p_checkin_available: checkinAvailable,
    p_coach_messages: coachMessages,
  });
  if (error) throw error;
}
