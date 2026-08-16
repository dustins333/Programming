import { Modal, View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { PressFade } from "../PressFade";
import { fonts } from "../../lib/theme";

// The full-screen finalize moment (design_handoff_member_finalize_v1) —
// replaces the plain "Workout finalized — nice work!" toast that used to be
// the entire celebration. One squircle "plate" carrying `completed/target`,
// styled by whichever of four faces was drawn (see lib/finalizePlateDraw.js
// for the draw/storage rules; this component is purely presentational —
// every prop below is already resolved by the caller).
//
// `plate` shape: { sessionName, eyebrow, completed, target, subline, face,
// meta }. `eyebrow` is what actually renders at the top — normally
// `sessionName`, but the olive/ink forced faces override it (see plan.js's
// buildFinalizePlate).

const PLATE_SIZE = 262;
// border-radius: 99px is a FIXED radius, not a ratio — on a 262px box it
// renders as a squircle; on a differently-sized box the same declaration
// would be a different shape (see the README's "Shape" section). Keep this
// proportional (0.38 × box) if the plate is ever resized.
const PLATE_RADIUS = 99;

const FACES = {
  cream: {
    plateBg: "#eee9e0",
    plateBorder: "#e2ddd6",
    sheen: "rgba(255,255,255,.7)",
    eyebrow: "#a8a29e",
    count: "#4d6142",
    sub: "#57534e",
    rule: "rgba(42,33,28,.16)",
    wordmark: "#a8a29e",
  },
  clay: {
    plateBg: "#a46a57",
    plateBorder: null,
    sheen: "rgba(255,255,255,.18)",
    eyebrow: "rgba(255,255,255,.75)",
    count: "#fff",
    sub: "rgba(255,255,255,.82)",
    rule: "rgba(247,243,238,.24)",
    wordmark: "rgba(247,243,238,.5)",
  },
  olive: {
    plateBg: "#4d6142",
    plateBorder: null,
    sheen: "rgba(224,176,112,.22)",
    eyebrow: "#e0b070",
    count: "#f7f3ee",
    sub: "rgba(247,243,238,.8)",
    rule: "rgba(247,243,238,.24)",
    wordmark: "rgba(247,243,238,.5)",
  },
  ink: {
    plateBg: "#33251f",
    plateBorder: null,
    sheen: "rgba(224,176,112,.22)",
    eyebrow: "#e0b070",
    count: "#f7f3ee",
    sub: "rgba(247,243,238,.72)",
    rule: "rgba(247,243,238,.24)",
    wordmark: "rgba(247,243,238,.5)",
  },
};

const CANVAS = "#faf8f6";

export function FinalizePlate({ plate, onDone }) {
  const insets = useSafeAreaInsets();
  if (!plate) return null;
  const tone = FACES[plate.face] ?? FACES.cream;

  return (
    <Modal visible={!!plate} animationType="fade" onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <View style={{ alignItems: "center", paddingTop: insets.top + 64, paddingHorizontal: 24 }}>
          <View
            style={{
              width: PLATE_SIZE,
              height: PLATE_SIZE,
              borderRadius: PLATE_RADIUS,
              backgroundColor: tone.plateBg,
              borderWidth: tone.plateBorder ? 1 : 0,
              borderColor: tone.plateBorder ?? "transparent",
              overflow: "hidden",
              shadowColor: "#44403c",
              shadowOpacity: 0.08,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
            <Svg width={PLATE_SIZE} height={PLATE_SIZE} style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="plateSheen" cx="34%" cy="24%" r="70%">
                  <Stop offset="0%" stopColor={tone.sheen} />
                  <Stop offset="62%" stopColor={tone.sheen} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width={PLATE_SIZE} height={PLATE_SIZE} fill="url(#plateSheen)" />
            </Svg>

            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.sansBold,
                  fontSize: 8.5,
                  letterSpacing: 2,
                  color: tone.eyebrow,
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                {plate.eyebrow}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 70,
                  lineHeight: 63,
                  color: tone.count,
                  marginTop: 6,
                }}
              >
                {plate.completed}/{plate.target}
              </Text>
              <View style={{ width: 34, height: 1, backgroundColor: tone.rule, marginTop: 16, marginBottom: 16 }} />
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.sans, fontSize: 11, color: tone.sub, textAlign: "center" }}
              >
                {plate.subline}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sansBold,
                  fontSize: 7.5,
                  letterSpacing: 1.6,
                  color: tone.wordmark,
                  textAlign: "center",
                  marginTop: 18,
                  lineHeight: 11,
                }}
              >
                KOVA{"\n"}STRENGTH
              </Text>
            </View>
          </View>

          {/* A squircle can't hold a sentence, so the facts sit under it. */}
          {plate.meta ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", textAlign: "center", marginTop: 20 }}>
              {plate.meta}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
          <PressFade
            onPress={onDone}
            style={{ height: 54, borderRadius: 16, backgroundColor: "#a46a57", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#fff" }}>Done</Text>
          </PressFade>
        </View>
      </View>
    </Modal>
  );
}
