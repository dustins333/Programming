import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listComments, addComment } from "../../../lib/programming/comments";

export function CommentThread({ groupBlockId, spcBlockId }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

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
    } finally {
      setPosting(false);
    }
  };

  return (
    <View className="rounded-lg border border-neutral-200 p-4">
      <Text className="mb-3 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Coach notes
      </Text>
      <ScrollView className="mb-3 max-h-48">
        {comments?.length ? (
          comments.map((c) => (
            <View key={c.id} className="mb-2">
              <Text className="text-xs text-neutral-500" style={{ fontFamily: "Montserrat_500Medium" }}>
                {c.coachName}
              </Text>
              <Text style={{ fontFamily: "Montserrat_400Regular" }}>{c.comment_text}</Text>
            </View>
          ))
        ) : (
          <Text className="text-xs text-neutral-400" style={{ fontFamily: "Montserrat_400Regular" }}>
            No notes yet.
          </Text>
        )}
      </ScrollView>
      <View className="flex-row gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Leave a note for other coaches…"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <Pressable onPress={handlePost} disabled={posting || !draft.trim()} className="rounded-lg bg-primary px-4 py-2 disabled:opacity-50">
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Post
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
