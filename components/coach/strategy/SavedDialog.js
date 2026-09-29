import { View, Text, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { T } from "./ui";
import { fonts } from "../../../lib/theme";
import { formatTimeInBoise } from "../../../lib/boiseDate";

// Opens after every Save: confirms where it landed, and when there's
// something new for the client to see, asks whether to text her a copy,
// showing exactly what she'd get. Nothing is ever texted without a Yes here.
//
// dialog: { synced, offer, preview, textedAt, sending, error }
//   offer    the client-facing part changed since the last text (or there
//            was none), so a copy is worth offering
//   textedAt when she was last texted, for "send the updated copy?"
// texting: { ok, reason } | null from the client call. ok false means no
// phone or texts turned off in GLM: say so and don't offer Yes. null means
// the lookup failed; offer anyway and let the send report why.

function Button({ label, onPress, primary, disabled }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? T.clay : T.card,
        borderWidth: primary ? 0 : 1.5,
        borderColor: T.clayTintBorder,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 15.5, color: primary ? "#fff" : T.clayText }}>{label}</Text>
    </PressFade>
  );
}

export function SavedDialog({ dialog, first, texting, onYes, onClose }) {
  if (!dialog) return null;
  const { synced, offer, preview, textedAt, sending, error } = dialog;
  const blocked = texting && !texting.ok;
  const asking = offer && !!preview && !blocked;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={sending ? undefined : onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(40,34,30,0.45)", alignItems: "center", justifyContent: "center", padding: 18 }}>
        <View style={{ width: "100%", maxWidth: 440, maxHeight: "90%", backgroundColor: T.canvas, borderRadius: 22, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: T.olive, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: T.olive }}>{synced ? "Saved to GLM" : "Saved in Kova"}</Text>
          </View>
          {!synced ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: T.needsText, marginTop: 8 }}>
              Not in GLM yet. We'll keep trying on our own.
            </Text>
          ) : null}

          {asking ? (
            <>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: T.ink, marginTop: 18 }}>
                {textedAt ? `You texted ${first} at ${formatTimeInBoise(textedAt)}. Send the updated copy?` : `Send ${first} a copy?`}
              </Text>
              <ScrollView
                style={{ marginTop: 10, maxHeight: 280, backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border }}
                contentContainerStyle={{ padding: 14 }}
              >
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink }}>{preview}</Text>
              </ScrollView>
              {error ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#b23a22", marginTop: 10 }}>{error}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Button label="No" onPress={onClose} disabled={sending} />
                <Button label={sending ? "Sending…" : error ? "Try again" : "Yes, send"} onPress={onYes} primary disabled={sending} />
              </View>
            </>
          ) : (
            <>
              {offer && blocked ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2, marginTop: 14 }}>
                  {`Can't text ${first} a copy. ${texting.reason}`}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", marginTop: 18 }}>
                <Button label="Done" onPress={onClose} primary />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
