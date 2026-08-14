import { useEffect, useState, useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { listDueUnseenAnnouncementsForUser, acknowledgeAnnouncement } from "../programming/announcements";
import { AnnouncementModal } from "../../components/AnnouncementModal";

// Mounted once in app/(member)/_layout.js (both real members and staff
// using "My Training" land there) — checks for due-and-unseen gym-wide
// announcements on load and surfaces them as a popup, oldest first, one at
// a time. Split out the same way PushRegistrar is split out of
// AuthProvider: this is a side-effect-plus-modal, not shared auth state.
//
// Also re-checks on every foreground transition, not just on mount: this
// component lives at the layout level (not a per-tab screen), so
// expo-router's useFocusEffect doesn't apply the way it does for
// session-completion state elsewhere in the member app — a member who
// already had the app open/backgrounded when a push landed would otherwise
// never see the in-app popup until a full cold restart, since profile.id
// never changes to re-trigger a mount-only effect.
export function AnnouncementChecker() {
  const { profile } = useAuth();
  const router = useRouter();
  const [queue, setQueue] = useState([]);
  const profileId = profile?.id;
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;
  const memberSinceRef = useRef(profile?.created_at);
  memberSinceRef.current = profile?.created_at;

  const checkForAnnouncements = useCallback(() => {
    const id = profileIdRef.current;
    if (!id) return;
    listDueUnseenAnnouncementsForUser(id, memberSinceRef.current)
      .then((due) => setQueue(due))
      .catch((err) => {
        console.error("Failed to load announcements:", err);
      });
  }, []);

  useEffect(() => {
    checkForAnnouncements();
  }, [profileId, checkForAnnouncements]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkForAnnouncements();
    });
    return () => subscription.remove();
  }, [checkForAnnouncements]);

  const current = queue[0] ?? null;

  const handleClose = useCallback(() => {
    if (!current || !profile?.id) return;
    acknowledgeAnnouncement(current.id, profile.id).catch((err) => {
      console.error("Failed to acknowledge announcement:", err);
    });
    setQueue((prev) => prev.slice(1));
  }, [current, profile?.id]);

  // requires_reload's "Refresh now" button — ack first (awaited, since a
  // page reload cancels any in-flight request) so the same announcement
  // doesn't just pop right back up post-reload, then reload for real.
  const handleRefresh = useCallback(async () => {
    if (!current || !profile?.id) return;
    try {
      await acknowledgeAnnouncement(current.id, profile.id);
    } catch (err) {
      console.error("Failed to acknowledge announcement:", err);
    } finally {
      if (Platform.OS === "web") window.location.reload();
    }
  }, [current, profile?.id]);

  // An announcement created by publishing an event carries its event_id —
  // "View details" acknowledges it (so it doesn't pop again) and lands the
  // member straight on the event rather than making them hunt for the tab.
  const handleViewEvent = useCallback(() => {
    if (!current?.event_id) return;
    const eventId = current.event_id;
    handleClose();
    router.push(`/(member)/events/${eventId}`);
  }, [current, handleClose, router]);

  return (
    <AnnouncementModal
      announcement={current}
      onClose={handleClose}
      onRefresh={handleRefresh}
      onViewEvent={handleViewEvent}
    />
  );
}
