import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { listLiveEventsForUser } from "./events";

// Whether this member has any live event right now — the Events tab's only
// visibility rule. There is deliberately no admin on/off switch: the tab
// appears when something is live and disappears when the last one closes.
//
// Defaults to HIDDEN while loading and on error, the opposite default from
// useHasFitness. Different tradeoff: hiding My Fitness would take a tab away
// from a member who genuinely trains, whereas an Events tab is additive, is
// empty most weeks, and has the announcement/push as its real notification
// channel — so a blip that hides it costs nothing, while a blip that shows
// an empty tab is the "don't make her feel she's missing something" problem.
//
// Re-checks when the app returns to the foreground, since an event can go
// live (or close) while the app sits open in the background — same reason
// AnnouncementChecker listens for it.
export function useHasEvents(userId) {
  const [hasEvents, setHasEvents] = useState(false);

  const check = useCallback(async () => {
    if (!userId) return;
    try {
      const events = await listLiveEventsForUser(userId);
      setHasEvents(events.length > 0);
    } catch {
      setHasEvents(false);
    }
  }, [userId]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  return hasEvents;
}
