import { colors } from "../theme";

// Shared by Group Programs' and SPC's block detail + history pages — a
// block is "Past" once it's ended, "Upcoming" if it hasn't started yet,
// otherwise "Current". Same three-way status either program family uses.
export function getBlockStatus(block, today) {
  if (block.block_end_date < today) return { key: "past", label: "Past", color: "#a8a29e" };
  if (block.block_start_date > today) return { key: "upcoming", label: "Upcoming", color: colors.primaryOnWhite };
  return { key: "current", label: "Current", color: "#4d6142" };
}
