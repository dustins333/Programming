import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { formatDateTimeInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";
import { toastError } from "../lib/toast";
import { useScrollToKeyboard } from "../lib/scrollToKeyboard";
import { NUMERIC_DONE_ID } from "./NumericInputAccessory";

// Shared by the coach's per-client Messages card (clients/[userId].js), the
// coach's Messages inbox thread pane, and the member's Messages screen —
// same flat thread, same send box, only the "is this mine" comparison and
// sender labels differ. Not styled as chat bubbles (this app has no
// existing chat-bubble pattern anywhere) — a plain sender-labeled list, own
// messages right-aligned with a tinted background for a quick visual
// "that one's mine" cue.
//
// Two layout modes, since this renders inside two very different contexts:
// - `fill` (the member's dedicated Messages screen, the coach inbox's
//   thread pane): this component owns the whole remaining screen height.
//   The message list is flex:1 and the compose row is a fixed sibling
//   directly below it, both inside a flex:1 KeyboardAvoidingView — the
//   standard chat-app pattern where opening the keyboard shrinks the list
//   and the compose row is already pinned right above it, no manual scroll
//   needed at all.
// - default/embedded (the coach's per-client Messages card on
//   clients/[userId].js, one card among many on a long page): the message
//   list stays a fixed maxHeight and the whole thing sits inside the page's
//   own ScrollView. KeyboardAvoidingView's padding alone doesn't bring an
//   already-scrolled-past compose box back into view here — a `scrollViewRef`
//   pointed at that ancestor ScrollView lets the compose box scroll itself
//   into view above the keyboard on focus, same technique ExerciseCard uses
//   for superset logging (see lib/scrollToKeyboard.js).
export function MessageThread({
  messages,
  loadError,
  onRetry,
  isOwnMessage,
  labelFor,
  placeholder,
  onSend,
  maxHeight = 360,
  fill = false,
  scrollViewRef,
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const composeRef = useRef(null);
  const scrollComposeIntoView = useScrollToKeyboard(scrollViewRef);

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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={fill ? { flex: 1 } : undefined}>
      <View className="rounded-2xl border bg-white" style={fill ? { flex: 1, borderColor: "#ece7e1" } : { borderColor: "#ece7e1" }}>
        <ScrollView
          style={fill ? { flex: 1 } : { maxHeight }}
          contentContainerStyle={{ padding: 14 }}
          keyboardShouldPersistTaps="handled"
        >
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
            ref={composeRef}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => scrollComposeIntoView(composeRef.current)}
            placeholder={placeholder}
            multiline
            inputAccessoryViewID={NUMERIC_DONE_ID}
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
