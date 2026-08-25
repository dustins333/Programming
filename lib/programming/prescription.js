import { repUnit } from "./repUnit";

// How a prescription reads, in words — "4 × 8,8,6,6 · rest 2:00".
//
// Pure, with only repUnit (also pure) behind it, so any bundle can import
// it. Both functions lived in components/builder/SessionBuilderParts.js
// until the SPC mobile roster needed them: that file pulls in @dnd-kit, and
// a phone screen has no business dragging a drag-and-drop library along to
// print "4 × 5". Same reasoning as sessionLabels.js. SessionBuilderParts
// re-exports both, so every existing call site is unchanged.

// Coaches say "sixty" and "ninety", not "one minute" and "one thirty" — so
// anything under two minutes stays in seconds, and only whole minutes from
// 2:00 up get clock notation.
export function formatRest(seconds) {
  if (seconds == null || seconds === "") return "—";
  const n = Number(String(seconds).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(seconds);
  if (n < 120 || n % 60 !== 0) return `${n}s`;
  return `${n / 60}:00`;
}

// "4 × 8,8,6,6" when the sets differ, "3 × 12" when they don't — the same
// summary the grid tiles and the member app show.
export function schemeLabel(item, exercise = item.exercises) {
  const u = repUnit(exercise).suffix;
  const tag = (v) => (v === "" || v == null ? "—" : `${v}${u}`);
  const scheme = item.rep_scheme?.length ? item.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? tag(unique[0]) : scheme.map((r) => tag((r ?? "").trim())).join(",")}`;
  }
  return `${item.sets ?? 0} × ${tag(item.reps)}`;
}
