import { Modal, View, Text } from "react-native";
import { PressFade } from "../PressFade";
import { feelOption } from "../../lib/programming/conditioning";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// The popup behind a conditioning stripe on My Week, and behind a
// conditioning row in My History. Member sheet conventions: bottom-anchored,
// 22px top radius, grabber, espresso scrim.
//
// With no `log` it just says what logging asks for and hands off to My
// Fitness. With a `log` it shows what she recorded and offers to update it.

const MEMBER_CANVAS = "#faf8f6";
const INK = "#2a211c";

function Stat({ value, label }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#ece7e1", paddingVertical: 11, paddingHorizontal: 12 }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 22, color: colors.primaryOnWhite }}>
        {value}
      </Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: colors.muted, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

export function ConditioningSheet({ visible, onClose, log, onCta, ctaLabel }) {
  if (!visible) return null;
  const feel = feelOption(log?.feel);
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

          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.display, fontSize: 24, color: colors.primary, marginTop: 16 }}>
            Conditioning
          </Text>
          {log ? (
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, color: colors.muted, marginTop: 2 }}>
              LOGGED {formatDateMDY(log.performed_on)}
            </Text>
          ) : null}

          {log ? (
            <>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Stat value={`${log.duration_minutes}`} label="Minutes" />
                <Stat value={log.avg_heart_rate != null ? `${log.avg_heart_rate}` : "–"} label="Avg bpm" />
                <Stat value={feel ? feel.emoji : "–"} label={feel ? feel.label : "Feel"} />
              </View>
              {log.notes ? (
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: "#57534e", marginTop: 12 }}>
                  {log.notes}
                </Text>
              ) : null}
            </>
          ) : null}

          {onCta ? (
            <PressFade
              onPress={onCta}
              style={{
                marginTop: 18,
                height: 50,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: log ? "#4d6142" : colors.primary,
              }}
            >
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#fff" }}>
                {ctaLabel ?? (log ? "Update this session" : "Log this session")}
              </Text>
            </PressFade>
          ) : null}

          <PressFade onPress={onClose} style={{ alignSelf: "center", marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>
              Close
            </Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}
