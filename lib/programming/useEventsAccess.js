import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { listLiveEventsForUser } from "./events";
import { useSeenEventIds } from "./eventSeen";
import { useUnsentBagEventIds } from "./eventBag";

// Whether this member has any live event right now — the Events tab's only
// visibility rule — and how many of them she hasn't opened yet, which is the
// tab's badge. There is deliberately no admin on/off switch: the tab appears
// when something is live and disappears when the last one closes.
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
export function useEventsAccess(userId) {
  const [events, setEvents] = useState([]);
  const seen = useSeenEventIds();
  const unsentBags = useUnsentBagEventIds(userId);

  const check = useCallback(async () => {
    if (!userId) return;
    try {
      setEvents(await listLiveEventsForUser(userId));
    } catch {
      setEvents([]);
    }
  }, [userId]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  // `seen` is null until storage has actually been read; counting against an
  // empty set in the meantime would flash a badge on every cold start for
  // events she'd already dealt with.
  const unseenCount = seen ? events.filter((event) => !seen.has(event.id)).length : 0;

  // Live events she has put things in the bag for and not sent. Closed
  // events drop out on their own, since they're not in `events`.
  const unsentBagCount = unsentBags ? events.filter((event) => unsentBags.has(event.id)).length : 0;

  return { showTab: events.length > 0, unseenCount, unsentBagCount };
}
