import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Switch, Platform } from "react-native";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  getDocumentAdmin,
  saveDocument,
  setDocumentAssigned,
  setDocumentArchived,
  deleteDocument,
  deleteSignature,
} from "../../../../lib/programming/documents";
import { listCoaches } from "../../../../lib/programming/clients";
import { CoachShell } from "../../../../components/CoachShell";
import { PressFade } from "../../../../components/PressFade";
import { RichTextEditor } from "../../../../components/RichTextEditor";
import { confirmArchiveDocument, confirmDeleteSignature, confirmDelete } from "../../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { formatDateMDY } from "../../../../lib/formatDate";
import { dateInBoise } from "../../../../lib/boiseDate";
import { fonts, colors, statusColors } from "../../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";

function Card({ title, subtitle, children }) {
  return (
    <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, padding: 20, marginBottom: 18 }}>
      <Text style={{ fontFamily: fonts.sansBold, color: colors.muted, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 6 }}>{subtitle}</Text>
      ) : null}
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

function shortDate(timestamp) {
  return formatDateMDY(dateInBoise(new Date(timestamp)));
}

export default function ManageDocument() {
  const { documentId } = useLocalSearchParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Tracked rather than hardcoded to "html" on save. The native editor is
  // read-only, so a title-only edit there must not relabel an untouched
  // plain-text body as HTML — that would silently flatten its line breaks.
  const [bodyFormat, setBodyFormat] = useState("text");
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [requireResign, setRequireResign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyUser, setBusyUser] = useState(null);
  const [showVersions, setShowVersions] = useState(false);

  const load = useCallback(async () => {
    if (!documentId) return;
    try {
      setLoadError(null);
      // Staff names are cross-schema (core.users), so they're fetched
      // separately and merged rather than embedded — this repo's standing
      // rule about cross-schema PostgREST embeds.
      const [detail, coaches] = await Promise.all([getDocumentAdmin(documentId), listCoaches()]);
      if (!detail) {
        setLoadError("This document no longer exists.");
        return;
      }
      setData(detail);
      setStaff(coaches ?? []);
      setTitle(detail.document.title);
      setBody(detail.document.body);
      setBodyFormat(detail.document.body_format ?? "text");
      setRequiresSignature(detail.document.requires_signature);
      setRequireResign(false);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [documentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const document = data?.document;

  // The newest signature per person decides their status; a re-signed
  // document has more than one row for the same person.
  const latestByUser = useMemo(() => {
    const map = new Map();
    for (const s of data?.signatures ?? []) {
      const existing = map.get(s.user_id);
      if (!existing || s.signed_version > existing.signed_version) map.set(s.user_id, s);
    }
    return map;
  }, [data?.signatures]);

  const assignedIds = useMemo(() => new Set((data?.assignments ?? []).map((a) => a.user_id)), [data?.assignments]);

  const currentSignatureCount = useMemo(() => {
    if (!document) return 0;
    let n = 0;
    for (const s of latestByUser.values()) {
      if (s.signed_version >= document.signature_required_since) n += 1;
    }
    return n;
  }, [document, latestByUser]);

  if (profile && profile.role !== "admin") return <Redirect href="/(coach)/documents" />;

  const contentChanged = document
    ? title.trim() !== document.title || body !== document.body || bodyFormat !== (document.body_format ?? "text")
    : false;
  const settingsChanged = document ? requiresSignature !== document.requires_signature : false;
  const dirty = contentChanged || settingsChanged;

  const handleSave = async () => {
    if (!dirty || !title.trim()) return;
    setSaving(true);
    try {
      await saveDocument({
        documentId,
        currentVersion: document.version,
        title,
        body,
        bodyFormat,
        requiresSignature,
        // Only meaningful when someone has actually signed — a document
        // nobody has signed has nothing to invalidate.
        requiresResignature: requireResign && currentSignatureCount > 0,
        userId: profile?.id,
      });
      toastSuccess(requireResign && currentSignatureCount > 0 ? "Saved — everyone will be asked to sign again" : "Saved");
      await load();
    } catch (err) {
      toastError("Couldn't save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAssigned = async (userId, next) => {
    setBusyUser(userId);
    try {
      await setDocumentAssigned({ documentId, userId, assigned: next, assignedBy: profile?.id });
      await load();
    } catch (err) {
      toastError(next ? "Couldn't assign" : "Couldn't unassign", err);
    } finally {
      setBusyUser(null);
    }
  };

  const handleArchive = async () => {
    if (document.archived) {
      try {
        await setDocumentArchived(documentId, false);
        toastSuccess("Un-archived");
        await load();
      } catch (err) {
        toastError("Couldn't un-archive", err);
      }
      return;
    }
    const unsigned = Math.max(0, assignedIds.size - currentSignatureCount);
    if (!(await confirmArchiveDocument(document.title, unsigned))) return;
    try {
      await setDocumentArchived(documentId, true);
      toastSuccess("Archived");
      await load();
    } catch (err) {
      toastError("Couldn't archive", err);
    }
  };

  // Only offered while nothing has been signed. Once there's a signature,
  // archiving is the right move — deleting would cascade the record away.
  const handleDelete = async () => {
    const ok = await confirmDelete(
      `Delete "${document.title}"? Nobody has signed it, so there's no record to lose. This can't be undone.`,
      "Delete this document?"
    );
    if (!ok) return;
    try {
      await deleteDocument(documentId);
      toastSuccess("Deleted");
      router.push("/(coach)/documents/manage");
    } catch (err) {
      toastError("Couldn't delete", err);
    }
  };

  const handleRemoveSignature = async (signature, name) => {
    if (!(await confirmDeleteSignature(name, shortDate(signature.signed_at)))) return;
    try {
      await deleteSignature(signature.id);
      toastSuccess("Signature removed");
      await load();
    } catch (err) {
      toastError("Couldn't remove the signature", err);
    }
  };

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  // Signatures from people who are no longer assigned still belong in the
  // record — that's the whole "completed stays there" rule, seen from the
  // admin side.
  const unassignedSigners = (data?.signatures ?? []).filter((s) => !assignedIds.has(s.user_id));

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <PressFade
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/documents/manage"))}
          style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 }}
        >
          <Ionicons name="chevron-back" size={16} color={colors.primaryOnWhite} />
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>Manage documents</Text>
        </PressFade>

        {loadError ? (
          <View style={{ backgroundColor: statusColors.urgent.bg, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontFamily: fonts.sans, color: statusColors.urgent.text, fontSize: 13 }}>{loadError}</Text>
            <PressFade onPress={load} style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 13 }}>Retry</Text>
            </PressFade>
          </View>
        ) : !data ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ maxWidth: 760, width: "100%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>{document.title}</Text>
              {document.archived ? (
                <View style={{ backgroundColor: statusColors.paused.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: statusColors.paused.text, fontSize: 11 }}>Archived</Text>
                </View>
              ) : null}
            </View>

            <Card title="Document" subtitle={`Version ${document.version} · last edited ${shortDate(document.updated_at)}`}>
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, marginBottom: 6 }}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={{ borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 12, fontFamily: fonts.sans, fontSize: 16, color: "#44403c" }}
              />

              <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, marginTop: 16, marginBottom: 6 }}>Body</Text>
              {/* resetKey carries the version, so a save re-seeds the editor
                  from what actually landed rather than leaving the DOM's own
                  copy on screen. */}
              <RichTextEditor
                initialValue={document.body}
                initialFormat={document.body_format ?? "text"}
                resetKey={`${documentId}:${document.version}`}
                onChange={(html) => {
                  setBody(html);
                  setBodyFormat("html");
                }}
              />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 14 }}>Requires a signature</Text>
                  <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 2 }}>
                    Off = reference only, shown to read but never asked for.
                  </Text>
                </View>
                <Switch value={requiresSignature} onValueChange={setRequiresSignature} trackColor={{ true: colors.primary }} />
              </View>

              {/* The re-signature choice only appears when there's actually
                  something to invalidate, and only once the content has
                  changed — offering it on an untouched form would invite
                  re-signing over a save that changed nothing. */}
              {currentSignatureCount > 0 && contentChanged ? (
                <PressFade
                  onPress={() => setRequireResign((v) => !v)}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    marginTop: 18,
                    backgroundColor: requireResign ? statusColors.needsAction.bg : "#faf8f6",
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <Ionicons name={requireResign ? "checkbox" : "square-outline"} size={22} color={requireResign ? statusColors.needsAction.text : "#a8a29e"} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c", fontSize: 13.5 }}>
                      Ask everyone to sign this again
                    </Text>
                    <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 }}>
                      Leave this off for a typo or a formatting fix — the {currentSignatureCount} existing signature
                      {currentSignatureCount === 1 ? "" : "s"} stay valid. Tick it if the actual content changed. Either
                      way, what each person already signed is kept.
                    </Text>
                  </View>
                </PressFade>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <PressFade
                  onPress={handleSave}
                  disabled={!dirty || !title.trim() || saving}
                  style={{ borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 11, opacity: !dirty || !title.trim() || saving ? 0.5 : 1 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "white", fontSize: 14 }}>{saving ? "Saving…" : "Save"}</Text>
                </PressFade>
                {dirty ? (
                  <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12 }}>Unsaved changes</Text>
                ) : null}
              </View>
            </Card>

            <Card
              title="Assigned to"
              subtitle="Tick everyone who needs this. It appears in their Documents tab straight away; unticking removes it from their list but keeps anything they already signed."
            >
              {staff.length === 0 ? (
                <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 13 }}>No staff accounts yet.</Text>
              ) : (
                staff.map((person) => {
                  const assigned = assignedIds.has(person.id);
                  const signature = latestByUser.get(person.id);
                  const current = signature && signature.signed_version >= document.signature_required_since;
                  let status = null;
                  let statusColor = colors.muted;
                  if (!document.requires_signature) {
                    status = assigned ? "Reference" : null;
                  } else if (current) {
                    status = `Signed ${shortDate(signature.signed_at)}`;
                    statusColor = OLIVE;
                  } else if (signature) {
                    status = "Needs re-signing";
                    statusColor = statusColors.needsAction.text;
                  } else if (assigned) {
                    status = "Not signed yet";
                    statusColor = statusColors.needsAction.text;
                  }
                  return (
                    <View
                      key={person.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 10,
                        borderTopWidth: 1,
                        borderTopColor: "#f5f2ee",
                      }}
                    >
                      <PressFade
                        onPress={() => handleToggleAssigned(person.id, !assigned)}
                        disabled={busyUser === person.id}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0, opacity: busyUser === person.id ? 0.5 : 1 }}
                      >
                        <Ionicons name={assigned ? "checkbox" : "square-outline"} size={22} color={assigned ? colors.primary : "#a8a29e"} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 14 }}>
                            {person.name ?? person.email}
                          </Text>
                          {status ? (
                            <Text style={{ fontFamily: fonts.sans, color: statusColor, fontSize: 12, marginTop: 2 }}>{status}</Text>
                          ) : null}
                        </View>
                      </PressFade>
                      {signature ? (
                        <PressFade
                          onPress={() => handleRemoveSignature(signature, person.name ?? person.email)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="trash-outline" size={16} color={statusColors.urgent.text} />
                        </PressFade>
                      ) : null}
                    </View>
                  );
                })
              )}
            </Card>

            {unassignedSigners.length > 0 ? (
              <Card
                title="Signed, no longer assigned"
                subtitle="Kept on the record. Removing someone from the list above never erases what they signed."
              >
                {unassignedSigners.map((s) => (
                  <View key={s.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f5f2ee" }}>
                    <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 14 }}>
                      {staffById.get(s.user_id)?.name ?? s.typed_name}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 2 }}>
                      Signed "{s.typed_name}" on {shortDate(s.signed_at)} · version {s.signed_version}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card title="History">
              <PressFade onPress={() => setShowVersions((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>
                  {data.versions.length} version{data.versions.length === 1 ? "" : "s"}
                </Text>
                <Ionicons name={showVersions ? "chevron-up" : "chevron-down"} size={14} color={colors.primaryOnWhite} />
              </PressFade>
              {showVersions
                ? data.versions.map((v) => (
                    <View key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f5f2ee", marginTop: 8 }}>
                      <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c", fontSize: 13, width: 34 }}>v{v.version}</Text>
                      <Text style={{ flex: 1, fontFamily: fonts.sans, color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                        {shortDate(v.created_at)} · {v.title}
                      </Text>
                      {v.requires_resignature ? (
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: statusColors.needsAction.text, fontSize: 11 }}>Re-sign</Text>
                      ) : null}
                    </View>
                  ))
                : null}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <PressFade onPress={handleArchive} style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 18, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 13 }}>
                    {document.archived ? "Un-archive" : "Archive"}
                  </Text>
                </PressFade>
                {data.signatures.length === 0 ? (
                  <PressFade onPress={handleDelete} style={{ borderRadius: 999, borderWidth: 1, borderColor: statusColors.urgent.bg, paddingHorizontal: 18, paddingVertical: 10 }}>
                    <Text style={{ fontFamily: fonts.sansMedium, color: statusColors.urgent.text, fontSize: 13 }}>Delete</Text>
                  </PressFade>
                ) : null}
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
