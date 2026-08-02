// Splits `text` into {text, highlighted, range} pieces given a sorted or
// unsorted array of [start, end] character ranges — shared by the native
// (read-only) and web (interactive) HighlightableAnswer renderers so the
// segment math only exists once.
export function splitIntoSegments(text, ranges) {
  if (!ranges || ranges.length === 0) return [{ text, highlighted: false }];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const segments = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true, range: [start, end] });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments;
}
