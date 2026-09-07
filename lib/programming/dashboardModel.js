// Everything both coach dashboards SAY, computed once.
//
// The premise of design_handoff_coach_dashboard is that the phone and the
// desktop had drifted: a figure on one was missing from the other, and where
// both showed something they didn't always agree on what it meant. That
// happened because each screen derived its own numbers inline. So the
// derivation lives here, both screens render it, and the only difference
// between them is size.
//
// Pure — no fetching, no React. Everything takes what useCoachDashboard has
// already loaded.
//
// A figure that failed to load is `null`, never 0. A tile reading "0 due now"
// is a real answer a coach acts on, and a broken query must not be able to
// give it; the tile renders an en dash instead.

export const TONE_INK = {
  danger: "#b23a22",
  warn: "#8a5a2e",
  good: "#4d6142",
  plain: "#2a211c",
};

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------------- SPC */

// The four sub-tiles, straight off deriveSpcState's own state names so a
// tile and the roster it filters can't disagree about who's in it.
//
// Only ONE tile in a section is ever tinted. Everything was tinted before
// and nothing stood out; a fill now means "this is the one".
//
// "No coach" is a different axis from the other three — an ownership gap,
// not a programming state — so a client can be counted in both it and Good
// to go. That's deliberate: the question it answers is "who would nobody
// pick up", which is true regardless of how her programming is doing.
export function buildSpcTiles(stats) {
  const s = stats?.spcStates ?? null;
  return [
    {
      key: "dueNow",
      figure: s?.dueNow ?? null,
      label: "Due now",
      caption: "ended, nothing queued",
      tone: "danger",
      tinted: true,
      route: "/(coach)/spc?status=dueNow",
    },
    {
      key: "dueSoon",
      figure: s?.dueSoon ?? null,
      label: "Due soon",
      caption: "in their final week",
      tone: "warn",
      route: "/(coach)/spc?status=dueSoon",
    },
    {
      key: "goodToGo",
      figure: s?.goodToGo ?? null,
      label: "Good to go",
      caption: "running or queued up",
      tone: "good",
      route: "/(coach)/spc?status=goodToGo",
    },
    {
      key: "noCoach",
      figure: stats?.spcNoCoach ?? null,
      label: "No coach",
      caption: "nobody owns them",
      tone: "plain",
      route: "/(coach)/spc?coach=__unassigned",
    },
  ];
}

export function spcSubline(stats) {
  const total = stats?.spcCount ?? 0;
  const behind = stats?.spcStates?.dueNow ?? 0;
  const clients = plural(total, "client", "clients");
  return behind > 0 ? `${clients} · ${behind} behind` : clients;
}

/* ------------------------------------------------------------- nutrition */

// `nutritionToday` is the same content-aware count the mobile card has always
// used — someone who put anything in today, not just whoever tapped Finalize.
// Finalizing is an end-of-day action, so a finalized-only figure reads as an
// empty gym all afternoon.
//
// Check-ins is the tinted one: it's the only figure here that is work
// waiting on the coach rather than a picture of the roster.
export function buildNutritionTiles(stats, nutritionToday) {
  const notSeen = stats?.nutritionNotSeen ?? null;
  const finalized = nutritionToday?.finalizedCount ?? null;
  return [
    {
      key: "loggedToday",
      figure: nutritionToday ? nutritionToday.loggedCount : null,
      suffix: nutritionToday ? ` /${nutritionToday.totalCount}` : null,
      label: "Logged today",
      caption: finalized === null ? "" : `${finalized} already finalized`,
      tone: "plain",
      sheet: "nutritionToday",
    },
    {
      key: "checkins",
      figure: stats?.checkinsToReview ?? null,
      label: "Check-ins",
      wideLabel: "Check-ins waiting",
      caption: "submitted, not reviewed",
      tone: "danger",
      tinted: true,
      route: "/(coach)/nutrition?status=readyForCheckin",
    },
    {
      key: "notSeen",
      figure: notSeen ? notSeen.length : null,
      label: "Not seen 7d",
      wideLabel: "Not seen in 7 days",
      caption: "no log, no weigh-in",
      tone: "warn",
      sheet: "notSeen",
    },
  ];
}

export function nutritionSubline(stats) {
  return `${plural(stats?.nutritionCount ?? 0, "active client", "active clients")}`;
}

/* ----------------------------------------------------------------- group */

// One row per program, not an aggregate. Session counts are deliberately
// absent: In the gym already reports sessions gym-wide, and repeating them
// scoped to a program invites a comparison between two numbers that are
// counting different things.
//
// `needsYou` is the same predicate the header subline counts, so "1 needs
// you" and the number of red/amber dots below it always match.
export function buildGroupRows(stats) {
  const counts = new Map((stats?.groupProgramCounts ?? []).map((p) => [p.id, p.count]));
  return (stats?.groupDashboard ?? []).map((p) => {
    const bits = [];
    if (!p.hasActiveBlock) {
      bits.push("No active block");
    } else if (p.rolling) {
      bits.push("Ongoing");
    } else if (p.weekNumber && p.blockLengthWeeks) {
      bits.push(`Week ${p.weekNumber} of ${p.blockLengthWeeks}`);
    }

    if (p.unpublishedThisWeek) bits.push("this week is still drafts");
    else if (p.unpublishedNextWeek) bits.push("next week is still drafts");
    else if (p.hasActiveBlock) bits.push("all published");

    // A rolling block grows a week at a time overnight, so it has no
    // successor by design — saying "nothing queued after" about one is the
    // setting working, not a gap.
    if (p.hasActiveBlock && !p.rolling && !p.hasNextWeekBlock) bits.push("nothing queued after");


    // Red is "a member opens the app and there's nothing there" — no block,
    // or this week still unpublished. Amber is everything that needs an eye
    // but isn't hurting anyone yet. The dot and the sentence beside it are
    // driven by the same facts, so they can never disagree.
    const noQueue = p.hasActiveBlock && !p.rolling && !p.hasNextWeekBlock;
    const tone = !p.hasActiveBlock || p.unpublishedThisWeek ? "danger" : p.unpublishedNextWeek || noQueue ? "warn" : "good";

    return {
      key: p.programId,
      name: p.name,
      detail: bits.join(" · "),
      clientCount: counts.get(p.programId) ?? null,
      // "ongoing" rather than a countdown: an auto-extending block has no
      // end to count down to.
      trailing: p.rolling ? "ongoing" : p.daysUntilEnd === null ? "—" : `${p.daysUntilEnd}d left`,
      tone,
      // Only red counts toward the header's "N needs you". Amber is a
      // heads-up; a header that counted both would say two programs need you
      // on a morning when only one of them actually does.
      needsYou: tone === "danger",
      route: `/(coach)/blocks?program=${p.programId}`,
    };
  });
}

export function groupSubline(rows) {
  const needs = rows.filter((r) => r.needsYou).length;
  const programs = plural(rows.length, "program", "programs");
  return needs > 0 ? `${programs} · ${needs} needs you` : programs;
}

/* ------------------------------------------------------------ quick pick */

// The five tiles in the mobile app bar. Gating is ABSENCE, not disablement —
// a tile a coach can't use isn't drawn, and because every tile is flex:1 the
// rest simply stretch to fill the gap. A nutrition-only coach gets three
// tiles at a third of the width each, no dead buttons.
//
// State is a DOT, never a count. It matches the hamburger badge right above
// it, and with more than one badged tile a number would be ambiguous about
// which thing it's counting.
export function buildQuickPickTiles({ profile, stats, liveSession, finalizePrompt }) {
  const isAdmin = profile?.role === "admin";
  const canSpc = isAdmin || Boolean(profile?.can_view_spc);
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);
  const live = Boolean(liveSession);

  return [
    // Tinted rather than white because it's the coach's own thing, not a
    // client's — every other tile opens somebody else's work.
    { key: "athlete", icon: "fitness", label: "Athlete", variant: "tint", route: "/(member)" },
    canSpc && {
      key: "live",
      icon: "radio",
      label: "Live",
      variant: "ink",
      dot: live ? "#8fbf7a" : null,
      // Idle lands on the Start tab rather than the screen's own default,
      // which is Stage — same rule LiveSessionStrip used.
      route: live ? "/(coach)/spc/live" : "/(coach)/spc/live?tab=start",
    },
    // Live and SPC are two tiles on purpose: Live opens the running board,
    // SPC opens the roster. "SPC live" and "SPC" side by side read as one
    // duplicated button, hence the split naming.
    canSpc && {
      key: "spc",
      icon: "clipboard",
      label: "SPC",
      variant: "plain",
      dot: (stats?.spcStates?.dueNow ?? 0) > 0 ? "#b23a22" : null,
      route: "/(coach)/spc",
    },
    canNutrition && {
      key: "nutrition",
      icon: "restaurant",
      label: "Nutrition",
      variant: "plain",
      route: "/(coach)/nutrition",
    },
    {
      key: "payroll",
      icon: "cash",
      label: "Payroll",
      variant: "plain",
      // The same rule that raises the finalize banner further down the page:
      // this period's hours aren't in yet.
      dot: finalizePrompt ? "#b23a22" : null,
      route: "/(coach)/payroll",
    },
  ].filter(Boolean);
}

/* --------------------------------------------------------------- payroll */

// The desktop right rail's payroll row. An admin sees the team's submission
// state; a coach sees their own, because the rest of the team's payroll
// isn't a coach's business — listFinalizationsForPeriod is admin-only in RLS
// and isn't even fetched for them.
export function buildPayrollRow({ profile, payroll, closesOn }) {
  const isAdmin = profile?.role === "admin";
  if (!payroll) return { detail: "This pay period", figure: null, route: isAdmin ? "/(coach)/payroll/admin/periods" : "/(coach)/payroll/entries" };
  const detail = closesOn ? `Closes ${closesOn} →` : "This pay period";
  if (isAdmin) {
    return {
      detail,
      figure: String(payroll.submittedCount),
      suffix: ` /${payroll.staffCount} in`,
      route: "/(coach)/payroll/admin/periods",
    };
  }
  return {
    detail,
    figure: payroll.ownFinalized ? "In" : "Due",
    suffix: payroll.ownFinalized ? null : ` · ${payroll.ownEntryCount} entered`,
    tone: payroll.ownFinalized ? "good" : "warn",
    route: "/(coach)/payroll/report",
  };
}
