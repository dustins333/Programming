import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { formatDateTimeInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";
import { toastError } from "../lib/toast";

// Shared by the coach's per-client Messages card (clients/[userId].js) and
// the member's Messages screen — same flat thread, same send box, only the
// "is this mine" comparison and sender labels differ. Not styled as chat
// bubbles (this app has no existing chat-bubble pattern anywhere) — a
// plain sender-labeled list, own messages right-aligned with a tinted
// background for a quick visual "that one's mine" cue.
export function MessageThread({ messages, loadError, onRetry, isOwnMessage, labelFor, placeholder, onSend, maxHeight = 360 }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft("");
    } catch (err) {
      toastError("Failed to send", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="rounded-2xl border bg-white" style={{ borderColor: "#ece7e1" }}>
        <ScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
          {loadError ? (
            <View className="items-start">
              <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                Couldn't load messages: {loadError}
              </Text>
              <Pressable onPress={onRetry}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
              </Pressable>
            </View>
          ) : !messages ? (
            <ActivityIndicator color={colors.primary} />
          ) : messages.length === 0 ? (
            <Text className="text-sm text-stone-400" style={{ fontFamily: fonts.sans }}>
              No messages yet — say hello.
            </Text>
          ) : (
            messages.map((m) => {
              const own = isOwnMessage(m);
              return (
                <View key={m.id} className="mb-2.5" style={{ alignItems: own ? "flex-end" : "flex-start" }}>
                  <Text className="mb-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                    {labelFor(m)} · {formatDateTimeInBoise(m.created_at)}
                  </Text>
                  <View
                    className="max-w-[85%] rounded-xl px-3.5 py-2.5"
                    style={{ backgroundColor: own ? "#fdf6f2" : "#f6f5f3" }}
                  >
                    <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#44403c" }}>{m.body}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t p-3" style={{ borderTopColor: "#ece7e1" }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            multiline
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            style={{ fontFamily: fonts.sans, fontSize: 13.5, maxHeight: 90 }}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            className="rounded-lg px-4 py-2.5"
            style={{ backgroundColor: colors.primary, opacity: sending || !draft.trim() ? 0.5 : 1 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              {sending ? "…" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
