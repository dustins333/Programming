// Plain Levenshtein-distance similarity, no dependency — used to warn a
// coach they may be about to create a near-duplicate exercise. Not meant to
// be a general-purpose fuzzy-search library, just "close enough" detection
// for short exercise names.
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(currRow[j - 1] + 1, prevRow[j] + 1, prevRow[j - 1] + cost);
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

function normalize(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// 1.0 = identical (after normalization), 0.0 = completely different.
export function nameSimilarity(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

// Finds existing exercises whose name is a likely duplicate of `name`,
// scoped to the same `type` (a warm-up and a lift sharing a name isn't the
// same kind of collision). Returns matches sorted best-first, filtered to
// `threshold` and up.
export function findLikelyDuplicates(name, existingExercises, { type, excludeId, threshold = 0.8 } = {}) {
  const trimmed = name.trim();
  if (!trimmed) return [];

  return existingExercises
    .filter((ex) => ex.id !== excludeId && (ex.type ?? "lift") === (type ?? "lift"))
    .map((ex) => ({ exercise: ex, similarity: nameSimilarity(trimmed, ex.name) }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
