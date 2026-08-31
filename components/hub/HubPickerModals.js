import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { PressFade } from "../PressFade";
import { HubPinPad } from "./HubPinPad";
import { HubClientPickList } from "./HubClientPickList";
import { startHubSessionWithPin, addHubClient } from "../../lib/programming/hub";
import { listStagedForPin, startStagedSession } from "../../lib/programming/hubStaging";
import { formatTimeLabel } from "../../lib/dateTimeOptions";
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

// One staged group, as the wall offers it: the whole point is that this is
// two taps at 5am instead of picking four people on a touchscreen.
function StagedRow({ group, onStart, busy }) {
  const clients = group.clients ?? [];
  const blocked = clients.filter((c) => !c.resolvable);
  const startable = clients.length - blocked.length;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 15,
        marginBottom: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 20, color: "#292524" }}>
          {formatTimeLabel(group.scheduledTime)}
          {group.title ? ` · ${group.title}` : ""}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: fonts.sans, fontSize: type.body, color: colors.muted }}>
          {clients.map((c) => c.name.split(" ")[0]).join(" · ") || "Nobody staged"}
        </Text>
        {blocked.map((b) => (
          <Text key={b.userId} style={{ marginTop: 3, fontFamily: fonts.sans, fontSize: type.caption, color: "#b23a22" }}>
            {`${b.name.split(" ")[0]} can't start — ${(b.reason ?? "").toLowerCase()}`}
          </Text>
        ))}
      </View>
      <PressFade
        onPress={onStart}
        disabled={busy || startable === 0}
        style={{
          borderRadius: 14,
          paddingHorizontal: 26,
          paddingVertical: 14,
          backgroundColor: colors.primary,
          opacity: busy || startable === 0 ? 0.5 : 1,
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>{`Start (${startable})`}</Text>
      </PressFade>
    </View>
  );
}

// PIN, then whatever that coach staged for this morning, then the client list
// as the fallback. The PIN is held only for the life of this dialog and
// passed to hub_start_session / hub_start_staged, which re-verify it
// server-side — that's what makes the coach on the session (and on every note
// written at the wall) impossible for the display to forge.
export function HubStartModal({ visible, onClose, onStarted }) {
  const [step, setStep] = useState("pin");
  const [coach, setCoach] = useState(null);
  const [pin, setPin] = useState("");
  const [slots, setSlots] = useState([]);
  const [starting, setStarting] = useState(false);
  const [staged, setStaged] = useState([]);

  const reset = () => {
    setStep("pin");
    setCoach(null);
    setPin("");
    setSlots([]);
    setStaged([]);
  };

  // Straight past the staged step when there's nothing waiting, so a coach
  // who never stages sees exactly the flow they had before.
  const afterPin = async (c, value) => {
    setCoach(c);
    setPin(value);
    let groups = [];
    try {
      groups = await listStagedForPin(value);
    } catch {
      groups = [];
    }
    setStaged(groups);
    setStep(groups.length > 0 ? "staged" : "clients");
  };

  const handleStartStaged = async (group) => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startStagedSession(group.id, pin);
      const skipped = res?.skipped ?? [];
      if (skipped.length > 0) {
        showToast(`Started without ${skipped.map((x) => (x.name ?? "").split(" ")[0]).join(", ")}.`);
      }
      reset();
      onStarted?.();
    } catch (e) {
      toastError("Couldn't start that session.", e);
    } finally {
      setStarting(false);
    }
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
    <DialogShell visible={visible} onClose={close} maxWidth={step === "pin" ? 420 : 620}>
      {step === "pin" ? (
        <HubPinPad onVerified={afterPin} onCancel={close} />
      ) : step === "staged" ? (
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: "#292524" }}>
            {`${coach?.coachName?.split(" ")[0] ?? "Coach"}, this is ready`}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
            Staged earlier. Tap Start, or pick clients by hand instead.
          </Text>
          <ScrollView style={{ flexGrow: 0 }}>
            {staged.map((g) => (
              <StagedRow key={g.id} group={g} busy={starting} onStart={() => handleStartStaged(g)} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <PressFade onPress={close} style={{ paddingHorizontal: 14, paddingVertical: 13 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted }}>Cancel</Text>
            </PressFade>
            <View style={{ flex: 1 }} />
            <PressFade
              onPress={() => setStep("clients")}
              style={{ borderRadius: 14, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 22, paddingVertical: 13 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.primaryOnWhite }}>Pick clients instead</Text>
            </PressFade>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: "#292524" }}>Who's training?</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
            {`${coach?.coachName?.split(" ")[0] ?? "Coach"} is coaching · up to four clients · each defaults to her next session`}
          </Text>
          <HubClientPickList mode="multi" onChange={setSlots} allowRepeat />
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
        {atCapacity ? null : <HubClientPickList mode="single" excludeUserIds={onBoardUserIds} onChange={setSlots} allowRepeat />}
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
