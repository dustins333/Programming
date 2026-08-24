import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
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
// from this screen instead, which is unchanged.
//
// Only a hash is stored, so a PIN can never be shown back — this card can
// only say whether one is set, and offer to replace it.

const CARD_BORDER = "#ece7e1";

export function HubPinCard() {
  const [existing, setExisting] = useState(undefined); // undefined = loading, null = none
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoadError(false);
    getOwnDisplayPin()
      .then((row) => setExisting(row ?? null))
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  const save = async () => {
    if (busy) return;
    if (!/^[0-9]{4}$/.test(pin)) {
      showToast("A PIN is exactly four digits.");
      return;
    }
    setBusy(true);
    try {
      await setOwnDisplayPin(pin);
      setPin("");
      setEditing(false);
      load();
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
      setPin("");
      setEditing(false);
      load();
      showToast("PIN removed.");
    } catch (e) {
      toastError("Couldn't remove that PIN.", e);
    } finally {
      setBusy(false);
    }
  };

  if (loadError || existing === undefined) return null; // quiet: this is a side offer, not the page

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "#faf8f6", padding: 16, marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="keypad-outline" size={18} color={colors.primaryOnWhite} style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: type.bodyLg, color: "#292524" }}>Your board PIN</Text>
        {existing && !editing ? (
          <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "#eef1e7", borderWidth: 1, borderColor: "#cfdcc2", paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: "#4d6142" }}>SET</Text>
          </View>
        ) : null}
      </View>

      <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, lineHeight: 18, color: colors.muted, marginTop: 6 }}>
        {existing && !editing
          ? `Tap the clock on the gym board, enter your PIN, and pick who's training. Set ${formatDateMDY(dateInBoise(new Date(existing.updated_at)))}.`
          : "Four digits. Lets you start a session from the gym board instead of your phone — and it's what puts your name on the session, so notes typed at the wall are yours."}
      </Text>

      {editing || !existing ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="1234"
            placeholderTextColor={colors.hint}
            keyboardType="number-pad"
            inputAccessoryViewID={NUMERIC_DONE_ID}
            secureTextEntry
            style={{
              width: 96,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: CARD_BORDER,
              backgroundColor: "white",
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontFamily: fonts.sansBold,
              fontSize: 18,
              letterSpacing: 4,
              color: "#292524",
              marginRight: 10,
            }}
          />
          <PressFade
            onPress={save}
            disabled={busy || pin.length !== 4}
            style={{
              borderRadius: 12,
              paddingHorizontal: 18,
              paddingVertical: 12,
              backgroundColor: colors.primary,
              opacity: busy || pin.length !== 4 ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "white" }}>{busy ? "Saving…" : "Save"}</Text>
          </PressFade>
          {existing ? (
            <PressFade onPress={() => { setEditing(false); setPin(""); }} style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.muted }}>Cancel</Text>
            </PressFade>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <PressFade
            onPress={() => setEditing(true)}
            style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "white", paddingHorizontal: 16, paddingVertical: 9, marginRight: 8 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Change PIN</Text>
          </PressFade>
          <PressFade onPress={remove} disabled={busy} style={{ paddingHorizontal: 12, paddingVertical: 9, opacity: busy ? 0.5 : 1 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>Remove</Text>
          </PressFade>
        </View>
      )}
    </View>
  );
}
