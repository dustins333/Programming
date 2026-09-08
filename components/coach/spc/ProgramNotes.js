import { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listComments, addComment, updateComment, deleteComment } from "../../../lib/programming/comments";
import { useSpcNotesOpen, setSpcNotesOpen } from "../../../lib/spcNotesPref";
import { dateInBoise } from "../../../lib/boiseDate";
import { formatDateMDShort } from "../../../lib/formatDate";
import { NoteField } from "../../CommentThread";
import { PressFade } from "../../PressFade";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { confirmDeleteCoachNote } from "../../../lib/confirmDialog";

// The SPC page's coach-to-coach thread (programming.program_comments, scoped
// to one spc_block), in the collapsed-row idiom rather than CommentThread's
// standalone card.
//
// WHY THIS EXISTS SEPARATELY FROM CommentThread. The page carried two things
// both labelled COACH NOTES, both a grey box with a textarea in it, and they
// are not the same feature:
//
//   spc_clients.notes_goals_feedback — one field on the client row. No
//     author, no date, last write wins, true across every program. That one
//     is now KEEP IN MIND, in the goal hero.
//   program_comments (this)          — attributed, dated, appended, scoped to
//     the block, and it goes into History with the program when it closes.
//
// Rendering them identically is what made them read as one feature drawn
// twice. CommentThread keeps its card shape for the builders and the group
// pages; this is the same data in a row that folds away.
//
// DEVIATION FROM THE MOCK, deliberate: the mock draws no edit or delete on a
// note. Both exist today (CommentThread gained them 2026-08-21) and dropping
// them would be a silent loss of function, so they are kept — moved onto the
// byline row, which sits under the body here rather than above it.

const HAIRLINE = "#f4f1ec";

function byline(note) {
  const when = note.created_at ? ` | ${formatDateMDShort(dateInBoise(new Date(note.created_at)))}` : "";
  return `${note.coachName}${when}`;
}

function ControlButton({ icon, onPress, disabled, label }) {
  return (
    <PressFade onPress={onPress} disabled={disabled} hitSlop={8} accessibilityLabel={label} style={{ opacity: disabled ? 0.5 : 1, padding: 2 }}>
      <Ionicons name={icon} size={14} color="#a8a29e" />
    </PressFade>
  );
}

// Body first, byline under it. The reverse of CommentThread's row, and the
// reason is that these are read as a run of remarks rather than a list of
// authors: what was said is the thing being scanned, who said it is the
// footnote.
function NoteRow({ note, canEdit, onChanged, last }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.comment_text);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === note.comment_text) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await updateComment(note.id, trimmed);
      setEditing(false);
      await onChanged();
    } catch (err) {
      // Stays open with the edit intact — closing would bin it and there is
      // no way to get the text back.
      toastError("Couldn't save the note", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!(await confirmDeleteCoachNote(note.comment_text))) return;
    setBusy(true);
    try {
      await deleteComment(note.id);
      await onChanged();
    } catch (err) {
      toastError("Couldn't delete the note", err);
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        paddingBottom: 12,
        marginBottom: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
    >
      {editing ? (
        <>
          <NoteField value={text} onChangeText={setText} autoFocus height={92} />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <PressFade
              onPress={() => setEditing(false)}
              disabled={busy}
              style={{ opacity: busy ? 0.5 : 1, borderWidth: 1, borderColor: colors.coachCardBorder, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted }}>Cancel</Text>
            </PressFade>
            <PressFade
              onPress={handleSave}
              disabled={busy || !text.trim()}
              style={{ opacity: busy || !text.trim() ? 0.5 : 1, backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>{busy ? "Saving…" : "Save"}</Text>
            </PressFade>
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.text }}>{note.comment_text}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e" }}>
              {byline(note)}
            </Text>
            {canEdit ? <ControlButton icon="create-outline" label="Edit note" onPress={() => setEditing(true)} disabled={busy} /> : null}
            <ControlButton icon="trash-outline" label="Delete note" onPress={handleDelete} disabled={busy} />
          </View>
        </>
      )}
    </View>
  );
}

// Read-only, on the peach ground, for a finished run in History. No compose:
// the thread belongs to a program that has closed.
export function ProgramNotesPanel({ notes }) {
  return (
    <View style={{ backgroundColor: "#fdf6f2", borderTopWidth: 1, borderTopColor: "#f0ddd2", paddingHorizontal: 16, paddingTop: 13, paddingBottom: 14 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e", marginBottom: 11 }}>
        PROGRAM NOTES
      </Text>
      {notes.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>No notes on this program.</Text>
      ) : (
        notes.map((note, i) => (
          <View
            key={note.id}
            style={{
              paddingBottom: 11,
              marginBottom: i === notes.length - 1 ? 0 : 11,
              borderBottomWidth: i === notes.length - 1 ? 0 : 1,
              borderBottomColor: "#f0ebe4",
            }}
          >
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.text }}>{note.comment_text}</Text>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", marginTop: 5 }}>{byline(note)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// The live thread. `variant` is only framing: "inline" sits inside a card
// that already has padding (the foot of Overview's CURRENT PROGRAM), "card"
// is its own white card among the session cards on the Sessions tab.
export function ProgramNotesRow({ spcBlockId, coachId, variant = "inline", style }) {
  const open = useSpcNotesOpen();
  const [notes, setNotes] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setNotes(await listComments({ spcBlockId }));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [spcBlockId]);

  // On mount, not on open. The count is the whole reason to open the row —
  // a shut row with no number on it gives a coach nothing to act on — and
  // only the active tab is mounted, so this is one small query per visit.
  useEffect(() => {
    load();
  }, [load]);

  const handlePost = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await addComment({ spcBlockId, coachId, commentText: trimmed });
      setDraft("");
      await load();
    } catch (err) {
      toastError("Couldn't post the note", err);
    } finally {
      setPosting(false);
    }
  };

  const card = variant === "card";
  const padH = card ? 14 : 0;
  // Blank rather than "0 notes" while it is still loading: a count that
  // settles from one number to another is worse than one that arrives late.
  const count = notes == null ? null : notes.length;

  return (
    <View
      style={[
        card
          ? { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.coachCardBorder, borderRadius: 14 }
          : { borderTopWidth: 1, borderTopColor: HAIRLINE, marginTop: 12 },
        style,
      ]}
    >
      <PressFade
        onPress={() => setSpcNotesOpen(!open)}
        accessibilityLabel={open ? "Hide notes" : "Show notes"}
        style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, paddingHorizontal: padH }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#57534e" }}>Notes</Text>
        <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
          {count == null ? "" : count === 0 ? "None yet" : `${count} note${count === 1 ? "" : "s"}`}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color="#c9c4bd" />
      </PressFade>

      {open ? (
        <View style={{ paddingHorizontal: padH, paddingBottom: card ? 14 : 2 }}>
          {loadError ? (
            <View style={{ paddingTop: 2, paddingBottom: 10 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#b23a22", marginBottom: 6 }}>
                Couldn't load notes: {loadError}
              </Text>
              <PressFade onPress={load} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Retry</Text>
              </PressFade>
            </View>
          ) : notes == null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 14, alignSelf: "flex-start" }} />
          ) : (
            <View style={{ paddingTop: 12 }}>
              {notes.map((note, i) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  canEdit={note.coach_id === coachId}
                  onChanged={load}
                  last={i === notes.length - 1}
                />
              ))}
            </View>
          )}

          <NoteField
            value={draft}
            onChangeText={setDraft}
            placeholder="Leave a note for other coaches…"
            height={52}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 9 }}>
            <PressFade
              onPress={handlePost}
              disabled={posting || !draft.trim()}
              style={{
                opacity: posting || !draft.trim() ? 0.5 : 1,
                backgroundColor: colors.primary,
                borderRadius: 9,
                paddingVertical: 9,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>
                {posting ? "Adding…" : "Add note"}
              </Text>
            </PressFade>
          </View>
        </View>
      ) : null}
    </View>
  );
}
