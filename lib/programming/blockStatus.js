import { colors } from "../theme";

// Shared by Group Programs' and SPC's block detail + history pages — a
// block is "Past" once it's ended, "Upcoming" if it hasn't started yet,
// otherwise "Current". Same three-way status either program family uses.
export function getBlockStatus(block, today) {
  // An SPC block can also be a DRAFT (migration 0089): written, but never
  // sent, and therefore with no dates at all. It has no place on the past /
  // current / upcoming line, so it gets its own key rather than falling
  // through the null-date comparisons below (which would answer "current").
  if (block.status === "draft") return { key: "draft", label: "Not sent", color: colors.primaryOnWhite };
  if (block.block_end_date < today) return { key: "past", label: "Past", color: "#a8a29e" };
  if (block.block_start_date > today) return { key: "upcoming", label: "Upcoming", color: colors.primaryOnWhite };
  return { key: "current", label: "Current", color: "#4d6142" };
}
