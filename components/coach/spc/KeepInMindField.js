import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { updateSpcClient } from "../../../lib/programming/spcClients";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";

// KEEP IN MIND — spc_clients.notes_goals_feedback. One field on the client
// row: injuries, cues, what she responds to. Coach-only, and true across
// every program she has ever been on.
//
// As of 2026-09-08 this is the ONLY free-text note a coach writes about an
// SPC client, alongside the per-exercise EXERCISE NOTE in the builder. The
// block-scoped thread (programming.program_comments) is gone from every SPC
// surface at the coaches' request — two boxes both called notes, one dated
// and attributed and one not, was a distinction nobody was reading.
//
// Extracted out of ClientContextBand so the phone frame, the native builder
// and the mobile block overview render the SAME field rather than a
// lookalike. That component's own header records what happens otherwise:
// the last time this field was drawn in two places the two drifted into
// looking like two different features.
//
// ---------------------------------------------------------------------
// Two properties worth keeping if this is ever touched
// ---------------------------------------------------------------------
//   `value === undefined` means "not loaded yet", distinct from null ("she
//   has none"), and the box seeds from it exactly ONCE per client. Every
//   host re-runs its load() while this can be open — the builder on every
//   prev/next session, the client page after any save — and a re-seed there
//   wipes whatever the coach is halfway through typing. Hosts get the
//   undefined for free: a not-yet-loaded client row is null, and
//   `null?.notes_goals_feedback` is undefined.
//
//   It saves on blur AND flushes on unmount. Blur covers the ordinary case;
//   the unmount flush covers leaving the page with the cursor still in the
//   box. Coach notes have been lost to exactly that before, on a field that
//   only saved on an explicit action.

const CARD_BORDER = "#ece7e1";
// On the clay hero the label has to read against a dark ground; standing on
// its own card it is the app's ordinary eyebrow.
const ON_CLAY = "#f0d9d0";
const ON_WHITE = "#a8a29e";

export function KeepInMindField({ userId, value, onSaved, onClay = false, minHeight = 58 }) {
  const [draft, setDraft] = useState("");
  // What is actually persisted, and what is in the box right now. Refs
  // because the unmount flush below runs after the last render and would
  // otherwise close over a stale draft.
  const savedRef = useRef("");
  const draftRef = useRef("");
  const seededFor = useRef(null);

  useEffect(() => {
    if (!userId || value === undefined || seededFor.current === userId) return;
    seededFor.current = userId;
    const initial = value ?? "";
    savedRef.current = initial;
    draftRef.current = initial;
    setDraft(initial);
  }, [userId, value]);

  const commit = async () => {
    const next = draftRef.current;
    if (next === savedRef.current) return;
    try {
      await updateSpcClient(userId, { notes_goals_feedback: next });
      savedRef.current = next;
      onSaved?.(next);
      toastSuccess("Saved");
    } catch (err) {
      // The text stays in the box — closing over it would bin what they
      // typed and there is no way to get it back.
      toastError("Couldn't save", err);
    }
  };

  useEffect(
    () => () => {
      if (draftRef.current !== savedRef.current) {
        updateSpcClient(userId, { notes_goals_feedback: draftRef.current }).catch(() => {});
      }
    },
    [userId]
  );

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <Ionicons name="lock-closed" size={11} color={onClay ? ON_CLAY : ON_WHITE} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: onClay ? ON_CLAY : ON_WHITE }}>
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
          minHeight,
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
  );
}

// The same field standing on its own white card, for the surfaces with no
// goal hero to sit inside: the phone client page, the native builder and
// the mobile block overview.
export function KeepInMindCard({ userId, value, onSaved, style }) {
  return (
    <View
      style={[
        { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.coachCardBorder, borderRadius: 14, padding: 14 },
        style,
      ]}
    >
      <KeepInMindField userId={userId} value={value} onSaved={onSaved} />
    </View>
  );
}
