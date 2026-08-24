// One labeling language for a session's contents, shared by the builders,
// the printed SPC sheet, and the member app (decided 2026-08-23):
//
//   · Lifts are lettered. A standalone lift is "A"; a superset consumes one
//     letter and its members are numbered within it — "B1", "B2". So a
//     session reads A, B1+B2, C.
//   · Warm-ups are numbered. Superset members REPEAT the shared number
//     (warm-ups 3,4,5 supersetted all read "3"), and numbering continues
//     after the group — never 1a/1b.
//
// Both helpers group by first occurrence of superset_group_id, so a group
// whose members ended up non-adjacent (possible only through odd edits)
// still labels consistently rather than double-counting the group.
//
// Pure functions, no imports — safe for the member bundle (unlike
// SessionBuilderParts, which drags in dnd-kit).

const defaultGroupId = (row) => row.superset_group_id ?? row.supersetGroupId ?? null;

// → { [row.id]: "A" | "B1" | ... } in the order given.
export function liftLabelsFor(rows, getGroupId = defaultGroupId) {
  const groupSizes = new Map();
  for (const row of rows) {
    const g = getGroupId(row);
    if (g) groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1);
  }
  const labels = {};
  const letterByKey = new Map();
  const countByKey = new Map();
  for (const row of rows) {
    const g = getGroupId(row);
    const key = g ?? `solo-${row.id}`;
    if (!letterByKey.has(key)) letterByKey.set(key, String.fromCharCode(65 + letterByKey.size));
    const letter = letterByKey.get(key);
    // A "group" left with a single member (partner deleted) reads as a
    // plain standalone lift, not a stranded "B1".
    if (g && (groupSizes.get(g) ?? 0) > 1) {
      const n = (countByKey.get(key) ?? 0) + 1;
      countByKey.set(key, n);
      labels[row.id] = `${letter}${n}`;
    } else {
      labels[row.id] = letter;
    }
  }
  return labels;
}

// → array of numbers aligned to the input order; superset members share.
// e.g. six warm-ups with 3,4,5 supersetted → [1, 2, 3, 3, 3, 4].
export function warmupNumbersFor(rows, getGroupId = defaultGroupId) {
  const numberByKey = new Map();
  let next = 0;
  return rows.map((row) => {
    const g = getGroupId(row);
    const key = g ?? `solo-${row.id ?? next}`;
    if (!numberByKey.has(key)) {
      next += 1;
      numberByKey.set(key, next);
    }
    return numberByKey.get(key);
  });
}
