import { useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getMyDocuments } from "../../../lib/programming/documents";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { formatDateMDY } from "../../../lib/formatDate";
import { dateInBoise } from "../../../lib/boiseDate";
import { fonts, colors, statusColors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";

function Row({ document, meta, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: tone === "pending" ? colors.primary : CARD_BORDER,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 10,
      }}
    >
      <Ionicons
        name={tone === "pending" ? "create-outline" : tone === "signed" ? "checkmark-circle" : "document-text-outline"}
        size={20}
        color={tone === "pending" ? colors.primary : tone === "signed" ? "#4d6142" : colors.muted}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 14 }}>
          {document.title}
        </Text>
        <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 3 }}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#a8a29e" />
    </PressFade>
  );
}

function Section({ title, count, children }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <Text
        style={{
          fontFamily: fonts.sansBold,
          color: colors.muted,
          fontSize: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
        {count != null ? ` (${count})` : ""}
      </Text>
      {children}
    </View>
  );
}

// Every coach's own documents. Not permission-gated: what a person sees is
// decided entirely by what an admin has assigned them, so there is nothing
// for a module toggle to add here.
export default function MyDocuments() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setLoadError(null);
      setState(await getMyDocuments(profile.id));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [profile?.id]);

  // useFocusEffect, not a mount-only effect — signing a document pushes
  // back here, and the row has to move out of Pending when it does.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = (id) => router.push(`/(coach)/documents/${id}`);

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Documents</Text>
          {isAdmin ? (
            <PressFade
              onPress={() => router.push("/(coach)/documents/manage")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                backgroundColor: "white",
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Ionicons name="settings-outline" size={15} color={colors.primaryOnWhite} />
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Manage</Text>
            </PressFade>
          ) : null}
        </View>

        {loadError ? (
          <View style={{ backgroundColor: statusColors.urgent.bg, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontFamily: fonts.sans, color: statusColors.urgent.text, fontSize: 13 }}>
              Couldn't load your documents: {loadError}
            </Text>
            <PressFade onPress={load} style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 13 }}>Retry</Text>
            </PressFade>
          </View>
        ) : !state ? (
          <ActivityIndicator color={colors.primary} />
        ) : state.pending.length === 0 && state.completed.length === 0 && state.reference.length === 0 ? (
          <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, padding: 22 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 15 }}>Nothing to read yet</Text>
            <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              When an SOP or agreement is assigned to you it'll show up here.
            </Text>
          </View>
        ) : (
          <>
            {state.pending.length > 0 ? (
              <Section title="Needs your signature" count={state.pending.length}>
                {state.pending.map(({ document }) => (
                  <Row
                    key={document.id}
                    document={document}
                    tone="pending"
                    meta="Read and sign"
                    onPress={() => open(document.id)}
                  />
                ))}
              </Section>
            ) : null}

            {state.reference.length > 0 ? (
              <Section title="Reference" count={state.reference.length}>
                {state.reference.map(({ document }) => (
                  <Row key={document.id} document={document} tone="reference" meta="No signature needed" onPress={() => open(document.id)} />
                ))}
              </Section>
            ) : null}

            {state.completed.length > 0 ? (
              <Section title="Completed" count={state.completed.length}>
                {state.completed.map(({ document, signature }) => (
                  <Row
                    key={document.id}
                    document={document}
                    tone="signed"
                    meta={signature ? `Signed ${formatDateMDY(dateInBoise(new Date(signature.signed_at)))}` : "Signed"}
                    onPress={() => open(document.id)}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
