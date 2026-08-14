import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";
import { listComments, addComment } from "../lib/programming/comments";
import { useScrollToKeyboard } from "../lib/scrollToKeyboard";
import { toastError } from "../lib/toast";

// scrollViewRef/scrollOffsetRef are optional — this card is normally
// embedded as one of several on a longer page (a block detail screen), so
// it has no ScrollView of its own to scroll within. When the embedding
// page passes its own ScrollView's ref pair (same "embedded" convention
// MessageThread.js uses), a focused draft field scrolls itself into view on
// tap; when it doesn't, useScrollToKeyboard's own null-ref guard makes this
// a harmless no-op, so existing call sites that don't pass anything are
// unaffected.
export function CommentThread({ groupBlockId, spcBlockId, scrollViewRef, scrollOffsetRef }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const draftRef = useRef(null);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);

  const load = useCallback(async () => {
    const rows = await listComments({ groupBlockId, spcBlockId });
    setComments(rows);
  }, [groupBlockId, spcBlockId]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await addComment({ groupBlockId, spcBlockId, coachId: profile.id, commentText: draft.trim() });
      setDraft("");
      await load();
    } catch (err) {
      toastError("Couldn't post note", err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <View className="rounded-lg border border-stone-200 p-4">
      <Text className="mb-3 text-sm text-stone-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Coach notes
      </Text>
      <ScrollView className="mb-3 max-h-48">
        {comments?.length ? (
          comments.map((c) => (
            <View key={c.id} className="mb-2">
              <Text className="text-xs text-stone-500" style={{ fontFamily: "Montserrat_500Medium" }}>
                {c.coachName}
              </Text>
              <Text style={{ fontFamily: "Montserrat_400Regular" }}>{c.comment_text}</Text>
            </View>
          ))
        ) : (
          <Text className="text-xs text-stone-400" style={{ fontFamily: "Montserrat_400Regular" }}>
            No notes yet — leave one below for the other coaches.
          </Text>
        )}
      </ScrollView>
      <View className="flex-row gap-2">
        <TextInput
          ref={draftRef}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => scrollFieldIntoView(draftRef.current)}
          placeholder="Leave a note for other coaches…"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <Pressable onPress={handlePost} disabled={posting || !draft.trim()} style={{ opacity: posting || !draft.trim() ? 0.5 : 1 }} className="rounded-lg bg-primary px-4 py-2">
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Post
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
