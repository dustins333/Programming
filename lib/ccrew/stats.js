// Shared shape for the stat tiles, so the view screen and the upload
// preview can't describe the same month differently.
//
// `total` is the number of people in that month's export. It is genuinely
// UNKNOWN for backfilled months (see migration 0069) — the 2025/2026 source
// tabs were already-filtered crew lists, and the 2024 tabs survive only as
// the subset of people still on the roster today. When it's unknown every
// percentage is unknown too; showing one would be inventing a denominator.
export function monthStats({ qualified, tier3, tier2, total }) {
  const known = typeof total === "number" && total > 0;
  const pct = (n) => (known ? `${Math.round((n / total) * 100)}%` : null);
  return {
    committed: qualified,
    tier3,
    tier2,
    total: known ? total : null,
    committedShare: pct(qualified),
    tier3Share: pct(tier3),
    tier2Share: pct(tier2),
    totalKnown: known,
  };
}
