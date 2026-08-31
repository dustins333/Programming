import { Modal, View, Text } from "react-native";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// "You already logged Session 1 this week" — the member make-up sheet
// (design_handoff_spc_rework_v1, 1f). A second logged copy of a session is a
// FEATURE (making up a missed week), not a warning: warm copy, no red, no
// "are you sure". Member sheet conventions: bottom-anchored, 22px top
// radius, member canvas background, grabber, espresso scrim.
//
// "Start a new one" maps to startNewSpcSessionInstance() (0102's instance
// column); "Update that session" opens what she already logged.

const MEMBER_CANVAS = "#eceae6";

function Option({ title, sub, onPress, busy }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e0dbd4",
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#6f6862", marginTop: 3 }}>
        {sub}
      </Text>
    </PressFade>
  );
}

export function MakeupSessionSheet({ visible, onClose, sessionLabel, loggedDateLabel, onUpdate, onStartNew, busy }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <PressFade onPress={onClose} pressedOpacity={1} style={{ flex: 1, backgroundColor: "rgba(51,37,31,0.34)", justifyContent: "flex-end" }}>
        <PressFade
          onPress={() => {}}
          pressedOpacity={1}
          style={{
            backgroundColor: MEMBER_CANVAS,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 30,
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#d5cdc4" }} />

          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 19, color: "#2a211c", marginTop: 16 }}>
            You already logged {sessionLabel} this week
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#6f6862", marginTop: 5 }}>
            Both of these are normal. Pick whichever fits what you did today.
          </Text>

          <View style={{ gap: 10, marginTop: 16 }}>
            <Option
              title="Update that session"
              sub={loggedDateLabel ? `Opens ${loggedDateLabel}. Add a set, fix a weight.` : "Open what you logged. Add a set, fix a weight."}
              onPress={onUpdate}
              busy={busy}
            />
            <Option
              title="Start a new one"
              sub="A fresh copy to log, good for making up a week you missed."
              onPress={onStartNew}
              busy={busy}
            />
          </View>

          <PressFade onPress={onClose} disabled={busy} style={{ alignSelf: "center", marginTop: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>
              Never mind
            </Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}
