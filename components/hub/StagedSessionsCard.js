import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { describeWhen } from "../coach/StagingTray";
import {
  listMyStagedSessions,
  resolveStagedSession,
  startStagedSession,
  deleteStagedSession,
  finalizeStagedSession,
} from "../../lib/programming/hubStaging";
import { confirmDiscardStaged, confirmTakeOverBoard } from "../../lib/confirmDialog";
import { showToast, toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// What a coach has waiting, on the live-session page: review it, fix it,
// start it.
//
// It renders whether or not a session is already running, which is the point
// — when another coach's board is live, this is where the "end theirs and
// start mine" conversation happens. On the wall there is no such control at
// all (the start affordance only exists on the idle screen), so the phone is
// the only place that collision can occur, and the only place it has to be
// asked about.

const CARD_BORDER = "#ece7e1";
const ROW_DIVIDER = "#f4f1ec";
const INK = "#2a211c";
const TINT_BG = "#fdf6f2";
const TINT_BORDER = "#f0ddd2";
const WARN = "#b23a22";

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

function StagedCard({ group, onStart, onEdit, onDelete, onFinalize, onReview, busy }) {
  const clients = group.clients ?? [];
  const resolved = group.resolved ?? [];
  const blocked = resolved.filter((r) => !r.resolvable);
  const startable = resolved.length > 0 ? resolved.length - blocked.length : clients.length;
  const draft = !group.finalized_at;

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: draft ? TINT_BORDER : CARD_BORDER,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
        marginTop: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* The row IS the way in to the block overviews. A separate "Review"
            link under it was the discoverable-to-nobody version of this. */}
        <PressFade
          onPress={onReview}
          disabled={!onReview || clients.length === 0}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
          {/* Title sits with the time, never with the names — appended to the
              name list it reads as one more client. */}
          {/* Two lines, not one: a named group truncated the time itself
              ("5:00 AM · Thu, Aug 27 Bri…"), and the time is the one thing
              on this card that has to stay readable. */}
          <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 15.5, color: INK }}>
            {describeWhen(group)}
            {group.title ? <Text style={{ fontFamily: fonts.sans, color: colors.muted }}>{`  ${group.title}`}</Text> : null}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
            {clients.length === 0 ? "Nobody staged yet" : clients.map((c) => firstNameOf(c.client_name)).join(" · ")}
          </Text>
          </View>
          {onReview && clients.length > 0 ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
        </PressFade>
        {draft ? (
          <PressFade
            onPress={onFinalize}
            disabled={busy || clients.length === 0}
            style={{
              borderRadius: 999,
              backgroundColor: colors.primary,
              paddingHorizontal: 15,
              paddingVertical: 9,
              opacity: busy || clients.length === 0 ? 0.5 : 1,
            }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
              Finalize
            </Text>
          </PressFade>
        ) : (
          <PressFade
            onPress={onStart}
            disabled={busy || startable === 0}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              borderRadius: 999,
              backgroundColor: colors.primary,
              paddingHorizontal: 15,
              paddingVertical: 9,
              opacity: busy || startable === 0 ? 0.5 : 1,
            }}
          >
            <Ionicons name="play" size={12} color="#fff" />
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
              {`Start${startable ? ` (${startable})` : ""}`}
            </Text>
          </PressFade>
        )}
      </View>

      {draft ? (
        <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 7, fontFamily: fonts.sans, fontSize: type.eyebrow, color: "#7a5c49" }}>
          Still being built — not on the board until you finalize it.
        </Text>
      ) : null}

      {/* Named before anyone taps Start, rather than reported at 5am. */}
      {blocked.map((b) => (
        <View key={b.userId} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
          <Ionicons name="alert-circle-outline" size={13} color={WARN} />
          <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sans, fontSize: type.eyebrow, color: WARN }}>
            {`${firstNameOf(b.name)} — ${b.reason ?? "can't start"}`}
          </Text>
        </View>
      ))}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 11, borderTopWidth: 1, borderTopColor: ROW_DIVIDER, paddingTop: 9 }}>
        <PressFade onPress={onEdit} hitSlop={8}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            Edit
          </Text>
        </PressFade>
        <PressFade onPress={onDelete} hitSlop={8}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.muted }}>
            Delete
          </Text>
        </PressFade>
      </View>
    </View>
  );
}

// Loading lives here rather than in the card, because the screen above needs
// the count before it can decide what its own selector says — a coach with
// something staged gets "Staged sessions" where a coach with nothing gets
// "Stage a session".
export function useStagedSessions(profileId, refreshKey = 0) {
  const [groups, setGroups] = useState(null);

  const reload = useCallback(async () => {
    if (!profileId) return;
    try {
      const rows = await listMyStagedSessions(profileId);
      // Resolve each so "Rae can't start" shows on the card. One RPC per
      // group, and a coach has one or two — not worth batching, and a
      // failure here must only cost the warning line, not the card.
      const withResolved = await Promise.all(
        rows.map(async (g) => ({
          ...g,
          resolved: await resolveStagedSession(g.id, g.scheduled_date).catch(() => []),
        }))
      );
      setGroups(withResolved);
    } catch {
      setGroups([]);
    }
  }, [profileId]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { groups, reload };
}

export function StagedSessionsCard({ groups, reload, openSession, onStarted, onReview, onDeleted, showHeading = true }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleStart = async (group) => {
    if (busy) return;
    if (openSession && !(await confirmTakeOverBoard(openSession.coach_name?.split(" ")[0] ?? null))) return;
    setBusy(true);
    try {
      const res = await startStagedSession(group.id);
      const skipped = res?.skipped ?? [];
      if (skipped.length > 0) {
        showToast(`Started without ${skipped.map((x) => firstNameOf(x.name)).join(", ")} — ${(skipped[0].reason ?? "").toLowerCase()}.`);
      } else {
        showToast("On the board.");
      }
      await reload?.();
      await onStarted?.();
    } catch (e) {
      toastError("Couldn't start it.", e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (group) => {
    if (!(await confirmDiscardStaged(describeWhen(group)))) return;
    try {
      await deleteStagedSession(group.id);
      // Before the reload: the screen above may be holding this group as the
      // one it is editing, and it must not still be doing so once the list
      // re-renders without it.
      onDeleted?.(group);
      await reload?.();
    } catch (e) {
      toastError("Couldn't delete it.", e);
    }
  };

  const handleFinalize = async (group) => {
    try {
      await finalizeStagedSession(group.id);
      await reload?.();
      showToast("On the board for that morning.");
    } catch (e) {
      toastError("Couldn't finalize it.", e);
    }
  };

  if (groups === null) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (groups.length === 0) return null;

  return (
    <View style={{ marginBottom: 18 }}>
      {showHeading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Eyebrow>Staged</Eyebrow>
          <View style={{ flex: 1, height: 1, backgroundColor: ROW_DIVIDER }} />
        </View>
      ) : null}
      {groups.map((g) => (
        <StagedCard
          key={g.id}
          group={g}
          busy={busy}
          onStart={() => handleStart(g)}
          onEdit={() => router.push(`/(coach)/spc/live?staging=${g.id}`)}
          onReview={onReview ? () => onReview(g, g.resolved ?? []) : undefined}
          onDelete={() => handleDelete(g)}
          onFinalize={() => handleFinalize(g)}
        />
      ))}
    </View>
  );
}
