import { Modal, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { FinalizeConfetti, confettiRunMs, FINALIZED_WASH } from "../FinalizeConfetti";
import { fonts, colors } from "../../lib/theme";

// The finalized state on the live board, and the two-step way back out of it.
//
// A finished session has to read from across the gym — a coach standing at a
// rack should be able to glance at the wall and see who is done without
// walking over. So the session content washes green rather than carrying a
// small badge: the whole block of exercises tints at once, translucent enough
// that the lifts still read through it, which is what says "this is that
// session, and it's finished" rather than "something is loading".
//
// The wash covers the SESSION only, never the column header. Dropping a
// finished client off the board to make room for the next one is the most
// common thing that happens right after finalizing (see 0107), and that
// control lives in the header — covering it would break the flow the wash is
// celebrating.
//
// Nothing under the wash is tappable. Once a session is finalized, editing it
// means undoing it first, and tapping the wash is a second route to exactly
// the same confirm the "Make changes" button opens.

const DONE = "#4d6142";
export { FINALIZED_WASH };

// The piece animation itself lives in components/FinalizeConfetti.js, shared
// with the member's own phone celebration. These numbers are the wall's:
// long enough to actually be seen from across the gym and turn a head, which
// is slower than the same confetti wants to be in someone's hand.
const PIECE_COUNT = 28;
const FALL_MIN_MS = 2600;
const FALL_MAX_MS = 4200;
const STAGGER_MS = 1100;
export const CELEBRATION_MS = confettiRunMs({ fallMaxMs: FALL_MAX_MS, staggerMs: STAGGER_MS });

// Falls the length of the column. The card clips its own overflow, so a
// piece that falls past the bottom simply disappears.
export function HubFinalizeConfetti({ runKey, compact = false }) {
  return (
    <FinalizeConfetti
      runKey={runKey}
      pieceCount={PIECE_COUNT}
      distance={compact ? 900 : 1300}
      fallMinMs={FALL_MIN_MS}
      fallMaxMs={FALL_MAX_MS}
      staggerMs={STAGGER_MS}
    />
  );
}

// The wash itself. Written longhand rather than with StyleSheet.absoluteFillObject
// — inside a style array that renders the view invisible on this app's Fabric
// build (2026-08-08), and this is exactly that shape.
export function HubFinalizedWash({ onPress, compact = false }) {
  return (
    <PressFade
      onPress={onPress}
      pressedOpacity={0.75}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: FINALIZED_WASH,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          backgroundColor: DONE,
          paddingLeft: compact ? 12 : 16,
          paddingRight: compact ? 16 : 22,
          paddingVertical: compact ? 8 : 11,
        }}
      >
        <Ionicons name="checkmark-circle" size={compact ? 24 : 32} color="white" style={{ marginRight: compact ? 8 : 10 }} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 15 : 20, letterSpacing: compact ? 1.4 : 2, color: "white" }}>
          FINALIZED
        </Text>
      </View>
      <Text
        style={{
          marginTop: compact ? 7 : 10,
          fontFamily: fonts.sansSemiBold,
          fontSize: compact ? 12 : 14,
          color: "#2c3826",
          textAlign: "center",
        }}
      >
        Tap to make changes
      </Text>
    </PressFade>
  );
}

// Undoing is deliberately two steps: the button says what it is for ("Make
// changes"), and this says what it will actually do. A one-tap un-finalize on
// a wall display anyone can reach is a session quietly reopened by a sleeve.
export function HubUndoFinalizeModal({ visible, clientName, onCancel, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <PressFade
        onPress={onCancel}
        pressedOpacity={1}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(68,64,60,0.45)" }}
      >
        {/* Swallows a tap on the card itself so the scrim's dismiss doesn't
            fire through it. */}
        <PressFade
          onPress={() => {}}
          pressedOpacity={1}
          style={{ width: "100%", maxWidth: 420, borderRadius: 20, backgroundColor: "white", padding: 24 }}
        >
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#eef1e7", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark-circle" size={36} color={DONE} />
            </View>
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.primaryOnWhite, textAlign: "center" }}>
            This session is finalized
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: fonts.sans,
              fontSize: 15,
              lineHeight: 22,
              color: "#57534e",
              textAlign: "center",
            }}
          >
            {clientName ? `${clientName}'s session is marked done.` : "This session is marked done."} Do you want to undo it and make
            changes?
          </Text>

          <PressFade
            onPress={onConfirm}
            style={{ marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.primary }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "white" }}>Undo and make changes</Text>
          </PressFade>
          <PressFade onPress={onCancel} style={{ marginTop: 10, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>Keep it finalized</Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}
