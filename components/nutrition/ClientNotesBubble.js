import { useRef, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GamePlan } from "./GamePlan";
import { FocusChecklist } from "./FocusChecklist";
import { fonts, colors } from "../../lib/theme";

// Notes + Focus, reachable from ANY tab of a client's nutrition record.
// Both already live in the Dashboard and Check-In rails, but a coach part-way
// through Weeks, Trends, Photos or Targets had to leave what she was reading
// to write down the thing she just noticed. This follows whatever page she's
// on instead.
//
// Deliberately reuses <GamePlan> and <FocusChecklist> rather than
// reimplementing either: this is a second doorway to the same data, and a
// separate copy would be one more place for the two to disagree.
//
// Sits bottom-LEFT because CoachMessageBubble already owns bottom-right on
// this page. Stacking them vertically was the other option and is worse:
// that bubble is gated on the messaging kill switch, so on a client with
// messaging off this one would hover above nothing.
//
// IMPORTANT: the idle control must NOT be wrapped in a <Modal> — see
// CoachMessageBubble/FloatingMessageBubble for the real-device bug that
// causes (an always-visible transparent Modal swallows every touch to the
// page underneath, even with pointerEvents="box-none"). Only the opened
// sheet below is a real Modal, deliberately.
export function ClientNotesBubble({ userId, client, focusItems, onChanged }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const notesRef = useRef(null);

  // "Click off of it and it minimizes" is the whole interaction, so a tap
  // away has to flush an unsaved note rather than binning it — the Save
  // button below still works, this is the safety net for not using it.
  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      const result = await notesRef.current?.saveIfDirty();
      // Stay open on a failed write so the note is still on screen to retry
      // — closing would drop it, and the toast alone wouldn't bring it back.
      if (result === "failed") return;
      if (result === "saved") onChanged?.();
      setOpen(false);
    } finally {
      setClosing(false);
    }
  };

  const focusDone = focusItems?.filter((f) => f.done).length ?? 0;
  const focusTotal = focusItems?.length ?? 0;
  const hasNote = Boolean(client?.game_plan);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Notes and focus for this client"
        style={{
          position: "absolute",
          bottom: insets.bottom + 24,
          left: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          height: 44,
          paddingLeft: 14,
          paddingRight: 16,
          borderRadius: 999,
          backgroundColor: "white",
          borderWidth: 1.5,
          borderColor: colors.primary,
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.16,
          shadowRadius: 10,
          elevation: 6,
          zIndex: 20,
        }}
      >
        <Ionicons name="create-outline" size={18} color={colors.primaryOnWhite} />
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
          Notes
        </Text>
        {/* A quiet marker that there's already something written, so the
            control says whether it's worth opening. */}
        {hasNote || focusTotal > 0 ? (
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            {hasNote ? "·" : ""}
            {focusTotal > 0 ? ` ${focusDone}/${focusTotal}` : ""}
          </Text>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable
          onPress={handleClose}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(68,64,60,0.35)", padding: 20 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ width: "100%", maxWidth: 480, maxHeight: "84%", backgroundColor: "white", borderRadius: 18, overflow: "hidden" }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 12,
              }}
            >
              <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c", flex: 1, marginRight: 8 }}>
                {client?.name ?? "Client"}
              </Text>
              <Pressable onPress={handleClose} hitSlop={10} accessibilityLabel="Close notes">
                <Ionicons name="close" size={22} color="#78716c" />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 18 }}>
              <Text
                className="mb-2 text-xs uppercase"
                style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, color: "#a8a29e" }}
              >
                Notes
              </Text>
              <GamePlan ref={notesRef} userId={userId} initialGamePlan={client?.game_plan} />

              <Text
                className="mb-2 mt-5 text-xs uppercase"
                style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, color: "#a8a29e" }}
              >
                Focus
              </Text>
              <FocusChecklist userId={userId} items={focusItems} onChanged={onChanged} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
