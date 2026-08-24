import { useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { PressFade } from "../PressFade";
import { HubPinPad } from "./HubPinPad";
import { HubClientPickList } from "./HubClientPickList";
import { startHubSessionWithPin, addHubClient } from "../../lib/programming/hub";
import { showToast, toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The wall display's two dialogs: start a session, and add a client to one
// that's already running. Centered cards rather than bottom sheets — this is
// a coach-facing surface on a landscape screen, which is what the house rule
// reserves centered dialogs for.

const CARD_BORDER = "#ece7e1";

function DialogShell({ visible, onClose, children, maxWidth = 560 }) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.45)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth,
            maxHeight: height * 0.86,
            backgroundColor: colors.canvas,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            padding: 22,
            overflow: "hidden",
          }}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// PIN, then the client list. The PIN is held only for the life of this dialog
// and passed to hub_start_session, which re-verifies it server-side — that's
// what makes the coach on the session (and on every note written at the wall)
// impossible for the display to forge.
export function HubStartModal({ visible, onClose, onStarted }) {
  const [step, setStep] = useState("pin");
  const [coach, setCoach] = useState(null);
  const [pin, setPin] = useState("");
  const [slots, setSlots] = useState([]);
  const [starting, setStarting] = useState(false);

  const reset = () => {
    setStep("pin");
    setCoach(null);
    setPin("");
    setSlots([]);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const handleStart = async () => {
    if (slots.length === 0 || starting) return;
    setStarting(true);
    try {
      await startHubSessionWithPin({ pin, slots });
      reset();
      onStarted?.();
    } catch (e) {
      toastError("Couldn't start the session.", e);
    } finally {
      setStarting(false);
    }
  };

  return (
    <DialogShell visible={visible} onClose={close} maxWidth={step === "pin" ? 420 : 560}>
      {step === "pin" ? (
        <HubPinPad
          onVerified={(c, value) => {
            setCoach(c);
            setPin(value);
            setStep("clients");
          }}
          onCancel={close}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: "#292524" }}>Who's training?</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
            {`${coach?.coachName?.split(" ")[0] ?? "Coach"} is coaching · up to four clients · each defaults to her next session`}
          </Text>
          <HubClientPickList mode="multi" onChange={setSlots} />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
            <PressFade onPress={close} style={{ paddingHorizontal: 14, paddingVertical: 13 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>Cancel</Text>
            </PressFade>
            <View style={{ flex: 1 }} />
            <PressFade
              onPress={handleStart}
              disabled={slots.length === 0 || starting}
              style={{
                borderRadius: 14,
                paddingHorizontal: 26,
                paddingVertical: 14,
                backgroundColor: colors.primary,
                opacity: slots.length === 0 || starting ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
                {starting ? "Starting…" : `Start${slots.length > 0 ? ` (${slots.length})` : ""}`}
              </Text>
            </PressFade>
          </View>
        </View>
      )}
    </DialogShell>
  );
}

// Mid-session, so no PIN: the coach who unlocked the board is standing at it.
export function HubAddClientModal({ visible, onClose, onBoardUserIds = [], onAdded }) {
  const [slots, setSlots] = useState([]);
  const [adding, setAdding] = useState(false);

  const close = () => {
    setSlots([]);
    onClose?.();
  };

  const handleAdd = async () => {
    const slot = slots[0];
    if (!slot || adding) return;
    setAdding(true);
    try {
      await addHubClient(slot);
      showToast(`${slot.name.split(" ")[0]} is on the board.`);
      setSlots([]);
      onAdded?.();
    } catch (e) {
      toastError("Couldn't add her to the board.", e);
    } finally {
      setAdding(false);
    }
  };

  const atCapacity = onBoardUserIds.length >= 4;

  return (
    <DialogShell visible={visible} onClose={close}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: "#292524" }}>Add a client</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
          {atCapacity
            ? "The board holds four — drop someone first."
            : "She joins the board straight away, in the next free column."}
        </Text>
        {atCapacity ? null : <HubClientPickList mode="single" excludeUserIds={onBoardUserIds} onChange={setSlots} />}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
          <PressFade onPress={close} style={{ paddingHorizontal: 14, paddingVertical: 13 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>Cancel</Text>
          </PressFade>
          <View style={{ flex: 1 }} />
          <PressFade
            onPress={handleAdd}
            disabled={slots.length === 0 || adding || atCapacity}
            style={{
              borderRadius: 14,
              paddingHorizontal: 26,
              paddingVertical: 14,
              backgroundColor: colors.primary,
              opacity: slots.length === 0 || adding || atCapacity ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>{adding ? "Adding…" : "Add to board"}</Text>
          </PressFade>
        </View>
      </View>
    </DialogShell>
  );
}
