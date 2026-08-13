import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDateMDY } from "../lib/formatDate";
import { dateInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";

const MAX_VISIBLE = 3;

// Coach-private notes about one client. Add is an inline composer rather
// than a modal — a note is usually one line typed between clients, and a
// dialog is more ceremony than the thought deserves.
export function ClientNotesCard({ notes, error, coachNameById, currentUserId, onAdd, onTogglePin, onDelete, onRetry }) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      await onAdd(body);
      setDraft("");
      setComposing(false);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <View>
        <Text className="text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Couldn't load notes: {error}
        </Text>
        <Pressable onPress={onRetry} className="mt-2 self-start" hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const list = notes ?? [];
  const visible = showAll ? list : list.slice(0, MAX_VISIBLE);

  return (
    <View>
      {composing ? (
        <View className="mb-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Wants a 225 squat by December — keep hinge volume up."
            multiline
            autoFocus
            className="rounded-xl border bg-white px-3 py-2.5"
            style={{ fontFamily: fonts.sans, fontSize: 13, borderColor: "#e2ddd6", minHeight: 62 }}
          />
          <View className="mt-2 flex-row justify-end gap-2">
            <Pressable
              onPress={() => {
                setComposing(false);
                setDraft("");
              }}
              className="rounded-lg border px-3 py-1.5"
              style={{ borderColor: "#d9d4cd" }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleAdd}
              disabled={saving || !draft.trim()}
              className="rounded-lg px-3 py-1.5"
              style={{ backgroundColor: colors.primary, opacity: saving || !draft.trim() ? 0.5 : 1 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                {saving ? "Saving…" : "Save note"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {list.length === 0 && !composing ? (
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Nothing yet. Goals, injuries mid-recovery, travel weeks — anything you'd want in front of you next time you program for them.
        </Text>
      ) : null}

      {visible.map((note) => {
        const author = note.author_id === currentUserId ? "You" : coachNameById.get(note.author_id) ?? "Coach";
        return (
          <View
            key={note.id}
            className="mb-2.5 rounded-xl px-3.5 py-3"
            style={note.pinned ? { backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#f0ddd2" } : { backgroundColor: "#faf8f6" }}
          >
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c", lineHeight: 19 }}>{note.body}</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
                {note.pinned ? "Pinned · " : ""}
                {author} · {formatDateMDY(dateInBoise(new Date(note.created_at)))}
              </Text>
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => onTogglePin(note)} hitSlop={8} accessibilityLabel={note.pinned ? "Unpin note" : "Pin note"}>
                  <Ionicons name={note.pinned ? "bookmark" : "bookmark-outline"} size={14} color={note.pinned ? colors.primaryOnWhite : "#a8a29e"} />
                </Pressable>
                <Pressable onPress={() => onDelete(note)} hitSlop={8} accessibilityLabel="Delete note">
                  <Ionicons name="trash-outline" size={14} color="#a8a29e" />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}

      <View className="mt-1 flex-row items-center justify-between">
        {!composing ? (
          <Pressable onPress={() => setComposing(true)} hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>+ Add note</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {list.length > MAX_VISIBLE ? (
          <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
              {showAll ? "Show fewer" : `All ${list.length} notes →`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
