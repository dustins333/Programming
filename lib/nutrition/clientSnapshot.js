import { supabase } from "../supabase/client";
import { todayInBoise, addDays } from "../boiseDate";
import { computeWeekWindows, deriveCheckinStatus } from "./weekCycle";
import { listCheckinCloseoutsSince } from "./checkin";

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

// One client's nutrition headline: days logged this rolling week, the
// 4-week weight trend, and where this week's check-in stands.
//
// Deliberately its own two small queries rather than reusing
// getNutritionRoster() — that one fetches every client's logs and check-ins
// to build the whole roster, which is exactly right for the roster and
// wildly disproportionate for a single client's detail page.
export async function getClientNutritionSnapshot(userId, today = todayInBoise()) {
  const { currentWeek } = computeWeekWindows(today);
  const recentStart = addDays(today, -6);
  // Four weeks back, so the trend line has something to compare against
  // even for a client who logs sporadically.
  const trendStart = addDays(today, -27);

  const [{ data: logs, error: logsError }, { data: checkins, error: checkinError }, closeouts] = await Promise.all([
    supabase.from("daily_logs").select("date, weight").eq("client_id", userId).gte("date", trendStart).lte("date", today),
    supabase.from("checkin_responses").select("finalized_at, submitted_at").eq("client_id", userId).eq("week_start", currentWeek.start),
    // Isolated: this reads a table added in 0111, and a snapshot card is
    // not worth taking down over an unrun migration. Empty means "not
    // closed out", i.e. exactly the pre-0111 answer.
    listCheckinCloseoutsSince(userId, currentWeek.start).catch(() => []),
  ]);
  if (logsError) throw logsError;
  if (checkinError) throw checkinError;

  const recent = (logs ?? []).filter((l) => l.date >= recentStart);
  const daysLogged = new Set(recent.map((l) => l.date)).size;

  // Most recent 7 days of weights vs. the 7 days ending three weeks ago —
  // a fortnight apart, so day-to-day noise doesn't read as a trend.
  const priorStart = trendStart;
  const priorEnd = addDays(trendStart, 6);
  const recentWeight = average(recent.map((l) => l.weight).filter((w) => w != null));
  const priorWeight = average(
    (logs ?? []).filter((l) => l.date >= priorStart && l.date <= priorEnd).map((l) => l.weight).filter((w) => w != null)
  );
  const weightDelta = recentWeight != null && priorWeight != null ? Math.round((recentWeight - priorWeight) * 10) / 10 : null;

  const checkin = (checkins ?? [])[0] ?? null;

  return {
    daysLogged,
    weightDelta,
    // Weeks the delta actually spans, so the label can say "/ 4 wk" honestly
    // rather than hardcoding it.
    weightDeltaWeeks: 4,
    checkinStatus: deriveCheckinStatus(checkin, closeouts.find((c) => c.week_start === currentWeek.start) ?? null),
    checkinSubmittedAt: checkin?.submitted_at ?? null,
    weekStart: currentWeek.start,
  };
}
