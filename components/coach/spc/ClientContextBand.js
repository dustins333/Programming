import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClientGoalCard } from "../../ClientGoalCard";
import { updateSpcClient } from "../../../lib/programming/spcClients";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";

// The two standing facts about an SPC client, as one band: what she is
// WORKING TOWARD, and what to KEEP IN MIND while you write for her.
//
// It is a property of the client, not of the page — so it is the same box,
// with the same wording and the same ability to edit, wherever a coach meets
// it. It exists as a component precisely so the client page and the session
// builder cannot drift into two versions of it, which is what happened the
// last time this field was rendered in two places (see ProgramNotes.js for
// that story).
//
//   goal        client_goals, shared with the member — she reads the same
//               card on her own session.
//   keepInMind  spc_clients.notes_goals_feedback, coach-only. Injuries,
//               cues, what she responds to. NOT the block-scoped Notes
//               thread, which is dated, attributed and belongs to one
//               program.
//
// `keepInMind === undefined` means "not loaded yet" and is distinct from null
// ("loaded, she has none"). Both hosts get that for free — a not-yet-loaded
// client row is null, and `null?.notes_goals_feedback` is undefined.
const CARD_BORDER = "#ece7e1";

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
  const [draft, setDraft] = useState("");
  // What is actually persisted, and what is in the box right now. Refs
  // because the unmount flush below runs after the last render and would
  // otherwise close over a stale draft.
  const savedRef = useRef("");
  const draftRef = useRef("");
  const seededFor = useRef(null);

  // Seeded ONCE per client, never re-seeded from the prop afterwards. Both
  // hosts re-run their load() while this box can be open — the builder on
  // every prev/next session, the client page after any save — and a re-seed
  // there would wipe whatever the coach is halfway through typing.
  useEffect(() => {
    if (!userId || keepInMind === undefined || seededFor.current === userId) return;
    seededFor.current = userId;
    const initial = keepInMind ?? "";
    savedRef.current = initial;
    draftRef.current = initial;
    setDraft(initial);
  }, [userId, keepInMind]);

  const commit = async () => {
    const next = draftRef.current;
    if (next === savedRef.current) return;
    try {
      await updateSpcClient(userId, { notes_goals_feedback: next });
      savedRef.current = next;
      onKeepInMindSaved?.(next);
      toastSuccess("Saved");
    } catch (err) {
      // The text stays in the box — closing over it would bin what they typed
      // and there is no way to get it back.
      toastError("Couldn't save", err);
    }
  };

  // Blur covers the ordinary case; this covers leaving the page with the
  // cursor still in the box. Coach notes have been lost to exactly that
  // before, on a field that only saved on an explicit action.
  useEffect(
    () => () => {
      if (draftRef.current !== savedRef.current) {
        updateSpcClient(userId, { notes_goals_feedback: draftRef.current }).catch(() => {});
      }
    },
    [userId]
  );

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
      aside={
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <Ionicons name="lock-closed" size={11} color="#f0d9d0" />
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: "#f0d9d0" }}>
              KEEP IN MIND
            </Text>
          </View>
          <TextInput
            value={draft}
            onChangeText={(v) => {
              draftRef.current = v;
              setDraft(v);
            }}
            onBlur={commit}
            multiline
            placeholder="Injuries, cues, what she responds to…"
            placeholderTextColor={colors.hint}
            style={{
              minHeight: 58,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 8,
              padding: 9,
              fontFamily: fonts.sans,
              fontSize: 12.5,
              color: "#2a211c",
              textAlignVertical: "top",
            }}
          />
        </>
      }
    />
  );
}
