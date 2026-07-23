import { Fragment, useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getUser } from "../../../../lib/programming/clients";
import { getSpcBlock, listBlocksForSpcClient, listSpcWorkoutsForBlock, labelBlocks } from "../../../../lib/programming/spcBlocks";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../../../lib/programming/spcWorkouts";
import { formatDateMDY } from "../../../../lib/formatDate";

// Web-only print/export view matching the gym's paper SPC Template layout
// (spec §4): warm-up as a numbered 1-6 list with Sets/Reps/Notes, main
// session as exercise rows x week columns with Sets/Reps/Rest + coach
// initials/date per week. One session per printed page. This is the
// interim replacement for the paper workflow until Kiosk Mode (Phase 6).
export default function SpcBlockPrintView() {
  const { blockId } = useLocalSearchParams();
  const router = useRouter();
  const [block, setBlock] = useState(null);
  const [blockLabel, setBlockLabel] = useState(null);
  const [member, setMember] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const b = await getSpcBlock(blockId);
      const [memberRow, workouts, siblingBlocks] = await Promise.all([
        getUser(b.spc_client_id),
        listSpcWorkoutsForBlock(blockId),
        listBlocksForSpcClient(b.spc_client_id),
      ]);
      const sessionData = await Promise.all(
        workouts.map(async (w) => {
          const [warmups, exercises] = await Promise.all([listSpcWarmups(w.id), listSpcWorkoutExercises(w.id)]);
          return { workout: w, warmups, exercises };
        })
      );
      setBlock(b);
      setBlockLabel(labelBlocks(siblingBlocks).find((sb) => sb.id === b.id)?.label ?? "SPC Program");
      setMember(memberRow);
      setSessions(sessionData);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [blockId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#b91c1c" }}>Something went wrong: {loadError}</div>;
  }

  if (!block || !member || !sessions) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;
  }

  const weekNumbers = Array.from({ length: block.block_length_weeks }, (_, i) => i + 1);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#222", padding: 24 }}>
      <style>{`
        @media print {
          .no-print { display: none; }
          .spc-session { break-after: page; }
        }
        table.spc-table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
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
        {member.name} — {blockLabel}
      </h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
        {formatDateMDY(block.block_start_date)} → {formatDateMDY(block.block_end_date)} · {block.block_length_weeks} weeks
      </p>

      {sessions.map(({ workout, warmups, exercises }) => (
        <div key={workout.id} className="spc-session">
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Session {workout.session_number}</h2>

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
                {weekNumbers.map((n) => (
                  <th key={n} colSpan={3}>
                    Week {n}
                  </th>
                ))}
              </tr>
              <tr>
                <th></th>
                {weekNumbers.map((n) => (
                  <Fragment key={n}>
                    <th>Sets</th>
                    <th>Reps</th>
                    <th>Rest</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercises.map((ex) => {
                const weeksByNumber = Object.fromEntries(ex.spc_exercise_weeks.map((w) => [w.week_number, w]));
                return (
                  <tr key={ex.id}>
                    <td>{ex.exercises?.name}</td>
                    {weekNumbers.map((n) => {
                      const w = weeksByNumber[n];
                      return (
                        <Fragment key={n}>
                          <td>{w?.sets ?? ""}</td>
                          <td>{w?.reps ?? ""}</td>
                          <td>
                            {w?.rest ?? ""}
                            {w?.coach_initials ? (
                              <div style={{ fontSize: 9, color: "#777" }}>
                                {w.coach_initials} {formatDateMDY(w.touched_date)}
                              </div>
                            ) : null}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
