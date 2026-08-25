import { getSessionBests } from "./programming/exerciseStats";
import { listLogsForSession } from "./programming/memberPlan";
import { drawFinalizeFace } from "./finalizePlateDraw";
import { setVolume } from "./programming/volume";
import { todayInBoise } from "./boiseDate";
import { formatDateRange } from "./formatDate";

function sessionVolume(rows, date) {
  let volume = 0;
  for (const row of rows) {
    if (row.date_performed !== date) continue;
    volume += setVolume(row.reps, row.weight, row.exercises);
  }
  return Math.round(volume);
}

// Builds the plate object FinalizePlate renders (design_handoff_member_
// finalize_v1), for a just-finalized group or SPC session. Only ever called
// from plan.js's own finalize handlers, which only ever operate on the
// current week's session — plan.js's own load() always resolves a "ready"
// group/SPC entry against today's current week, never a back-logged one —
// so there's no separate "current week" guard needed here; the callers
// structurally can't hand this anything else. Back-logged finalizes
// (plan-block.js, plan-spc-block.js, My Week's SessionSheet) call
// finalizeGroupSession/finalizeSpcSession directly and never touch this.
//
// `progress` is the ONE program's own {completed, target} for the week —
// caller-supplied (via weeklyProgress.js's getGroupWeeklyProgress/
// getSpcWeeklyProgress) rather than computed in here, so a member holding
// several programs at once sees the specific program they just finalized
// against its own target, not a figure blended across every program they
// hold. That blended figure is what My Week's hero/ProgressRing show on
// purpose — this plate is celebrating one named session, and pairing it
// with a denominator padded by an unrelated program read as a bug the first
// time a dual-program member (SPC + a group membership) hit it.
export async function buildLiftFinalizePlate({ userId, sessionKey, session, sessionName, weekNumber, exerciseIds, progress, today = todayInBoise() }) {
  const { completed, target } = progress;
  const [bests, loggedRows] = await Promise.all([
    getSessionBests(userId, exerciseIds, today),
    listLogsForSession(userId, session),
  ]);

  const volume = sessionVolume(loggedRows ?? [], today);
  const meta = `Week ${weekNumber}, Day ${completed} · ${volume.toLocaleString()} lb`;

  // Priority when more than one forced condition is true at once: closing
  // the week is the rarer, single-per-week event, so it wins over a best —
  // a PR can still draw its own ink plate on a different day within the
  // same week ("a best doesn't consume the week closer", per the README).
  if (target > 0 && completed >= target) {
    return { face: "olive", eyebrow: `WEEK ${weekNumber} COMPLETE`, completed, target, subline: "Back Monday.", meta };
  }

  const best = bests[0];
  if (best) {
    return { face: "ink", eyebrow: sessionName, completed, target, subline: `${best.weight} × ${best.reps} ${best.exerciseName}`, meta };
  }

  const draw = await drawFinalizeFace(sessionKey);
  return { face: draw.face, eyebrow: sessionName, completed, target, subline: draw.subline, meta };
}

// Nutrition's one and only plate — the 7th finalized day of the week, always
// the same forced-olive "complete week" object the lifting side uses for its
// own week closer, never a mid-week draw (there's no cream/clay/ink variant
// for nutrition at all — see the README's "Nutrition gets exactly one
// plate" rule).
export function buildNutritionWeekPlate({ weekStart, weekEnd }) {
  return {
    face: "olive",
    eyebrow: "WEEK COMPLETE",
    completed: 7,
    target: 7,
    subline: "Back Monday.",
    meta: `${formatDateRange(weekStart, weekEnd)} · 7 days logged`,
  };
}
