import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import {
  getActiveBenchmarkEvent,
  getPreviousBenchmarkEvent,
  getBenchmarkBoard,
  benchmarkPhase,
  isLoggingOpen,
} from "./benchmark";

// One loader for all three Benchmark Day screens. They ask the same three
// questions — which event is live, what has she logged, is logging still open
// — and three copies of that is three chances for the hub to disagree with the
// movement card about whether a bell is locked.
//
// useFocusEffect rather than a mount-only effect: the member app keeps tab
// screens mounted, and coming back from a movement card has to pick up the
// bell she just placed.
export function useBenchmark() {
  const { profile } = useAuth();
  const [state, setState] = useState({ status: "loading", event: null, board: null, last: null });

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const event = await getActiveBenchmarkEvent();
      if (!event) {
        setState({ status: "none", event: null, board: null, last: null });
        return;
      }
      const previous = await getPreviousBenchmarkEvent(event);
      const { current, last } = await getBenchmarkBoard(profile.id, event, previous);
      setState({ status: "ready", event, board: current, last });
    } catch (err) {
      console.error("Benchmark: failed to load", err);
      setState({ status: "error", event: null, board: null, last: null });
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return {
    ...state,
    phase: benchmarkPhase(state.event),
    loggingOpen: isLoggingOpen(state.event),
    reload: load,
    setBoard: (updater) => setState((s) => ({ ...s, board: typeof updater === "function" ? updater(s.board) : updater })),
    setLast: (updater) => setState((s) => ({ ...s, last: typeof updater === "function" ? updater(s.last) : updater })),
  };
}
