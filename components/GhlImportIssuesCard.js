// Admin-only banner on the Clients page for GHL imports that did not land.
//
// This cannot be a per-row action on the roster, which is the obvious place
// to look for it: a failed import means the person is not on the roster at
// all. That invisibility is the whole problem the import log exists to fix,
// so the surface has to be a list of its own.
//
// Renders NOTHING when there is nothing wrong, and nothing at all for a
// non-admin (core.ghl_import_log is admin-read-only at the RLS level, so a
// coach would only ever see an empty list anyway). It also starts hidden and
// only appears once a real count comes back — a banner that flashes in and
// out on every page load is the exact thing the messaging nav item had to be
// fixed for.
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth/AuthProvider";
import { listGhlImportIssues, retryAllGhlImports, retryGhlImport } from "../lib/programming/ghlImports";
import { toastError, toastSuccess } from "../lib/toast";
import { formatDateTimeInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";

const TONE = {
  failed: { bg: "#fdece5", border: "#f0c9ba", text: "#b23a22", label: "Not imported" },
  // Amber rather than red: the account exists and can train — only the SMS
  // registration path is broken, which is a different severity.
  partial: { bg: "#fdf6e7", border: "#ead9b0", text: "#8a6a1f", label: "No contact id" },
};

function StatusPill({ status }) {
  const tone = TONE[status] ?? TONE.failed;
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
      style={{
        fontFamily: fonts.sansSemiBold,
        fontSize: 11.5,
        color: tone.text,
        backgroundColor: tone.bg,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      {tone.label}
    </Text>
  );
}

function IssueRow({ row, busy, onRetry }) {
  return (
    <View className="border-b py-3.5" style={{ borderColor: "#ece7e1" }}>
      <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#3b3531" }}>
            {row.name || row.email || "Unknown contact"}
          </Text>
          {row.email && row.name ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted }}>{row.email}</Text>
          ) : null}
          <View className="mt-1.5 flex-row flex-wrap items-center" style={{ gap: 8 }}>
            <StatusPill status={row.status} />
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
              {formatDateTimeInBoise(row.last_received_at)}
              {row.attempts > 1 ? ` | ${row.attempts} attempts` : ""}
            </Text>
          </View>
          {row.error ? (
            <Text className="mt-1.5" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#b23a22" }}>
              {row.error === "ghl_contact_id_conflict"
                ? `GHL contact ${row.ghl_contact_id ?? ""} already belongs to another account, so no SMS code can reach them. Reassign it, then retry.`
                : row.error}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => onRetry(row)}
          disabled={busy}
          className="rounded-lg border px-3 py-2"
          style={{ borderColor: "#d9d4cd", opacity: busy ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Pure presentation, exported separately from the data/auth wrapper below
// so it can be rendered against fixture rows without a login — this app has
// no way to sign in from the build environment, and an admin-only panel is
// otherwise unverifiable until it reaches Terra.
export function GhlImportIssuesPanel({ rows, busy, open, onOpen, onClose, onRetry, onRetryAll }) {
  if (!rows?.length) return null;
  return (
    <>
      <Pressable
        onPress={onOpen}
        className="mb-[18px] flex-row items-center rounded-xl border px-4 py-3"
        style={{ backgroundColor: "#fdece5", borderColor: "#f0c9ba", gap: 10 }}
      >
        <Ionicons name="alert-circle" size={18} color="#b23a22" />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#b23a22", flexShrink: 1 }}>
          {rows.length} GHL import{rows.length === 1 ? "" : "s"} need attention
        </Text>
        <Text className="ml-auto" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>
          Review
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
        <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
          <View className="w-full max-w-2xl rounded-2xl bg-white p-6" style={{ maxHeight: "85%" }}>
            <View className="mb-1 flex-row items-start justify-between" style={{ gap: 12 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.primaryOnWhite }}>GHL imports</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#78716c" />
              </Pressable>
            </View>
            <Text className="mb-4" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted }}>
              Webhooks from GoHighLevel that did not fully land. Retrying replays exactly what GHL sent — no need to
              re-fire the automation.
            </Text>

            <ScrollView style={{ flexShrink: 1 }}>
              {rows.map((row) => (
                <IssueRow key={row.id} row={row} busy={busy} onRetry={onRetry} />
              ))}
            </ScrollView>

            <View className="mt-4 flex-row items-center justify-end" style={{ gap: 10 }}>
              {busy ? <ActivityIndicator color={colors.primary} /> : null}
              <Pressable
                onPress={onRetryAll}
                disabled={busy}
                className="rounded-lg px-[18px] py-2.5"
                style={{ backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  Retry all
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function GhlImportIssuesCard({ onImported }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setRows(await listGhlImportIssues());
    } catch {
      // Silent: this is a secondary panel on someone else's page. A failure
      // to read it must never look like the Clients list itself is broken,
      // and there is nothing here a coach can act on.
      setRows([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // `describe` turns the Edge Function's own counts into a sentence, so a
  // retry that ran and still failed says so instead of reading as success.
  const runRetry = async (fn, label) => {
    setBusy(true);
    try {
      const result = await fn();
      const parts = [];
      if (result?.imported) parts.push(`${result.imported} imported`);
      if (result?.partial) parts.push(`${result.partial} still missing a contact id`);
      if (result?.failed) parts.push(`${result.failed} still failing`);
      toastSuccess(parts.length ? parts.join(", ") : label);
      await load();
      // Only worth reloading the roster behind us if somebody actually landed.
      if (result?.imported > 0) onImported?.();
    } catch (err) {
      toastError("Retry failed", err);
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <GhlImportIssuesPanel
      rows={rows}
      busy={busy}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onRetry={(row) => runRetry(() => retryGhlImport(row.id), "Nothing changed")}
      onRetryAll={() => runRetry(retryAllGhlImports, "Nothing changed")}
    />
  );
}
