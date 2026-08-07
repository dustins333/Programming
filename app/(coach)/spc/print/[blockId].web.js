import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getUser } from "../../../../lib/programming/clients";
import { getSpcBlock, listBlocksForSpcClient, listSpcWorkoutsForBlock, labelBlocks } from "../../../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../../../lib/programming/spcWorkouts";
import { formatDateMDY } from "../../../../lib/formatDate";

// Web-only print/export view matching the gym's paper SPC Template layout
// (spec §4): warm-up as a numbered 1-6 list with Sets/Reps/Notes, main
// session as an exercise table with Sets/Reps/Rest + coach initials/date.
// Reached from SPC History's "Print" button, which asks which session
// first (components/PrintSessionPickerModal.js) — so this always renders
// exactly ONE session, never a whole block's worth back to back. Each week
// that session spans gets its own stacked table on the same page, since
// exercises can now differ week to week (SPC is no longer one recurring
// session with just numbers changing per week) — there's no single shared
// exercise list to lay out as one grid anymore.
export default function SpcSessionPrintView() {
  const { blockId, session: sessionParam } = useLocalSearchParams();
  const router = useRouter();
  const sessionNumber = Number(sessionParam);
  const [block, setBlock] = useState(null);
  const [blockLabel, setBlockLabel] = useState(null);
  const [member, setMember] = useState(null);
  const [weeks, setWeeks] = useState(null); // [{ weekNumber, workout, warmups, exercises }]
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const b = await getSpcBlock(blockId);
      const [memberRow, allWorkouts, siblingBlocks] = await Promise.all([
        getUser(b.spc_client_id),
        listSpcWorkoutsForBlock(blockId),
        listBlocksForSpcClient(b.spc_client_id),
      ]);
      const sessionWorkouts = allWorkouts
        .filter((w) => w.session_number === sessionNumber)
        .sort((a, c) => a.week_number - c.week_number);
      const weekData = await Promise.all(
        sessionWorkouts.map(async (w) => {
          const [warmups, exercises] = await Promise.all([listSpcWarmups(w.id), listSpcWorkoutExercises(w.id)]);
          return { weekNumber: w.week_number, workout: w, warmups, exercises };
        })
      );
      setBlock(b);
      setBlockLabel(labelBlocks(siblingBlocks).find((sb) => sb.id === b.id)?.label ?? "SPC Program");
      setMember(memberRow);
      setWeeks(weekData);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId, sessionNumber]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>Something went wrong: {loadError}</div>
        <button onClick={load} style={{ fontFamily: "sans-serif", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!block || !member || !weeks) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#222", padding: 24 }}>
      <style>{`
        @media print {
          .no-print { display: none; }
        }
        table.spc-table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        table.spc-table th, table.spc-table td { border: 1px solid #999; padding: 4px 6px; font-size: 12px; text-align: left; }
        table.spc-table th { background: #f2ece7; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 16 }}>
        <button onClick={() => router.back()} style={{ padding: "8px 14px" }}>
          ← Back
        </button>
        <button onClick={() => window.print()} style={{ padding: "8px 14px", background: "#a46a57", color: "white", border: "none", borderRadius: 6 }}>
          Print
        </button>
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>
        {member.name} — {blockLabel} — Session {sessionNumber}
      </h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
        {formatDateMDY(block.block_start_date)} → {formatDateMDY(block.block_end_date)} · {block.block_length_weeks} weeks
      </p>

      {weeks.length === 0 ? (
        <p>This session doesn't exist in this block.</p>
      ) : (
        weeks.map(({ weekNumber, workout, warmups, exercises }) => (
          <div key={workout.id} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>
              Week {weekNumber}
              {workout.title ? ` — ${workout.title}` : ""}
            </h2>

            <h3 style={{ fontSize: 13, marginBottom: 4 }}>Warm-up</h3>
            <table className="spc-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }}>#</th>
                  <th>Exercise</th>
                  <th style={{ width: 60 }}>Sets</th>
                  <th style={{ width: 60 }}>Reps</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => {
                  const w = warmups.find((row) => row.position === n);
                  return (
                    <tr key={n}>
                      <td>{n}</td>
                      <td>{w?.exercises?.name ?? w?.label ?? ""}</td>
                      <td>{w?.sets ?? ""}</td>
                      <td>{w?.reps ?? ""}</td>
                      <td>{w?.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 style={{ fontSize: 13, marginBottom: 4 }}>Main Session</h3>
            <table className="spc-table">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th style={{ width: 50 }}>Sets</th>
                  <th style={{ width: 60 }}>Reps</th>
                  <th style={{ width: 90 }}>Rest</th>
                </tr>
              </thead>
              <tbody>
                {exercises.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No exercises</td>
                  </tr>
                ) : (
                  exercises.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.exercises?.name}</td>
                      <td>{ex.sets ?? ""}</td>
                      <td>{ex.reps ?? ""}</td>
                      <td>{ex.rest ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
