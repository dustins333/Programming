// Lifetime months / current streak / best streak, plus the copy-paste block
// Terra pastes onto the Canva slides.
//
// All three are computed on read from programming.ccrew_records rather than
// stored. 22 months x ~139 people is ~3k rows — trivial to fetch and reduce,
// and it can never drift out of sync with the records the way a cached
// counter would.

/**
 * @param qualifiedPeriods periods (YYYY-MM-DD, 1st of month) this person qualified
 * @param allPeriods       every processed period, ascending
 */
export function computeStreaks(qualifiedPeriods, allPeriods) {
  const q = new Set(qualifiedPeriods);
  let run = 0;
  let best = 0;
  for (const p of allPeriods) {
    run = q.has(p) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return {
    // Lifetime never resets in January — the source spreadsheets were built
    // per-year, but Terra wants the lifetime number.
    lifetime: q.size,
    // The run ending at the most recently processed month. One qualifying
    // month is a streak of 1, not 0; missing the most recent month is 0.
    current: run,
    best,
  };
}

const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * The wall list: 3x group then 2x group, alphabetical within each.
 * `entries` is anything with { name, tier, qualified }.
 */
export function buildOutputBlock(entries, { periodLabel } = {}) {
  const q = entries.filter((e) => e.qualified);
  const tier3 = q.filter((e) => e.tier === 3).sort(byName);
  const tier2 = q.filter((e) => e.tier === 2).sort(byName);
  const lines = [];
  if (periodLabel) lines.push(`Committed Crew — ${periodLabel}`, "");
  lines.push("3x a week");
  lines.push(...(tier3.length ? tier3.map((e) => e.name) : ["(nobody)"]));
  lines.push("", "2x a week");
  lines.push(...(tier2.length ? tier2.map((e) => e.name) : ["(nobody)"]));
  return lines.join("\n");
}

/**
 * Top Dogs — a perfect record: qualified every single processed month.
 * Someone who joined recently can't be a Top Dog, which is the intent: it
 * is a perfect record across the whole history, not a current streak.
 */
export function topDogs(people, allPeriods) {
  if (!allPeriods.length) return [];
  return people
    .filter((p) => p.lifetime === allPeriods.length)
    .slice()
    .sort(byName);
}
