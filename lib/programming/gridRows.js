// Shared by Group Programs' and SPC's block-creation grids: both lay out
// rows relative to TODAY (a real calendar date) rather than "current block's
// week + offset", and both need to collapse consecutive uncovered rows into
// one gap-sized "Start new block" prompt instead of repeating an empty state
// per row. Extracted once both screens needed the identical logic verbatim.
export const WEEK_OFFSETS = [
  { offset: 0, label: "Current week" },
  { offset: 1, label: "Next week" },
  { offset: 2, label: "3 weeks out" },
  { offset: 3, label: "4 weeks out" },
  { offset: 4, label: "5 weeks out" },
  { offset: 5, label: "6 weeks out" },
];

// Groups consecutive uncovered rows into single spans, so a program/client
// with no active block (or one that ends partway through the visible
// window) gets one "start a block" prompt sized to the actual gap, instead
// of repeating the same message in every empty cell. Rows must each have a
// `.block` field that's null/undefined when uncovered.
export function groupRows(rows) {
  const groups = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].block) {
      groups.push({ type: "covered", row: rows[i] });
      i += 1;
    } else {
      let j = i;
      while (j < rows.length && !rows[j].block) j += 1;
      groups.push({ type: "gap", rows: rows.slice(i, j) });
      i = j;
    }
  }
  return groups;
}

// The block that ends immediately before a gap begins — the one whose own
// settings decide what that gap actually means. Both grids already worked
// this out inline to compute a gap-free start date; it's shared now because
// how the gap RENDERS depends on it too: a rolling block (auto_extend) will
// fill its own gap a week at a time, so offering "Start new block" there
// would both misread the situation and queue a block right where the
// rolling one is about to grow.
export function blockPrecedingGap(blocks, gapRows) {
  const gapStart = gapRows?.[0]?.weekDate;
  if (!gapStart) return null;
  return (
    (blocks ?? [])
      .filter((b) => b.block_end_date < gapStart)
      .sort((a, b) => (a.block_end_date < b.block_end_date ? 1 : -1))[0] ?? null
  );
}
