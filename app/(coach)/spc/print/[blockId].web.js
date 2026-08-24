import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getUser } from "../../../../lib/programming/clients";
import { getSpcBlock, listSpcWorkoutsForBlock } from "../../../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../../../lib/programming/spcWorkouts";
import { schemeLabel } from "../../../../components/builder/SessionBuilderParts";
import { liftLabelsFor, warmupNumbersFor } from "../../../../lib/programming/sessionLabels";

// Web-only print view reproducing the gym's paper "SPC TEMPLATE" Google
// Sheet (Team Kova/SPC) for ONE session of ONE block, one landscape Letter
// page per printed sheet:
//
//   ┌──────────────────────── CLIENT NAME ────────────────────────┐
//   │ Warm up | Sets | Reps | Notes:                              │
//   │ 1..6                                                        │
//   │ Main Session | Sets | Reps | Rest | Week 1 | Week 2 | ...   │
//   │ A / B / C / E1 / E2 ...        (week cols left blank —      │
//   │                                 coach hand-writes weights)  │
//   └─────────────────────────────────────────────────────────────┘
//
// The paper template assumes the same exercises every week (the week
// columns exist for handwriting). In the app each week of an SPC block is
// its own spc_workouts row and can differ, so weeks are grouped into runs
// of identical exercise lists (same lifts, same order, same superset
// pairing, same warm-ups): each run is one page whose week columns are
// exactly the weeks in that run. Identical all block long → one classic
// page with 4 week columns; a change in week 3 → two pages. Sets/reps/rest
// come from the run's first week; a later week in the run whose numbers
// differ gets a small "4 × 8" line at the top of its column so the space
// underneath is still writable.
//
// Reached from the SPC client page / Past blocks "Print" button, which
// opens this in a NEW TAB and this page auto-launches the browser print
// dialog (Landscape/Letter preset via @page) — "Save as PDF" is one click.

const PAGE_W_IN = 11;
const PAGE_H_IN = 8.5;
const MARGIN_IN = 0.4;
const CONTENT_W_IN = PAGE_W_IN - MARGIN_IN * 2;
const CONTENT_H_IN = PAGE_H_IN - MARGIN_IN * 2;

// Column proportions lifted from the sheet's own column widths
// (A 13.6 / C 51.9 / D ~8.4 / E 14.4 / F 16.1 / G-J 33.1 each).
const COL = { num: 5.5, name: 24, sets: 6, reps: 8.5, rest: 8 };
const MIN_MAIN_ROWS = 6;
const WARMUP_ROWS = 6;

export const PRINT_CSS = `
        /* Keep this exactly "letter landscape": pairing explicit inch
           dimensions with the landscape keyword made Chrome emit PORTRAIT
           (612x792), verified via headless --print-to-pdf. */
        @page { size: letter landscape; margin: ${MARGIN_IN}in; }
        html, body, #root { background: #d9d5cf; }
        .spc-print-root { font-family: Arial, Helvetica, sans-serif; color: #000; min-height: 100vh; padding: 20px 0 40px; }
        .toolbar { display: flex; gap: 12px; align-items: center; justify-content: center; margin-bottom: 18px; font-size: 13px; color: #44403c; }
        .toolbar button { padding: 8px 16px; border-radius: 6px; border: 1px solid #a8a29e; background: #fff; cursor: pointer; font-family: inherit; font-size: 13px; }
        .toolbar button.primary { background: #a46a57; border-color: #a46a57; color: #fff; }
        .page {
          box-sizing: border-box; background: #fff; width: ${CONTENT_W_IN}in; height: ${CONTENT_H_IN}in;
          margin: 0 auto 24px; display: flex; flex-direction: column;
          box-shadow: 0 2px 12px rgba(0,0,0,0.18);
          border: 3px solid #000;
        }
        .client-name { flex: 0 0 auto; height: 0.85in; display: flex; align-items: baseline; justify-content: flex-start;
          padding: 0 0.18in; font-size: 30pt; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; border-bottom: 3px solid #000;
          line-height: 0.85in; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Same size as the name; only the weight differs (name bold, title
           regular, bar regular) — per Terra, a 34pt name next to a small
           bar and a smaller title read as three different things. */
        .client-name .session-title { font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: 0.18in; }
        .client-name .session-title::before { content: "|"; margin-right: 0.18in; font-weight: 400; }
        .grid { display: grid; }
        .cell { box-sizing: border-box; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 6px; display: flex; align-items: center; overflow: hidden; }
        .cell.last { border-right: none; }
        .cell.head { font-weight: 700; font-size: 13pt; }
        .cell.center { justify-content: center; text-align: center; }
        .cell.top { align-items: flex-start; }
        .cell.wrap { white-space: pre-wrap; line-height: 1.15; }
        .warm { flex: 0 0 auto; display: grid; grid-auto-rows: 0.36in; }
        .warm .row { display: contents; }
        .warm .notes { grid-column: 5; grid-row: 1 / span ${WARMUP_ROWS + 1}; border-right: none; align-items: flex-start; }
        .warm .cell { font-size: 11pt; padding-top: 1px; padding-bottom: 1px; }
        .warm .cell.wrap { line-height: 1.1; }
        .main { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
        .main .head-row { flex: 0 0 auto; height: 0.7in; }
        .main .body { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
        .main .body .row { flex: 1 1 0; min-height: 0; }
        .main .body .row:last-child .cell { border-bottom: none; }
        .main .body .cell { font-size: 15pt; }
        .weekhead { flex-direction: column; align-items: flex-start !important; justify-content: flex-start; line-height: 1.25; }
        .weekhead .sub { font-weight: 400; font-size: 11pt; }
        .weeknote { font-size: 9.5pt; color: #333; align-self: flex-start; }
        .empty-note { padding: 24px; text-align: center; font-size: 14pt; }
        @media print {
          .no-print { display: none !important; }
          /* Expo's ScrollViewStyleReset pins html/body/#root to height:100%
             with body overflow:hidden. Chrome prints through that fine;
             Safari clips the printout to that hidden box and emits a BLANK
             page (a real 1.2KB "test.pdf" with an empty content stream).
             Print media has to undo it. */
          html, body, #root { background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
          .spc-print-root { display: block; }
          .page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .spc-print-root { padding: 0; min-height: 0; }
          .page { box-shadow: none; margin: 0; page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: auto; break-after: auto; }
        }
`;

function warmupName(w) {
  return w?.exercises?.name ?? w?.label ?? "";
}

// The session row's own sets/reps first; a warm-up added before its library
// entry had a default falls back to that default rather than printing blank.
function warmupSets(w) {
  return w.sets ?? w.exercises?.default_sets ?? "";
}
function warmupReps(w) {
  return w.reps ?? w.exercises?.default_reps ?? "";
}

// Superset letters the way the paper does it: A, B, C for singles, E1/E2
// for the two halves of a superset (both share the letter). Backed by the
// shared labeler so the sheet, the builders, and the member app can't
// drift on what a lift is called.
function labelExercises(exercises) {
  const labels = liftLabelsFor(exercises);
  return exercises.map((ex) => ({ ...ex, label: labels[ex.id] }));
}

// What makes two weeks "the same page": lifts, order, superset pairing,
// and warm-ups. Sets/reps/rest deliberately excluded — those vary week to
// week by design and are annotated per column instead of splitting pages.
function weekSignature(week) {
  let groupSeq = 0;
  const seen = new Map();
  const ex = week.exercises.map((e) => {
    let g = "";
    if (e.superset_group_id) {
      if (!seen.has(e.superset_group_id)) seen.set(e.superset_group_id, ++groupSeq);
      g = `s${seen.get(e.superset_group_id)}`;
    }
    return `${e.exercise_id}${g}`;
  });
  // Warm-up superset grouping is part of the signature too — repairing the
  // warm-ups mid-block changes the printed numbering, so those weeks get
  // their own page rather than silently sharing one.
  const wu = week.warmups.map((w) => {
    let g = "";
    if (w.superset_group_id) {
      if (!seen.has(w.superset_group_id)) seen.set(w.superset_group_id, ++groupSeq);
      g = `s${seen.get(w.superset_group_id)}`;
    }
    return `${w.exercise_id ?? ""}|${(w.label ?? "").trim()}${g}`;
  });
  return JSON.stringify([ex, wu]);
}

function groupIntoRuns(weeks) {
  const runs = [];
  for (const week of weeks) {
    const sig = weekSignature(week);
    const last = runs[runs.length - 1];
    if (last && last.sig === sig) last.weeks.push(week);
    else runs.push({ sig, weeks: [week] });
  }
  return runs;
}

function prescription(ex) {
  return `${schemeLabel(ex)}${ex.rest ? ` · ${ex.rest}` : ""}`;
}

export default function SpcSessionPrintView() {
  const { blockId, session: sessionParam } = useLocalSearchParams();
  const router = useRouter();
  const sessionNumber = Number(sessionParam);
  const [member, setMember] = useState(null);
  const [weeks, setWeeks] = useState(null); // [{ weekNumber, workout, warmups, exercises }]
  const [loadError, setLoadError] = useState(null);
  const printedRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const b = await getSpcBlock(blockId);
      const [memberRow, allWorkouts] = await Promise.all([getUser(b.spc_client_id), listSpcWorkoutsForBlock(blockId)]);
      const sessionWorkouts = allWorkouts
        .filter((w) => w.session_number === sessionNumber)
        .sort((a, c) => a.week_number - c.week_number);
      const weekData = await Promise.all(
        sessionWorkouts.map(async (w) => {
          const [warmups, exercises] = await Promise.all([listSpcWarmups(w.id), listSpcWorkoutExercises(w.id)]);
          return { weekNumber: w.week_number, workout: w, warmups, exercises };
        })
      );
      setMember(memberRow);
      setWeeks(weekData);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId, sessionNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const runs = useMemo(() => (weeks ? groupIntoRuns(weeks) : []), [weeks]);

  // Auto-open the print dialog once, once the pages are on screen. The
  // small delay lets the browser lay out the pages first — printing in the
  // same tick as the render has produced blank previews in Chrome.
  useEffect(() => {
    if (!member || !weeks || weeks.length === 0 || printedRef.current) return;
    printedRef.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [member, weeks]);

  // Opened in a new tab from the SPC page, so Close is the natural exit;
  // a direct/stale link (no opener) falls back to normal navigation.
  const closeOrBack = () => {
    if (window.opener) {
      window.close();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.push("/(coach)/spc");
  };

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>Something went wrong: {loadError}</div>
        <button onClick={load} style={{ cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!member || !weeks) {
    return <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>Loading…</div>;
  }

  return (
    <div className="spc-print-root">
      <style>{PRINT_CSS}</style>

      <div className="toolbar no-print">
        <button onClick={closeOrBack}>‹ Close</button>
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <span>
          {member.name} · Session {sessionNumber} · {runs.length} page{runs.length === 1 ? "" : "s"} · Letter, landscape
        </span>
      </div>

      {weeks.length === 0 ? (
        <div className="page">
          <div className="client-name">{member.name}</div>
          <div className="empty-note">This session doesn't exist in this block.</div>
        </div>
      ) : (
        runs.map((run, runIdx) => (
          <PrintPage key={runIdx} name={member.name} run={run} />
        ))
      )}
    </div>
  );
}

export function PrintPage({ name, run }) {
  const first = run.weeks[0];
  const weekCols = run.weeks;
  const exercises = labelExercises(first.exercises);
  // The builder's "Name this session" title, per week row — first week in
  // the run that has one. Client name stays the header; this is "| title".
  const sessionTitle = run.weeks.map((w) => (w.workout?.title ?? "").trim()).find(Boolean) ?? null;
  // Rows fill top-down in position order. Deliberately NOT keyed on the
  // stored position number — a gap (e.g. positions 1,2,3,5) used to make
  // the fallback repeat one warm-up in two rows.
  const sortedWarmups = [...first.warmups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  // Superset members repeat the shared number; the blank pre-printed rows
  // keep counting from wherever the real warm-ups left off.
  const warmupNumbers = warmupNumbersFor(sortedWarmups);
  const lastWarmupNumber = sortedWarmups.length ? warmupNumbers[sortedWarmups.length - 1] : 0;
  const rowCount = Math.max(MIN_MAIN_ROWS, exercises.length);
  const rows = Array.from({ length: rowCount }, (_, i) => exercises[i] ?? null);

  const weekPct = (100 - COL.num - COL.name - COL.sets - COL.reps - COL.rest) / weekCols.length;
  const mainCols = `${COL.num}% ${COL.name}% ${COL.sets}% ${COL.reps}% ${COL.rest}% ${weekCols.map(() => `${weekPct}%`).join(" ")}`;
  const warmCols = `${COL.num}% ${COL.name}% ${COL.sets}% ${COL.reps}% ${100 - COL.num - COL.name - COL.sets - COL.reps}%`;

  // A later week in this run whose numbers differ from the first week's,
  // keyed by exercise position → per-week annotation.
  const noteFor = (idx, week) => {
    if (week === first) return null;
    const a = first.exercises[idx];
    const b = week.exercises[idx];
    if (!a || !b) return null;
    const pa = prescription(a);
    const pb = prescription(b);
    return pa === pb ? null : pb;
  };

  return (
    <div className="page">
      <FitHeader name={name} sessionTitle={sessionTitle} />

      <div className="warm" style={{ gridTemplateColumns: warmCols }}>
        {/* One tall Notes box beside all six rows — the paper has no
            horizontal rules through it, it's free space for the coach. */}
        <div className="cell head notes">Notes:</div>
        <div className="row head">
          <div className="cell head" style={{ gridColumn: "1 / span 2" }}>
            Warm up
          </div>
          <div className="cell head center">Sets</div>
          <div className="cell head center">Reps</div>
        </div>
        {Array.from({ length: WARMUP_ROWS }, (_, i) => {
          const w = sortedWarmups[i];
          const number = w ? warmupNumbers[i] : lastWarmupNumber + (i - sortedWarmups.length) + 1;
          return (
            <div key={i} className="row">
              <div className="cell center">{number}</div>
              <div className="cell wrap">{w ? warmupName(w) : ""}</div>
              <div className="cell center">{w ? warmupSets(w) : ""}</div>
              <div className="cell center">{w ? warmupReps(w) : ""}</div>
            </div>
          );
        })}
      </div>

      <div className="main">
        <div className="grid head-row" style={{ gridTemplateColumns: mainCols }}>
          <div className="cell head" style={{ gridColumn: "1 / span 2" }}>
            Main Session
          </div>
          <div className="cell head center">Sets</div>
          <div className="cell head center">Reps</div>
          <div className="cell head center">Rest</div>
          {weekCols.map((wk, i) => (
            <div key={wk.weekNumber} className={`cell head weekhead${i === weekCols.length - 1 ? " last" : ""}`}>
              <div>Week {wk.weekNumber}</div>
              <div className="sub">coach:</div>
              <div className="sub">date:</div>
            </div>
          ))}
        </div>
        <div className="body">
          {rows.map((ex, idx) => (
            <div key={ex?.id ?? `blank-${idx}`} className="grid row" style={{ gridTemplateColumns: mainCols }}>
              <div className="cell center">{ex?.label ?? ""}</div>
              <div className="cell wrap">{ex?.exercises?.name ?? ""}</div>
              <div className="cell center">{ex ? ex.rep_scheme?.length ?? ex.sets ?? "" : ""}</div>
              <div className="cell center wrap">{ex ? repsLabel(ex) : ""}</div>
              <div className="cell center">{ex?.rest ?? ""}</div>
              {weekCols.map((wk, i) => {
                const note = ex ? noteFor(idx, wk) : null;
                return (
                  <div key={wk.weekNumber} className={`cell${i === weekCols.length - 1 ? " last" : ""}`}>
                    {note ? <span className="weeknote">{note}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Name and title share ONE font size (name bold, title regular). A long name
// plus a long title won't fit the band at the 30pt default, so shrink the
// whole line until it does rather than clipping the title off the page.
const HEADER_PT = 30;
const HEADER_MIN_PT = 16;
function FitHeader({ name, sessionTitle }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pt = HEADER_PT;
    el.style.fontSize = `${pt}pt`;
    while (el.scrollWidth > el.clientWidth && pt > HEADER_MIN_PT) {
      pt -= 1;
      el.style.fontSize = `${pt}pt`;
    }
  }, [name, sessionTitle]);
  return (
    <div className="client-name" ref={ref}>
      {name}
      {sessionTitle ? <span className="session-title">{sessionTitle}</span> : null}
    </div>
  );
}

// "10" when every set matches, "10,8,8" when they don't — the Reps column
// on paper is one value, so a per-set scheme is written the way a coach
// would by hand.
function repsLabel(ex) {
  const scheme = ex.rep_scheme?.length ? ex.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return unique.length === 1 ? unique[0] : scheme.join(",");
  }
  return ex.reps ?? "";
}
