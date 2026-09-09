import { ClientGoalCard } from "../../ClientGoalCard";
import { KeepInMindField } from "./KeepInMindField";

// The two standing facts about an SPC client, as one band: what she is
// WORKING TOWARD, and what to KEEP IN MIND while you write for her.
//
// It is a property of the client, not of the page — so it is the same box,
// with the same wording and the same ability to edit, wherever a coach meets
// it. It exists as a component precisely so the client page and the session
// builder cannot drift into two versions of it, which is what happened the
// last time this field was rendered in two places, when a second box also
// called COACH NOTES sat beside it.
//
//   goal        client_goals, shared with the member — she reads the same
//               card on her own session.
//   keepInMind  spc_clients.notes_goals_feedback, coach-only. Injuries,
//               cues, what she responds to. Since 2026-09-08 it is the only
//               free-text note on an SPC client at all — the block-scoped
//               thread is gone.
//
// The field itself lives in KeepInMindField, because the surfaces with no
// goal hero (phone, native builder, mobile block overview) render the same
// box on its own card. Its header carries the seed-once and unmount-flush
// rules that make it safe to mount anywhere.

export function ClientContextBand({
  userId,
  clientName,
  editorId,
  goal,
  keepInMind,
  // The host keeps its own copy in step; neither is required.
  onGoalSaved,
  onKeepInMindSaved,
  style,
}) {
  return (
    <ClientGoalCard
      goal={goal}
      userId={userId}
      clientName={clientName}
      editable
      editorId={editorId}
      onSaved={onGoalSaved}
      wide
      style={style}
      aside={<KeepInMindField userId={userId} value={keepInMind} onSaved={onKeepInMindSaved} onClay />}
    />
  );
}
