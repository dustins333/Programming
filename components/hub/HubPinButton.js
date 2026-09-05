import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { getOwnDisplayPin, setOwnDisplayPin, clearOwnDisplayPin } from "../../lib/programming/hub";
import { formatDateMDY } from "../../lib/formatDate";
import { dateInBoise } from "../../lib/boiseDate";
import { showToast, toastError } from "../../lib/toast";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { fonts, colors, type } from "../../lib/theme";

// A coach sets their own board PIN here. No admin hands these out — Terra's
// call, and the right one: a coach who never sets one simply starts sessions
// from the live screen instead, which is unchanged.
//
// This used to be a card at the bottom of the Start now roster, which meant
// scrolling past every client on the board to reach it. It's a header button
// now, and it sits on the back-link row rather than beside the title: that
// row is otherwise empty in every state, so it never has to compete with
// "+ Add client" / "End session" / "Stage another" for width on a phone.
//
// Only a hash is stored, so a PIN can never be shown back — this can only say
// whether one is set, and offer to replace it.

const CARD_BORDER = "#ece7e1";

export function HubPinButton() {
  const [existing, setExisting] = useState(undefined); // undefined = loading, null = none
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoadError(false);
    getOwnDisplayPin()
      .then((row) => setExisting(row ?? null))
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  // Nothing while it's still loading — a label that flips from "Set" to
  // "Update" a moment after the page paints reads as the button changing its
  // mind. On a failed load we don't know which it is, so the button says
  // neither and the dialog sorts it out.
  if (existing === undefined && !loadError) return null;

  const label = loadError ? "Board PIN" : existing ? "Update your PIN" : "Set your PIN";

  return (
    <>
      <PressFade
        onPress={() => setOpen(true)}
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "#f0ddd2",
          backgroundColor: "#fdf6f2",
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginLeft: 12,
        }}
      >
        <Ionicons name="keypad-outline" size={14} color={colors.primaryOnWhite} style={{ marginRight: 6 }} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}
        >
          {label}
        </Text>
      </PressFade>

      <HubPinDialog
        visible={open}
        existing={loadError ? null : existing}
        onClose={() => setOpen(false)}
        onChanged={load}
      />
    </>
  );
}

function HubPinDialog({ visible, existing, onClose, onChanged }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Reset every time it opens, so a half-typed PIN from last time is never
  // sitting in the box.
  useEffect(() => {
    if (visible) {
      setPin("");
      setConfirmRemove(false);
    }
  }, [visible]);

  const close = () => {
    if (busy) return;
    onClose();
  };

  const save = async () => {
    if (busy) return;
    if (!/^[0-9]{4}$/.test(pin)) {
      showToast("A PIN is exactly four digits.");
      return;
    }
    setBusy(true);
    try {
      await setOwnDisplayPin(pin);
      onChanged();
      onClose();
      showToast("PIN saved. You can start a session from the board now.");
    } catch (e) {
      toastError("Couldn't save that PIN.", e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearOwnDisplayPin();
      onChanged();
      onClose();
      showToast("PIN removed.");
    } catch (e) {
      toastError("Couldn't remove that PIN.", e);
    } finally {
      setBusy(false);
    }
  };

  const ready = pin.length === 4;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.45)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: colors.canvas,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            padding: 22,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="keypad-outline" size={18} color={colors.primaryOnWhite} style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: type.bodyLg, color: "#292524" }}>Your board PIN</Text>
            <PressFade onPress={close} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.muted} />
            </PressFade>
          </View>

          <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, lineHeight: 18, color: colors.muted, marginTop: 8 }}>
            Four digits. Lets you start a session from the gym board instead of your phone, and it's what puts your name on the
            session, so notes typed at the wall are yours.
            {existing ? ` Last set ${formatDateMDY(dateInBoise(new Date(existing.updated_at)))}.` : ""}
          </Text>

          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: "#57534e", marginTop: 16, marginBottom: 6 }}>
            {existing ? "New PIN" : "PIN"}
          </Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="1234"
            placeholderTextColor={colors.hint}
            keyboardType="number-pad"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            secureTextEntry
            autoFocus
            style={{
              width: 120,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: CARD_BORDER,
              backgroundColor: "white",
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontFamily: fonts.sansBold,
              fontSize: 20,
              letterSpacing: 6,
              color: "#292524",
            }}
          />

          <PressFade
            onPress={save}
            disabled={busy || !ready}
            style={{
              marginTop: 18,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: colors.primary,
              opacity: busy || !ready ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
              {busy ? "Saving…" : existing ? "Update PIN" : "Save PIN"}
            </Text>
          </PressFade>

          {existing ? (
            <View style={{ alignItems: "center", marginTop: 12 }}>
              {confirmRemove ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <PressFade
                    onPress={remove}
                    disabled={busy}
                    style={{
                      backgroundColor: "#b23a22",
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      marginRight: 8,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "white" }}>{busy ? "Removing…" : "Remove it"}</Text>
                  </PressFade>
                  <PressFade onPress={() => setConfirmRemove(false)} style={{ paddingHorizontal: 10, paddingVertical: 9 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>Keep it</Text>
                  </PressFade>
                </View>
              ) : (
                <PressFade onPress={() => setConfirmRemove(true)} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>Remove my PIN</Text>
                </PressFade>
              )}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
