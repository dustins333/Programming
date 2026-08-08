import { useContext, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { formatDateTimeInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";
import { toastError } from "../lib/toast";
import { useScrollToKeyboard, useKeyboardHeight, DONE_BAR_HEIGHT } from "../lib/scrollToKeyboard";

// Shared by the coach's per-client Messages card (clients/[userId].js), the
// coach's Messages inbox thread pane, and the member's Messages screen —
// same flat thread, same send box, only the "is this mine" comparison and
// sender labels differ. Not styled as chat bubbles (this app has no
// existing chat-bubble pattern anywhere) — a plain sender-labeled list, own
// messages right-aligned with a tinted background for a quick visual
// "that one's mine" cue.
//
// Two layout modes, since this renders inside two very different contexts.
// Both use useKeyboardHeight() (lib/scrollToKeyboard.js) instead of
// KeyboardAvoidingView — confirmed on a real device that KeyboardAvoidingView's
// automatic "padding" behavior breaks once nested a few levels deep inside a
// Tabs-navigator screen (header, back link, name text all above it): the
// compose box vanished into a large dead gap above the keyboard instead of
// sitting right above it. Manually tracking the keyboard's real height and
// applying it as explicit padding sidesteps that unreliable measurement.
// - `fill` (the member's dedicated Messages screen, the coach inbox's
//   thread pane): this component owns the whole remaining screen height.
//   The message list is flex:1 and the compose row is a fixed sibling
//   directly below it — the standard chat-app pattern where opening the
//   keyboard shrinks the list and the compose row is already pinned right
//   above it, no manual scroll needed at all.
// - default/embedded (the coach's per-client Messages card on
//   clients/[userId].js, one card among many on a long page): the message
//   list stays a fixed maxHeight and the whole thing sits inside the page's
//   own ScrollView. The keyboard-height padding alone doesn't bring an
//   already-scrolled-past compose box back into view here — a `scrollViewRef`
//   pointed at that ancestor ScrollView lets the compose box scroll itself
//   into view above the keyboard on focus, same technique ExerciseCard uses
//   for superset logging.
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
  scrollOffsetRef,
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const composeRef = useRef(null);
  const scrollComposeIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const keyboardHeight = useKeyboardHeight();
  // The tab bar's own space is always reserved in the layout — the
  // keyboard just visually covers it, RN never resizes the screen
  // container for it — so padding by the raw keyboard height double-counts
  // that already-reserved space, leaving a dead gap between the compose
  // box and the keyboard exactly the tab bar's height tall (confirmed on a
  // real device). Subtracting it back out closes that gap. Read the
  // context directly with a fallback rather than the public
  // useBottomTabBarHeight() hook, which throws outside a Tabs navigator —
  // this same component also renders on the coach's web layout
  // (app/(coach)/_layout.web.js), which uses a plain <Slot/> with no Tabs
  // at all, where the fallback of 0 is exactly correct (no tab bar to
  // account for there).
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  // KeyboardDoneButton floats above the real keyboard whenever one's open
  // (mounted at the app root) — it's invisible to this calculation unless
  // added explicitly, same reasoning as lib/scrollToKeyboard.js's own use
  // of DONE_BAR_HEIGHT.
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const bottomPadding = Math.max(0, occludedHeight - tabBarHeight);

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
    <View style={fill ? { flex: 1, paddingBottom: bottomPadding } : { paddingBottom: bottomPadding }}>
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
            onSubmitEditing={handleSend}
            placeholder={placeholder}
            returnKeyType="send"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            style={{ fontFamily: fonts.sans, fontSize: 13.5 }}
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
    </View>
  );
}
