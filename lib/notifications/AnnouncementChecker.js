import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listDueUnseenAnnouncementsForUser, acknowledgeAnnouncement } from "../programming/announcements";
import { AnnouncementModal } from "../../components/AnnouncementModal";

// Mounted once in app/(member)/_layout.js (both real members and staff
// using "My Training" land there) — checks for due-and-unseen gym-wide
// announcements on load and surfaces them as a popup, oldest first, one at
// a time. Split out the same way PushRegistrar is split out of
// AuthProvider: this is a side-effect-plus-modal, not shared auth state.
export function AnnouncementChecker() {
  const { profile } = useAuth();
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    listDueUnseenAnnouncementsForUser(profile.id)
      .then((due) => {
        if (!cancelled) setQueue(due);
      })
      .catch((err) => {
        console.error("Failed to load announcements:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

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
