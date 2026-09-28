import { useEffect, useRef, useState } from "react";
import { todayInBoise, addDays, mondayOnOrBefore } from "../boiseDate";
import { getGymWeek } from "./gymWeek";
import { listHiddenUserIds } from "./hiddenAccounts";

// The dashboard's "In the gym" band can step back through past weeks.
// Offset 0 is this week and comes straight from the dashboard's own load
// (`currentGym`), so the band never double-fetches the week it opens on. A
// past week is fetched on first visit and kept for the life of the screen.
//
// A past week is read Monday to Sunday by handing getGymWeek that Sunday as
// its "today". Same shape as getGymToday's gym object, minus today's count.

const MAX_WEEKS_BACK = 52;

export function useGymWeekBrowse(currentGym) {
  const [offset, setOffset] = useState(0);
  const [cache, setCache] = useState({});
  const inFlight = useRef(new Set());

  const thisMonday = mondayOnOrBefore(todayInBoise());
  const weekStart = addDays(thisMonday, -7 * offset);

  useEffect(() => {
    if (offset === 0 || cache[offset] || inFlight.current.has(offset)) return;
    inFlight.current.add(offset);
    const sunday = addDays(weekStart, 6);
    listHiddenUserIds()
      .then((hidden) => getGymWeek(sunday, hidden))
      .then(
        (week) => ({
          sessions: null,
          sessionsWeek: week.counts.sessionsWeek,
          membersWeek: week.counts.membersWeek,
          membersNotSeen: week.counts.membersNotSeen,
          week,
        }),
        (err) => {
          console.error("Gym band: past week load failed", err);
          // En dashes on the tiles, never zeros. See gymToday.js.
          return { sessions: null, sessionsWeek: null, membersWeek: null, membersNotSeen: null, week: null };
        }
      )
      .then((gym) => {
        inFlight.current.delete(offset);
        setCache((prev) => ({ ...prev, [offset]: gym }));
      });
  }, [offset, cache, weekStart]);

  return {
    gym: offset === 0 ? currentGym : cache[offset] ?? null,
    weekStart,
    past: offset > 0,
    loading: offset > 0 && !cache[offset],
    canOlder: offset < MAX_WEEKS_BACK,
    older: () => setOffset((o) => Math.min(o + 1, MAX_WEEKS_BACK)),
    newer: () => setOffset((o) => Math.max(o - 1, 0)),
  };
}
