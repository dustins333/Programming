import { programming } from "../supabase/client";
import { todayInBoise, daysBetween } from "../boiseDate";

// Benchmark Day (migration 0120) — the gym's quarterly self-test, brought in
// from the neon board on the wall. Three movements, four tiers each, one
// kettlebell per movement.
//
// This file is the ONE definition of the board itself (LIFTS below), of which
// of the three My Week states is showing (`benchmarkPhase`), and of the
// comparison sentence a member reads on the celebration and her card
// (`compareEntries`). Those last two are derived on every read and never
// stored — a tier delta computed in two places is a tier delta that eventually
// disagrees with itself.

// --------------------------------------------------------------------
// The board
// --------------------------------------------------------------------
// Tier labels, sub-labels and units are transcribed from the physical
// Benchmark Highlight Board, not invented. The unit differs per tier on pull
// ups, which is why it lives on the tier and not on the movement: tier 2 is
// seconds of an iso hold and tier 4 is reps, and the celebration has to say
// which.
export const MOVEMENTS = ["pull", "push", "squat"];

export const LIFTS = {
  pull: {
    key: "pull",
    name: "Pull Ups",
    index: 1,
    color: "#ff66c4",
    dim: "#8c3a6b",
    rgb: "255,102,196",
    hint: "Check out the pull up phases.",
    variants: null,
    tiers: [
      { label: "Leg assist iso hold", sub: "Hold at the top", unit: "sec hold" },
      { label: "Max time iso hold", sub: "Hold at the top | no assistance", unit: "sec hold" },
      { label: "Max time eccentric", sub: "Lower slow", unit: "sec eccentric" },
      { label: "Full reps", sub: "Chin over bar", unit: "reps" },
    ],
  },
  push: {
    key: "push",
    name: "Push Ups",
    index: 2,
    color: "#ff9f45",
    dim: "#8c5a2a",
    rgb: "255,159,69",
    hint: "Pick your variation, then place your kettlebell.",
    variants: ["Hands elevated or banded", "Body weight from floor"],
    graduate: "Congrats! You moved from assisted to unassisted push ups!",
    regress: "Back on the bands",
    tiers: [
      { label: "1 to 4 reps", sub: "Tier 1", unit: "reps" },
      { label: "5 to 9 reps", sub: "Tier 2", unit: "reps" },
      { label: "10 to 14 reps", sub: "Tier 3", unit: "reps" },
      { label: "15+ reps", sub: "Tier 4", unit: "reps" },
    ],
  },
  squat: {
    key: "squat",
    name: "Squats",
    index: 3,
    color: "#eaff70",
    dim: "#7f8a3a",
    rgb: "234,255,112",
    hint: "Pick your variation. Log reps and the load you used.",
    variants: ["Adjusted load", "50% body weight + full depth"],
    graduate: "Congrats! You moved from an adjusted load to 50% of your body weight",
    regress: "Back to adjusted load",
    // The only movement that also records what she had in her hands.
    load: true,
    tiers: [
      { label: "1 to 7 reps", sub: "Tier 1", unit: "reps" },
      { label: "8 to 13 reps", sub: "Tier 2", unit: "reps" },
      { label: "14 to 19 reps", sub: "Tier 3", unit: "reps" },
      { label: "20+ reps", sub: "Tier 4", unit: "reps" },
    ],
  },
};

export function tierUnit(movement, tier) {
  const lift = LIFTS[movement];
  if (!lift || !tier) return "";
  return lift.tiers[tier - 1]?.unit ?? "";
}

// --------------------------------------------------------------------
// Events
// --------------------------------------------------------------------

// Which of the three My Week states is showing, from today against the
// coach's three dates. There is no status column and no publish step: an
// event with dates around today IS live, which is what makes it impossible to
// leave one half-published.
export function benchmarkPhase(event, today = todayInBoise()) {
  if (!event) return "none";
  if (today < event.show_from) return "none";
  if (today < event.benchmark_day) return "countdown";
  if (today === event.benchmark_day) return "live";
  if (today <= event.hide_after) return "results";
  return "none";
}

// What My Week should be showing, which is NOT purely the date.
//
// benchmarkPhase above is date arithmetic and stays that way. This layers the
// one rule on top of it that dates cannot express: once all three movements
// are logged there is nothing left to do today, so the card stops saying
// "You vs You | Let's Do This" and becomes her results straight away rather
// than waiting for midnight to roll it over.
export function benchmarkWeekState(event, board, today = todayInBoise()) {
  const phase = benchmarkPhase(event, today);
  if (phase === "live" && completedMovements(board).length === MOVEMENTS.length) return "results";
  return phase;
}

export function daysUntilBenchmark(event, today = todayInBoise()) {
  if (!event) return null;
  // daysBetween is A minus B, so today goes SECOND here — the five copies of
  // that helper across this codebase disagree on rounding, and this one has
  // bitten a screen before (see the lasttime pass).
  return daysBetween(event.benchmark_day, today);
}

// Logging is open on benchmark day itself. The day after, the kettlebells
// lock and the results become a record — the RLS window is deliberately wider
// (through hide_after) so a member finishing at 11:58pm doesn't hit a wall at
// midnight, but this is what the UI gates on.
export function isLoggingOpen(event, today = todayInBoise()) {
  return !!event && today === event.benchmark_day;
}

export async function listBenchmarkEvents() {
  const { data, error } = await programming
    .from("benchmark_events")
    .select("*")
    .order("benchmark_day", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// The event a member should be looking at: the one whose window covers today.
// Returns null outside every window, which is what takes the button off My
// Week with no separate hide flag.
export async function getActiveBenchmarkEvent(today = todayInBoise()) {
  const { data, error } = await programming
    .from("benchmark_events")
    .select("*")
    .lte("show_from", today)
    .gte("hide_after", today)
    .order("benchmark_day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// The event immediately before this one, whose entries prefill her Last time
// column. Staff-only in practice for other members, but a member reads her own
// rows from it fine — the events policy lets her read any event inside its own
// window, and this one is usually outside it, so a member gets null here and
// falls back to a blank Last column. That is correct: her override row on the
// CURRENT event is what she actually edits.
export async function getPreviousBenchmarkEvent(event) {
  if (!event) return null;
  const { data, error } = await programming
    .from("benchmark_events")
    .select("*")
    .lt("benchmark_day", event.benchmark_day)
    .order("benchmark_day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// The benchmark after this one, for the "Next Benchmark Day is ..." line at
// the foot of her card. Returns null when the coach hasn't scheduled one yet,
// and the line is omitted rather than guessed — the gym runs these quarterly
// but the date is a decision, not arithmetic.
export async function getNextBenchmarkEvent(event) {
  if (!event) return null;
  const { data, error } = await programming
    .from("benchmark_events")
    .select("*")
    .gt("benchmark_day", event.benchmark_day)
    .order("benchmark_day", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createBenchmarkEvent({ name, showFrom, benchmarkDay, hideAfter, createdBy = null }) {
  const { data, error } = await programming
    .from("benchmark_events")
    .insert({
      name,
      show_from: showFrom,
      benchmark_day: benchmarkDay,
      hide_after: hideAfter,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBenchmarkEvent(eventId, fields) {
  const patch = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.showFrom !== undefined) patch.show_from = fields.showFrom;
  if (fields.benchmarkDay !== undefined) patch.benchmark_day = fields.benchmarkDay;
  if (fields.hideAfter !== undefined) patch.hide_after = fields.hideAfter;
  const { data, error } = await programming
    .from("benchmark_events")
    .update(patch)
    .eq("id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBenchmarkEvent(eventId) {
  const { error } = await programming.from("benchmark_events").delete().eq("id", eventId);
  if (error) throw error;
}

// --------------------------------------------------------------------
// Entries
// --------------------------------------------------------------------

const BLANK = { tier: null, value: "", load: "", variant: 0, note: "", completedAt: null };

function shape(row) {
  if (!row) return { ...BLANK };
  return {
    id: row.id,
    tier: row.tier ?? null,
    value: row.value ?? "",
    load: row.load ?? "",
    variant: row.variant ?? 0,
    note: row.note ?? "",
    completedAt: row.completed_at ?? null,
  };
}

function emptyBoard() {
  return MOVEMENTS.reduce((acc, m) => ({ ...acc, [m]: { ...BLANK } }), {});
}

// Everything one member's benchmark screen needs, in one round trip per event.
//
// `last` is override-or-default: her own 'last' row on THIS event wins, and
// where she hasn't touched it we fall back to what she actually logged at the
// previous event. That fallback is read-only until she edits, at which point
// an override row is written — so a benchmark that was recorded correctly
// stores nothing extra, and correcting the Last column never rewrites a
// finished benchmark's record.
export async function getBenchmarkBoard(userId, event, previousEvent = null) {
  if (!event) return { current: emptyBoard(), last: emptyBoard() };

  const eventIds = previousEvent ? [event.id, previousEvent.id] : [event.id];
  const { data, error } = await programming
    .from("benchmark_entries")
    .select("*")
    .eq("user_id", userId)
    .in("event_id", eventIds);
  if (error) throw error;

  const rows = data ?? [];
  const current = emptyBoard();
  const last = emptyBoard();

  for (const m of MOVEMENTS) {
    current[m] = shape(rows.find((r) => r.event_id === event.id && r.movement === m && r.slot === "this"));

    const override = rows.find((r) => r.event_id === event.id && r.movement === m && r.slot === "last");
    if (override) {
      last[m] = shape(override);
    } else if (previousEvent) {
      last[m] = shape(rows.find((r) => r.event_id === previousEvent.id && r.movement === m && r.slot === "this"));
    }
  }

  return { current, last };
}

// Hand-rolled upsert rather than .upsert(), the same reason
// sessionCompletions.js gives: the uniqueness rule here is a plain constraint
// but the write is a partial patch (one field at a time as she types), and an
// upsert would blank every column she is not touching.
export async function saveBenchmarkEntry(userId, eventId, movement, slot, fields) {
  const patch = { updated_at: new Date().toISOString() };
  if (fields.tier !== undefined) patch.tier = fields.tier;
  if (fields.value !== undefined) patch.value = fields.value;
  if (fields.load !== undefined) patch.load = fields.load;
  if (fields.variant !== undefined) patch.variant = fields.variant;
  if (fields.note !== undefined) patch.note = fields.note;
  if (fields.completedAt !== undefined) patch.completed_at = fields.completedAt;

  const { data: existing, error: readErr } = await programming
    .from("benchmark_entries")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("movement", movement)
    .eq("slot", slot)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const { data, error } = await programming
      .from("benchmark_entries")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return shape(data);
  }

  const { data, error } = await programming
    .from("benchmark_entries")
    .insert({ event_id: eventId, user_id: userId, movement, slot, ...patch })
    .select()
    .single();
  if (error) throw error;
  return shape(data);
}

// Coaches read every member's board for one event. Not wired to a screen yet
// (the handoff has no coach results view) but the RLS and the query are here
// so it is one screen away rather than one migration away.
export async function listBenchmarkEntriesForEvent(eventId) {
  const { data, error } = await programming
    .from("benchmark_entries")
    .select("*")
    .eq("event_id", eventId)
    .eq("slot", "this");
  if (error) throw error;
  return data ?? [];
}

// --------------------------------------------------------------------
// Comparison — the part with real product rules in it
// --------------------------------------------------------------------
// Tones: 'up' | 'grad' | 'first' are the mint "this improved" cases; 'flat'
// and 'muted' are not. Nothing else reads a tone, so keep the set closed.
export function compareEntries(movement, thisEntry, lastEntry) {
  const lift = LIFTS[movement];
  if (!thisEntry?.tier) return { text: "Not logged", tone: "muted" };

  const head = `Tier ${thisEntry.tier}`;
  if (!lastEntry?.tier) return { text: head, tone: "first" };

  // Variation outranks tier, deliberately: moving off the bands onto the floor
  // is a win even when the tier drops, because the movement itself got harder.
  // The pill is then the whole sentence with no tier in it at all.
  if (lift.variants && thisEntry.variant > lastEntry.variant) {
    return { text: lift.graduate, tone: "grad" };
  }
  if (lift.variants && thisEntry.variant < lastEntry.variant) {
    return { text: `${head} | ${lift.regress}`, tone: "muted" };
  }

  const n = Math.abs(thisEntry.tier - lastEntry.tier);
  const word = n === 1 ? "tier" : "tiers";
  if (thisEntry.tier > lastEntry.tier) return { text: `${head} | Up ${n} ${word}`, tone: "up" };
  if (thisEntry.tier < lastEntry.tier) return { text: `${head} | Down ${n} ${word}`, tone: "muted" };
  return { text: `${head} | Held`, tone: "flat" };
}

// NOTE ON THE SUPPORTING COPY, since it is gone and the handoff still asks
// for it. design_handoff_member_benchmark_v1's README specified a line under
// the number for three of the four results ("That is the training showing
// up." on a tier gain, "Same tier, and you held it. That counts." when held,
// "On the board. Now you have something to chase." with no prior data) and
// nothing on a variation move, reasoning that there the pill says it all.
//
// Terra cut all three on her first run through it. That reasoning is the rule
// now, applied to every result rather than just one: the pill above already
// names what happened, and a sentence of encouragement under a 124px number
// reads as padding. `celebrationCopy` was deleted rather than left returning
// an empty string for every case.

// "28 sec eccentric" / "15 reps at 45 lb" — the unit belongs to the tier the
// bell is sitting on, so it moves when she moves the bell.
export function unitLabel(movement, entry, { withLoad = true } = {}) {
  if (!entry?.tier) return "";
  const unit = tierUnit(movement, entry.tier);
  if (withLoad && LIFTS[movement].load && entry.load) return `${unit} at ${entry.load} lb`;
  return unit;
}

export function completedMovements(board) {
  return MOVEMENTS.filter((m) => board?.[m]?.completedAt);
}
