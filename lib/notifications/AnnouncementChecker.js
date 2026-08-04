import { useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
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
  const [queue, setQueue] = useState([]);
  const profileId = profile?.id;
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;

  const checkForAnnouncements = useCallback(() => {
    const id = profileIdRef.current;
    if (!id) return;
    listDueUnseenAnnouncementsForUser(id)
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

  return <AnnouncementModal announcement={current} onClose={handleClose} />;
}
