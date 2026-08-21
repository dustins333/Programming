import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthProvider";
import { listComments, addComment, updateComment, deleteComment } from "../lib/programming/comments";
import { useScrollToKeyboard } from "../lib/scrollToKeyboard";
import { dateInBoise } from "../lib/boiseDate";
import { formatDateMD } from "../lib/formatDate";
import { Eyebrow } from "./Eyebrow";
import { fonts, colors } from "../lib/theme";
import { toastError } from "../lib/toast";
import { confirmDeleteCoachNote } from "../lib/confirmDialog";

// Coach-to-coach notes on a block. Rebuilt 2026-08-21 to the nutrition Focus
// box's shape (rows you can edit and delete in place, an explicit add field
// and button) — minus the checkboxes, since a note isn't a task.
//
// What was wrong with the previous version, and why the layout here is the
// way it is: the draft field and its Post button sat side by side in a
// flex-row. In react-native-web an <input> won't shrink below its intrinsic
// content width without minWidth: 0, so inside the builder's 268px right rail
// the pair overflowed and pushed the button clean off the edge — which read
// as "the field runs off the screen and there's no save button", because
// there wasn't one you could reach. Nothing here puts a text field beside
// anything else: the field is full width and its button sits underneath it.
//
// The old inner max-height ScrollView is gone too — this card is normally
// embedded in a page that owns its own scroller, and a nested one eats the
// drag. There are only ever a handful of notes on a block.
//
// scrollViewRef/scrollOffsetRef are optional (same "embedded" convention
// MessageThread.js uses): pass the host ScrollView's ref pair and a focused
// field scrolls itself above the keyboard on native; omit them and
// useScrollToKeyboard's own null guard makes it a harmless no-op.

const CARD_BORDER = "#ece7e1";
function ControlButton({ icon, onPress, disabled, label }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={label}
      style={{ opacity: disabled ? 0.5 : 1, padding: 2 }}
    >
      <Ionicons name={icon} size={15} color={colors.muted} />
    </Pressable>
  );
}

// The one text field both the draft and an in-place edit use. Full width with
// its button underneath, never beside it — see the header note on why.
//
// Fixed height with an internal scrollbar for a long note, deliberately: an
// auto-growing version was tried and feeds back on itself here, because
// onContentSizeChange measures the element whose height it just set, so an
// EMPTY draft field inflated itself to the cap on first render.
function NoteField({ value, onChangeText, placeholder, fieldRef, onFocus, autoFocus, height }) {
  return (
    <TextInput
      ref={fieldRef}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      multiline
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor={colors.hint}
      style={{
        minHeight: height,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontFamily: fonts.sans,
        fontSize: 12.5,
        lineHeight: 18,
        color: "#2a211c",
        textAlignVertical: "top",
      }}
    />
  );
}

function NoteRow({ note, canEdit, onChanged, scrollFieldIntoView }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.comment_text);
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef(null);

  const startEditing = () => {
    setText(note.comment_text);
    setEditing(true);
  };

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
      // Deliberately stays open with the edit intact — closing would bin it,
      // and there'd be no way to get the text back.
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
    <View style={{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#f4f1ec", paddingBottom: 10 }}>
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 4 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted }}
        >
          {note.coachName}
          {note.created_at ? ` | ${formatDateMD(dateInBoise(new Date(note.created_at)))}` : ""}
        </Text>
        {editing ? null : (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            {canEdit ? <ControlButton icon="create-outline" label="Edit note" onPress={startEditing} disabled={busy} /> : null}
            <ControlButton icon="trash-outline" label="Delete note" onPress={handleDelete} disabled={busy} />
          </View>
        )}
      </View>

      {editing ? (
        <>
          <NoteField
            fieldRef={fieldRef}
            value={text}
            onChangeText={setText}
            onFocus={() => scrollFieldIntoView(fieldRef.current)}
            autoFocus
            height={110}
          />
          <View className="flex-row" style={{ gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={handleSave}
              disabled={busy || !text.trim()}
              style={{
                opacity: busy || !text.trim() ? 0.5 : 1,
                flex: 1,
                minWidth: 0,
                backgroundColor: colors.primary,
                borderRadius: 8,
                paddingVertical: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#fff" }}>
                {busy ? "Saving…" : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setEditing(false)}
              disabled={busy}
              style={{
                opacity: busy ? 0.5 : 1,
                flex: 1,
                minWidth: 0,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 8,
                paddingVertical: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted }}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: "#2a211c" }}>
          {note.comment_text}
        </Text>
      )}
    </View>
  );
}

export function CommentThread({ groupBlockId, spcBlockId, scrollViewRef, scrollOffsetRef }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const draftRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setComments(await listComments({ groupBlockId, spcBlockId }));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [groupBlockId, spcBlockId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePost = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await addComment({ groupBlockId, spcBlockId, coachId: profile.id, commentText: trimmed });
      setDraft("");
      await load();
    } catch (err) {
      toastError("Couldn't post the note", err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 15 }}>
      <Eyebrow style={{ marginBottom: 10 }}>COACH NOTES</Eyebrow>

      {loadError ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#b23a22", marginBottom: 6 }}>
            Couldn't load notes: {loadError}
          </Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      ) : comments === null ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginBottom: 10 }}>Loading…</Text>
      ) : comments.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginBottom: 10 }}>
          No notes yet — leave one below for the other coaches.
        </Text>
      ) : (
        comments.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            canEdit={note.coach_id === profile?.id}
            onChanged={load}
            scrollFieldIntoView={scrollFieldIntoView}
          />
        ))
      )}

      <NoteField
        fieldRef={draftRef}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => scrollFieldIntoView(draftRef.current)}
        placeholder="Leave a note for other coaches…"
        height={72}
      />
      <Pressable
        onPress={handlePost}
        disabled={posting || !draft.trim()}
        style={{
          opacity: posting || !draft.trim() ? 0.5 : 1,
          marginTop: 8,
          backgroundColor: colors.primary,
          borderRadius: 8,
          paddingVertical: 9,
          alignItems: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#fff" }}>
          {posting ? "Adding…" : "Add note"}
        </Text>
      </Pressable>
    </View>
  );
}
