import { useCallback, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getMyDocument, signDocument, isSignatureCurrent, isPendingFor } from "../../../lib/programming/documents";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { RichTextView } from "../../../components/RichTextView";
import { toastError, toastSuccess } from "../../../lib/toast";
import { formatDateMDY } from "../../../lib/formatDate";
import { dateInBoise } from "../../../lib/boiseDate";
import { fonts, colors, statusColors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";

// The exact wording someone is agreeing to. Kept as one constant so the
// attestation can't drift between the box they tick and anything that
// quotes it later.
export const ATTESTATION =
  "I have read this document in full and agree to it. Typing my name below is my signature.";

export default function DocumentDetail() {
  const { documentId } = useLocalSearchParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id || !documentId) return;
    try {
      setLoadError(null);
      setState(await getMyDocument(documentId, profile.id));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [documentId, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push("/(coach)/documents");
  };

  const handleSign = async () => {
    const name = typedName.trim();
    if (!name || !agreed) return;
    setSigning(true);
    try {
      await signDocument({
        documentId,
        userId: profile.id,
        version: state.document.version,
        typedName: name,
      });
      toastSuccess("Signed");
      goBack();
    } catch (err) {
      toastError("Couldn't record your signature", err);
    } finally {
      setSigning(false);
    }
  };

  const document = state?.document;
  const signature = state?.signature;
  const signed = document ? isSignatureCurrent(document, signature) : false;
  const needsSignature = document ? isPendingFor(document, signature) : false;
  // A re-signature ask, rather than a first one — worth saying, because the
  // document they already signed has materially changed.
  const isResign = needsSignature && Boolean(signature);
  // Show the snapshot they signed rather than today's wording whenever the
  // two differ and nothing is being asked of them, or the record would
  // misrepresent what they agreed to.
  const shown = state?.signedSnapshot ?? document;
  const ready = typedName.trim().length > 0 && agreed;

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <PressFade onPress={goBack} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 }}>
          <Ionicons name="chevron-back" size={16} color={colors.primaryOnWhite} />
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>Documents</Text>
        </PressFade>

        {loadError ? (
          <View style={{ backgroundColor: statusColors.urgent.bg, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontFamily: fonts.sans, color: statusColors.urgent.text, fontSize: 13 }}>
              Couldn't load this document: {loadError}
            </Text>
            <PressFade onPress={load} style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 13 }}>Retry</Text>
            </PressFade>
          </View>
        ) : !state ? (
          <ActivityIndicator color={colors.primary} />
        ) : !document ? (
          <Text style={{ fontFamily: fonts.sans, color: colors.muted }}>This document is no longer available to you.</Text>
        ) : (
          <View style={{ maxWidth: 760, width: "100%" }}>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26, marginBottom: 4 }}>{shown.title}</Text>

            {signed ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: statusColors.onTrack.bg,
                  borderWidth: 1,
                  borderColor: OLIVE,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginTop: 10,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color={OLIVE} />
                <Text style={{ flex: 1, fontFamily: fonts.sansMedium, color: OLIVE, fontSize: 13 }}>
                  Signed by {signature.typed_name} on {formatDateMDY(dateInBoise(new Date(signature.signed_at)))}
                </Text>
              </View>
            ) : null}

            {state.signedSnapshot ? (
              <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginBottom: 14, lineHeight: 18 }}>
                This document has been edited since you signed it. You're reading the version you agreed to.
              </Text>
            ) : null}

            {isResign ? (
              <View
                style={{
                  backgroundColor: statusColors.needsAction.bg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginTop: 10,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: statusColors.needsAction.text, fontSize: 13 }}>
                  This has been updated and needs signing again.
                </Text>
              </View>
            ) : null}

            <View
              style={{
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 16,
                padding: 20,
              }}
            >
              {/* Renders the formatting the document was pasted in with.
                  `shown` is the signed snapshot when there is one, so the
                  format has to come from the same object as the body — an
                  older version can be plain text while the live one is not. */}
              <RichTextView body={shown.body} format={shown.body_format} />
            </View>

            {needsSignature ? (
              <View
                style={{
                  backgroundColor: "white",
                  borderWidth: 2,
                  borderColor: colors.primary,
                  borderRadius: 16,
                  padding: 20,
                  marginTop: 18,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" }}>
                  Sign
                </Text>

                <PressFade
                  onPress={() => setAgreed((v) => !v)}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14 }}
                >
                  <Ionicons
                    name={agreed ? "checkbox" : "square-outline"}
                    size={22}
                    color={agreed ? OLIVE : "#a8a29e"}
                  />
                  <Text style={{ flex: 1, fontFamily: fonts.sans, color: "#44403c", fontSize: 13.5, lineHeight: 20 }}>
                    {ATTESTATION}
                  </Text>
                </PressFade>

                <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, marginTop: 16, marginBottom: 6 }}>
                  Full name
                </Text>
                <TextInput
                  value={typedName}
                  onChangeText={setTypedName}
                  placeholder={profile?.name ?? "Your full name"}
                  placeholderTextColor={colors.hint}
                  autoCapitalize="words"
                  style={{
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: Platform.OS === "web" ? 10 : 12,
                    fontFamily: fonts.sans,
                    fontSize: 16,
                    color: "#44403c",
                  }}
                />

                <PressFade
                  onPress={handleSign}
                  disabled={!ready || signing}
                  style={{
                    marginTop: 16,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    paddingVertical: 13,
                    alignItems: "center",
                    // House rule: a disabled button dims itself. NativeWind's
                    // disabled:opacity-50 does nothing (it only sets
                    // aria-disabled), so this is an inline style.
                    opacity: !ready || signing ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 15 }}>
                    {signing ? "Signing…" : isResign ? "Sign updated version" : "Sign document"}
                  </Text>
                </PressFade>

                {!ready ? (
                  <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 10, textAlign: "center" }}>
                    Tick the box and type your name to sign.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
