// CCrew ruleset. Every rule here comes from ccrew-spec.md and was validated
// against 22 months of real data — replaying July 2026 through this
// reproduces Terra's actual wall list 89 of 89, with no false positives.
// Re-run scripts/ccrew_validate.py after ANY change here.

// Package -> sessions per week the member is committed to.
export const PACKAGE_TARGETS = {
  "group strength 1x per week": 1,
  "group strength 2x per week": 2,
  "group strength 3x per week": 3,
  "semi private coaching 1x per week": 1,
  "semi private coaching 2x per week": 2,
  "semi private coaching 3x per week": 3,
  "hybrid - 1 spc 1 class": 2,
  "hybrid - 1 spc 1 bwa": 2,
  "hybrid - 1 spc 2 class": 3,
  "better with age": 2,
  "llyl": 3,
  // Conditioning is one session a week and stays HERE, in the max, rather
  // than stacking on top of a commitment. That was weighed in Aug 2026 and
  // deliberately left alone: Kilo folds conditioning sessions into Total
  // Attendance and nothing in the export can tell one apart from a strength
  // session, so making it raise the bar would have penalised anyone with a
  // lapsed Conditioning signup still sitting on their Kilo record. Being in
  // the max means it never raises anyone's bar (every real commitment is
  // >= 1) and conditioning-only still resolves to 1, i.e. ineligible.
  conditioning: 1,
};

// Kilo names seasonal packages with a period label — "Conditioning July
// 2026" appears 11 times in the historical sheets while today's export says
// plain "Conditioning". Stripping a trailing month-year is a precise
// transformation, not a guess: it keeps a dated Conditioning recognised as
// Conditioning instead of surfacing as a spurious unrecognised-package
// flag every season. Anything else unfamiliar still gets flagged.
const MONTH_YEAR_SUFFIX =
  /\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;

export function canonicalPackage(token) {
  return token.replace(MONTH_YEAR_SUFFIX, "").trim();
}

// Never a commitment. These sit on almost every member and contribute
// nothing to the target — but they are listed explicitly rather than
// treated as "anything unrecognised", because a package we have never seen
// before must surface as a flag, not vanish into a silent zero. LLYL
// appeared this way, and a silent zero would have quietly made a whole
// group of members ineligible.
export const IGNORED_PACKAGES = new Set([
  "kova event",
  "bwa event",
  "team lift",
  "nutrition coaching",
  "foundations",
  "online training",
  "program test",
  "nutrition - advanced",
]);

// A flat 4, NOT the real number of weeks in the month. This is deliberate
// and must not be "fixed": switching July 2026 to its true 4.43 weeks drops
// 17 of 89 people off the wall. In a 31-day month the effective bar is
// ~72%. Terra knows, and wants it.
export const WEEKS_PER_MONTH = 4;
export const THRESHOLD = 0.8;
export const MIN_ELIGIBLE_TARGET = 2;
export const STAFF_TARGET = 2;

// Kilo uses ';' today. Historical exports used ',' and 2024's used both ','
// and the word ' and '. Trailing separators and empty tokens are common.
export function splitPackages(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/;|,| and /)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function classifyPackage(token) {
  const key = canonicalPackage(token).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PACKAGE_TARGETS, key)) {
    return { kind: "commitment", target: PACKAGE_TARGETS[key] };
  }
  if (IGNORED_PACKAGES.has(key)) return { kind: "ignored", target: 0 };
  return { kind: "unknown", target: 0 };
}

// attendance / (tier * 4) >= 0.8, in exact integer arithmetic — so the bar
// can never be decided by a float rounding artifact.
// a/(t*4) >= 8/10  <=>  a*10 >= t*4*8
export function clearsTier(attendance, tier) {
  return attendance * 10 >= tier * WEEKS_PER_MONTH * 8;
}

/**
 * Score one person for one month.
 *
 * @param attendance  Kilo's `Total Attendance` (never Reservations — people
 *                    get checked in without reserving).
 * @param rawPackages the raw `Current Packages` cell, stored verbatim.
 * @param isStaff     from core.users.role in ('coach','admin') — never from
 *                    Kilo's own status or the Team Lift package.
 */
export function evaluate(attendance, rawPackages, isStaff) {
  const tokens = splitPackages(rawPackages);
  const commitments = [];
  const unknown = [];
  for (const token of tokens) {
    const { kind, target } = classifyPackage(token);
    if (kind === "commitment") commitments.push({ token, target });
    else if (kind === "unknown") unknown.push(token);
  }

  // Take the MAX, never the sum. Someone holding Group Strength 2x AND
  // Semi Private 1x is committed to 2, not 3; a stale duplicate package
  // must not inflate the bar. Summing produces garbage.
  const packageTarget = commitments.reduce((m, c) => Math.max(m, c.target), 0);


  // Staff are measured at 2x regardless of their package, so a coach on a
  // 3x package clears with 7 where a member would need 10. The floor only
  // LOWERS an existing commitment — it never creates eligibility for
  // someone who holds no commitment package at all.
  const staffFloorApplied = isStaff && packageTarget > 0 && packageTarget !== STAFF_TARGET;
  const target = isStaff && packageTarget > 0 ? STAFF_TARGET : packageTarget;

  // Target must be >= 2. A 1x member can never make CCrew no matter how
  // often they attend, and neither can someone with no commitment at all.
  const eligible = target >= MIN_ELIGIBLE_TARGET;
  const ratio = target > 0 ? attendance / (target * WEEKS_PER_MONTH) : 0;
  const qualified = eligible && clearsTier(attendance, target);

  // Grouped by the highest tier actually CLEARED, not by the package — a
  // staff member on a 3x package who only cleared 2x belongs under 2x.
  const tier = qualified ? (clearsTier(attendance, 3) ? 3 : 2) : null;

  return {
    attendance,
    packages: rawPackages || "",
    commitments,
    unknown,
    packageTarget,
    target,
    eligible,
    ratio,
    qualified,
    tier,
    staffFloorApplied,
  };
}
