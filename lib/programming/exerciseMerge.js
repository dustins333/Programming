import { programming } from "../supabase/client";

// Merging two library entries that are the same lift
// (design_handoff_coach_web_v2, 1o).
//
// The library accumulates near-duplicates because a coach mid-build types
// "DB Bench Press" rather than scrolling to find "Dumbbell Bench Press".
// Both then carry real history, and neither is complete. Merging moves
// every logged set and every programmed reference onto the entry you keep,
// then retires the other — nothing is deleted, which is why the retired
// entry is archived rather than dropped.

// Every table that points at an exercise. Kept next to the merge itself on
// purpose: if a future feature adds another reference and forgets to add
// it here, a merge would silently orphan those rows.
const REFERENCE_TABLES = [
  "logs",
  "group_workout_exercises",
  "group_workout_warmups",
  "spc_workout_exercises",
  "spc_workout_warmups",
  "template_exercises",
  "template_warmups",
  "one_off_exercises",
  "one_off_warmups",
];

/* ------------------------------------------------------- name similarity */

// Normalised for comparison only — never stored. Strips punctuation and
// expands the abbreviations that actually cause duplicates in this
// library, so "DB Bench Press" and "Dumbbell Bench Press" collapse to the
// same string.
const ABBREVIATIONS = {
  db: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  rdl: "romanian deadlift",
  ohp: "overhead press",
  sldl: "stiff leg deadlift",
  bw: "bodyweight",
};

function normalize(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(" ");
}

// Levenshtein, capped — good enough to catch a typo or a missing word, and
// cheap enough to run over a few hundred names in the browser.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - editDistance(a, b) / longest;
}

// A pair is suggested when the normalised names are the same, are the same
// words in a different order, or are one small edit apart.
//
// Substring containment is deliberately NOT a rule, though it's the
// obvious one to reach for. Run against the real library it produced 35
// suggestions from 83 exercises, nearly all of them genuinely different
// lifts: "Goblet Squat" vs "Squat", "Inverted Row" vs "Row", "Split Squat"
// vs "Squat", "Barbell Bench Press" vs "Bench Press". A merge page that
// mostly suggests wrong merges is worse than no merge page — one accepted
// suggestion silently folds a real lift's history into another one.
//
// Name-only by design: two lifts sharing a muscle group are not
// duplicates, and anything looser than the name produces suggestions a
// coach can't evaluate at a glance.
const SIMILARITY_THRESHOLD = 0.88;

export function findDuplicateCandidates(exercises, dismissedKeys = new Set()) {
  const rows = exercises
    .filter((e) => e.is_active !== false)
    .map((e) => {
      const norm = normalize(e.name);
      return { exercise: e, norm, type: e.type ?? "lift", tokens: [...new Set(norm.split(" "))].sort().join(" ") };
    })
    .filter((r) => r.norm.length > 0);

  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      // A warm-up and a lift are never the same entry, however alike the
      // names look — "Glute Bridge" the warm-up and "Glute Bridge" the
      // lift are two deliberately separate things, and merging them would
      // fold a warm-up's history into a loaded lift (or vice versa) and
      // strand it in the wrong half of every builder's picker, which
      // filters strictly on type.
      if (a.type !== b.type) continue;
      if (a.norm === b.norm) {
        pairs.push({ a: a.exercise, b: b.exercise, reason: "identical" });
        continue;
      }
      // Same words, different order — "Squat Goblet" vs "Goblet Squat".
      if (a.tokens === b.tokens) {
        pairs.push({ a: a.exercise, b: b.exercise, reason: "reordered" });
        continue;
      }
      const score = similarity(a.norm, b.norm);
      if (score >= SIMILARITY_THRESHOLD) {
        pairs.push({ a: a.exercise, b: b.exercise, reason: "similar", score });
      }
    }
  }

  return pairs.filter((p) => !dismissedKeys.has(pairKey(p.a.id, p.b.id)));
}

// Canonical, order-independent key — matches the migration's ordered
// (exercise_a_id, exercise_b_id) storage, so a pair dismissed once can
// never come back by being named the other way round.
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/* ----------------------------------------------------------- dismissals */

export async function listMergeDismissals() {
  const { data, error } = await programming
    .from("exercise_merge_dismissals")
    .select("id, exercise_a_id, exercise_b_id, dismissed_at")
    .order("dismissed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function dismissPair(idA, idB, dismissedBy) {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
  const { error } = await programming
    .from("exercise_merge_dismissals")
    .insert({ exercise_a_id: a, exercise_b_id: b, dismissed_by: dismissedBy ?? null });
  if (error) throw error;
}

export async function undoDismissal(id) {
  const { error } = await programming.from("exercise_merge_dismissals").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- merge */

function labelForType(type) {
  return (type ?? "lift") === "warmup" ? "warm-up" : "lift";
}

// Per-table reference counts for the entry being retired — what the merge
// confirmation actually promises to move.
export async function getReferenceCounts(exerciseId) {
  const results = await Promise.all(
    REFERENCE_TABLES.map(async (table) => {
      const { count, error } = await programming
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("exercise_id", exerciseId);
      if (error) throw error;
      return [table, count ?? 0];
    })
  );
  const byTable = Object.fromEntries(results);
  return {
    byTable,
    logs: byTable.logs ?? 0,
    programmed: results.reduce((sum, [table, n]) => (table === "logs" ? sum : sum + n), 0),
    total: results.reduce((sum, [, n]) => sum + n, 0),
  };
}

// Repoints every reference from `retireId` onto `keepId`, then archives the
// retired entry.
//
// Sequential plain updates, not a transaction — this codebase's standing
// convention (see payroll's approveRequest, the SPC block flows) is that a
// multi-step action is a sequence of writes rather than a stored
// procedure. The failure mode is benign and visible: a partial merge
// leaves some references already moved and the retired entry still active,
// so re-running the merge finishes the job rather than corrupting
// anything. Every step is idempotent for exactly that reason.
export async function mergeExercises(retireId, keepId) {
  if (!retireId || !keepId || retireId === keepId) {
    throw new Error("Pick two different exercises to merge.");
  }

  // Enforced here rather than only in the UI, because the merge page's
  // typeahead can name ANY two entries — the suggestion list isn't the
  // only way in. Read back from the database instead of trusting whatever
  // the caller happened to be holding.
  const { data: pair, error: pairError } = await programming
    .from("exercises")
    .select("id, name, type, parent_id")
    .in("id", [retireId, keepId]);
  if (pairError) throw pairError;
  const retireRow = pair?.find((e) => e.id === retireId);
  const keepRow = pair?.find((e) => e.id === keepId);
  if (!retireRow || !keepRow) throw new Error("One of those exercises no longer exists.");
  if ((retireRow.type ?? "lift") !== (keepRow.type ?? "lift")) {
    throw new Error(
      `"${retireRow.name}" is a ${labelForType(retireRow.type)} and "${keepRow.name}" is a ${labelForType(keepRow.type)}. Those can't be merged — a warm-up and a lift are separate entries by design.`
    );
  }

  for (const table of REFERENCE_TABLES) {
    const { error } = await programming.from(table).update({ exercise_id: keepId }).eq("exercise_id", retireId);
    if (error) throw new Error(`Couldn't move ${table.replace(/_/g, " ")}: ${error.message}`);
  }

  // Since 0095 a parent is its own record, so nothing hangs off the
  // retired entry to move. What can be lost instead is the grouping: merge
  // a variation that sits under "Squat" into one that sits under nothing
  // and the survivor drops out of that parent. Carried across only when
  // the kept entry has no parent of its own — an existing grouping on the
  // survivor is a deliberate choice and isn't overwritten.
  if (retireRow.parent_id && !keepRow.parent_id) {
    const { error: parentError } = await programming
      .from("exercises")
      .update({ parent_id: retireRow.parent_id })
      .eq("id", keepId);
    if (parentError) throw parentError;
  }

  // Archived, not deleted. A deleted row would take its own history with
  // it if any reference was missed, and "nothing is deleted" is what makes
  // this safe to do without a confirmation essay.
  const { error: archiveError } = await programming.from("exercises").update({ is_active: false }).eq("id", retireId);
  if (archiveError) throw archiveError;
}
