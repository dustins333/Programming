import { useCallback, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Switch, Platform } from "react-native";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listDocumentsAdmin, createDocument } from "../../../../lib/programming/documents";
import { CoachShell } from "../../../../components/CoachShell";
import { PressFade } from "../../../../components/PressFade";
import { RichTextEditor } from "../../../../components/RichTextEditor";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors, statusColors } from "../../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";

function Chip({ label, bg, color }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, color, fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

// Admin only, matching announcements/events/help videos: gym-wide published
// content, not a coaching module, so it's the admin role rather than a
// can_view_* toggle.
export default function ManageDocuments() {
  const router = useRouter();
  const { profile } = useAuth();
  const [documents, setDocuments] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [saving, setSaving] = useState(false);
  // Bumped whenever the form opens or clears, so the (uncontrolled) editor
  // re-seeds. Never keyed on `body` — that would reset it on every keystroke.
  const [composeKey, setComposeKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setDocuments(await listDocumentsAdmin());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && profile.role !== "admin") return <Redirect href="/(coach)/documents" />;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = await createDocument({
        title,
        body,
        bodyFormat: "html",
        requiresSignature,
        createdBy: profile?.id,
      });
      setComposing(false);
      setTitle("");
      setBody("");
      setComposeKey((k) => k + 1);
      setRequiresSignature(true);
      toastSuccess("Document created — now assign it");
      // Straight into the document, because a document nobody is assigned
      // to does nothing. Assignment is the step that makes it real.
      router.push(`/(coach)/documents/manage/${id}`);
    } catch (err) {
      toastError("Couldn't create the document", err);
    } finally {
      setSaving(false);
    }
  };

  const visible = (documents ?? []).filter((d) => (showArchived ? d.archived : !d.archived));
  const archivedCount = (documents ?? []).filter((d) => d.archived).length;

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 20, paddingBottom: 70 }}>
        <PressFade
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/documents"))}
          style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 }}
        >
          <Ionicons name="chevron-back" size={16} color={colors.primaryOnWhite} />
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>My documents</Text>
        </PressFade>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Manage documents</Text>
          {!composing ? (
            <PressFade
              onPress={() => {
                setComposeKey((k) => k + 1);
                setComposing(true);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9 }}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 13 }}>New document</Text>
            </PressFade>
          ) : null}
        </View>
        <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 20, maxWidth: 620 }}>
          Write or paste the document, then assign it to the people who need it. Nobody sees a document until it's assigned to them.
        </Text>

        {composing ? (
          <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, padding: 20, marginBottom: 24, maxWidth: 760 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, marginBottom: 6 }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Nutrition Coaching SOP"
              placeholderTextColor={colors.hint}
              style={{ borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 12, fontFamily: fonts.sans, fontSize: 16, color: "#44403c" }}
            />

            <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, marginTop: 16, marginBottom: 6 }}>
              Body — paste it in
            </Text>
            <RichTextEditor initialValue="" initialFormat="html" resetKey={composeKey} onChange={setBody} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 14 }}>Requires a signature</Text>
                <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  Off = reference only. It shows up to read, but never asks anyone to sign.
                </Text>
              </View>
              <Switch value={requiresSignature} onValueChange={setRequiresSignature} trackColor={{ true: colors.primary }} />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <PressFade
                onPress={handleCreate}
                disabled={!title.trim() || saving}
                style={{ borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 11, opacity: !title.trim() || saving ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 14 }}>
                  {saving ? "Creating…" : "Create & assign"}
                </Text>
              </PressFade>
              <PressFade
                onPress={() => setComposing(false)}
                style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 20, paddingVertical: 11 }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 14 }}>Cancel</Text>
              </PressFade>
            </View>
          </View>
        ) : null}

        {loadError ? (
          <View style={{ backgroundColor: statusColors.urgent.bg, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontFamily: fonts.sans, color: statusColors.urgent.text, fontSize: 13 }}>Couldn't load documents: {loadError}</Text>
            <PressFade onPress={load} style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 13 }}>Retry</Text>
            </PressFade>
          </View>
        ) : !documents ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ maxWidth: 760 }}>
            {visible.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 13 }}>
                {showArchived ? "Nothing archived." : "No documents yet."}
              </Text>
            ) : (
              visible.map((d) => {
                const outstanding = d.assignedCount - d.signedCount;
                return (
                  <PressFade
                    key={d.id}
                    onPress={() => router.push(`/(coach)/documents/manage/${d.id}`)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: "white",
                      borderWidth: 1,
                      borderColor: CARD_BORDER,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text numberOfLines={2} style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 14 }}>
                          {d.title}
                        </Text>
                        {!d.requires_signature ? <Chip label="Reference" bg={statusColors.paused.bg} color={statusColors.paused.text} /> : null}
                        {d.archived ? <Chip label="Archived" bg={statusColors.paused.bg} color={statusColors.paused.text} /> : null}
                      </View>
                      <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 4 }}>
                        {d.assignedCount === 0
                          ? "Not assigned to anyone yet"
                          : d.requires_signature
                            ? `${d.signedCount} of ${d.assignedCount} signed`
                            : `Assigned to ${d.assignedCount}`}
                      </Text>
                    </View>
                    {d.requires_signature && outstanding > 0 && !d.archived ? (
                      <Chip label={`${outstanding} pending`} bg={statusColors.needsAction.bg} color={statusColors.needsAction.text} />
                    ) : d.requires_signature && d.assignedCount > 0 ? (
                      <Ionicons name="checkmark-circle" size={18} color={OLIVE} />
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color="#a8a29e" />
                  </PressFade>
                );
              })
            )}

            {archivedCount > 0 || showArchived ? (
              <PressFade onPress={() => setShowArchived((v) => !v)} style={{ alignSelf: "flex-start", marginTop: 8, paddingVertical: 8 }}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>
                  {showArchived ? "← Back to active documents" : `Archived (${archivedCount}) →`}
                </Text>
              </PressFade>
            ) : null}
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
