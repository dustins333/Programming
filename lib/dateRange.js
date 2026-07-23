// Two inclusive date ranges [aStart, aEnd] and [bStart, bEnd] (ISO strings,
// so plain string comparison is safe) overlap unless one ends before the
// other starts — the standard interval test. Shared by group and SPC block
// creation, both of which need to refuse a new block that overlaps an
// existing one for the same scope (program for group, client for SPC).
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}
