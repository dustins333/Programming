// Next sort position for a row appended to an ordered list.
//
// Deliberately max(position) + 1, NOT length + 1. Removing a row leaves a
// gap in the numbering (nothing renumbers on delete), so counting rows hands
// out a position some existing row already holds: delete #3 of six and the
// next add is handed 6, colliding with the row already sitting at 6.
//
// Two rows sharing a position is not cosmetic. Every list query here orders
// by position alone with no tiebreak, so their relative order is whatever
// Postgres feels like returning — meaning a session's warm-ups could order
// one way in the builder and another way in the member app or on the printed
// sheet, and the scramble then copied forward into every block cloned from
// it. Lifts mostly self-healed because drag-to-reorder renumbers them;
// warm-ups have no reorder at all, so theirs never did.
export function nextPosition(rows) {
  let max = 0;
  for (const row of rows ?? []) {
    const p = Number(row?.position);
    if (Number.isFinite(p) && p > max) max = p;
  }
  return max + 1;
}
