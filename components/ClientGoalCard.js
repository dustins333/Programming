import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { setClientGoal } from "../lib/programming/clientGoals";
import { toastError } from "../lib/toast";
import { fonts, colors, type } from "../lib/theme";

// The one card a coach and a client both see (migration 0078).
//
// It is deliberately the ONLY solid-clay card surface in the app. Dark was
// rejected because the SPC client page already uses #33251f for the SPC pill
// and the CURRENT BLOCK band; light peach was rejected because it is the
// app's ordinary card treatment and this card's whole job is to not look
// ordinary.
//
// HOW "THE CLIENT SEES THIS TOO" IS COMMUNICATED, per an explicit decision:
// no explanatory sentence on the resting card. Three things carry it
// instead — (1) the card is identical on both sides, so nothing about it
// reads as coach chrome; (2) a single eye glyph, coach-side only; (3) the
// words appear ONLY in the editor, which is the moment they actually matter.
// If you are tempted to add a "shared with the client" line to the resting
// card, don't — that was asked for and turned down.

const CLAY_EYEBROW = "#f5d9cd";
const CLAY_TEXT = "#fff9f6";
const CARD_BORDER = "#ece7e1";

function firstNameOf(name) {
  // (name ?? "") — a core.users row linked by an admin can have a null name
  // until that person registers.
  return (name ?? "").trim().split(/\s+/)[0] || "They";
}

// ---------------------------------------------------------------------------
// Resting card
// ---------------------------------------------------------------------------
function GoalHero({ goal, showSharedMark, onEdit }) {
  const body = (
    <View style={{ borderRadius: 16, backgroundColor: colors.primary, padding: 16, overflow: "hidden" }}>
      {/* Same decorative bleeding circle My Week's hero carries, so the app's
          filled hero surfaces read as one family. */}
      <View
        style={{
          position: "absolute",
          right: -34,
          top: -34,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="flag" size={12} color={CLAY_EYEBROW} />
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1.2, color: CLAY_EYEBROW }}
        >
          WORKING TOWARD
        </Text>
        <View style={{ flex: 1 }} />
        {showSharedMark ? <Ionicons name="eye-outline" size={14} color="#e8c4b6" /> : null}
      </View>
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: CLAY_TEXT, marginTop: 7 }}
      >
        {goal}
      </Text>
    </View>
  );

  if (!onEdit) return body;
  return (
    <PressFade onPress={onEdit} accessibilityLabel="Edit goal" style={{}}>
      {body}
    </PressFade>
  );
}

// ---------------------------------------------------------------------------
// Coach-only empty state. A member with no goal renders nothing at all —
// never "no goal set" (standing rule: a member must not be made to feel
// they're missing something).
// ---------------------------------------------------------------------------
function GoalEmpty({ onEdit }) {
  return (
    <PressFade onPress={onEdit} accessibilityLabel="Set a goal" style={{}}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: "#ddd6cd",
          backgroundColor: "#fdfbf8",
          padding: 16,
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1.2, color: colors.hint }}>
          WORKING TOWARD
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.hint, marginTop: 7 }}>Set a goal +</Text>
      </View>
    </PressFade>
  );
}

// ---------------------------------------------------------------------------
// Editor — the one place the sharing is spelled out in words.
// ---------------------------------------------------------------------------
function GoalEditor({ initial, clientName, saving, onCancel, onSave }) {
  const [draft, setDraft] = useState(initial ?? "");
  const changed = draft.trim() !== (initial ?? "").trim();

  return (
    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: "#fff", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="flag" size={12} color={colors.primaryOnWhite} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1.2, color: colors.primaryOnWhite }}>
          WORKING TOWARD
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 5, lineHeight: 17 }}>
        {firstNameOf(clientName)} sees this at the top of every session they log.
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        multiline
        autoFocus
        placeholder="Pull ups, 100# bench…"
        placeholderTextColor={colors.hint}
        style={{
          marginTop: 10,
          minHeight: 58,
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: 9,
          fontFamily: fonts.sans,
          fontSize: 14,
          color: "#2a211c",
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 11 }}>
        <PressFade
          onPress={onCancel}
          disabled={saving}
          style={{
            opacity: saving ? 0.5 : 1,
            borderWidth: 1,
            borderColor: "#d9d4cd",
            borderRadius: 9,
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: "#fff",
          }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Cancel</Text>
        </PressFade>
        <PressFade
          onPress={() => onSave(draft)}
          disabled={saving || !changed}
          style={{
            opacity: saving || !changed ? 0.5 : 1,
            borderRadius: 9,
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>
            {saving ? "Saving…" : draft.trim() ? "Save" : "Clear goal"}
          </Text>
        </PressFade>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Full card. `onSaved(row)` lets the host page keep its own copy in step.
// Read-only (member, or a coach surface that shouldn't edit) = omit userId.
// `notes` renders as an attached panel below — used on the SPC page to pull
// spc_clients.notes_goals_feedback up next to this instead of leaving it
// buried four scrolls down the rail.
// ---------------------------------------------------------------------------
export function ClientGoalCard({
  goal,
  userId,
  clientName,
  editable = false,
  editorId,
  showSharedMark = true,
  notes,
  style,
  onSaved,
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // A goal changing underneath an open editor (another coach, another tab)
  // shouldn't strand a half-typed draft, but it must not be shown as stale
  // once the editor closes either.
  useEffect(() => {
    if (!editable) setEditing(false);
  }, [editable]);

  const handleSave = async (draft) => {
    setSaving(true);
    try {
      const row = await setClientGoal(userId, draft, editorId);
      onSaved?.(row);
      setEditing(false);
    } catch (err) {
      // Stay open with the text intact — closing would bin what they typed.
      toastError("Couldn't save the goal", err);
    } finally {
      setSaving(false);
    }
  };

  if (!goal && !editable) return null;

  return (
    <View style={style}>
      {editing ? (
        <GoalEditor
          initial={goal}
          clientName={clientName}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
        />
      ) : goal ? (
        <GoalHero goal={goal} showSharedMark={showSharedMark} onEdit={editable ? () => setEditing(true) : undefined} />
      ) : (
        <GoalEmpty onEdit={() => setEditing(true)} />
      )}

      {notes && !editing ? (
        // Deliberately overlapped by 8px and re-padded so the two read as one
        // object rather than two stacked cards: shared on top, private below.
        <View
          style={{
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderTopWidth: 0,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
            backgroundColor: "#fff",
            paddingHorizontal: 14,
            paddingBottom: 14,
            paddingTop: 18,
            marginTop: -8,
          }}
        >
          {notes}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// One-line forms for the surfaces with no room for the card.
//   tone="pill"  — a solid clay pill. size="sm" is the wall display, sized to
//                  a 460px column; size="md" is the member's own session
//                  header, where it's the first thing they should read.
//   tone="ghost" — quiet, icon + text, no fill.
//
// The md pill is deliberately SHORTER than the session tabs below it (which
// are paddingVertical 8 + a border): it should make a statement without
// competing with the control a member actually has to press.
// ---------------------------------------------------------------------------
const PILL_SIZES = {
  sm: { icon: 11, font: type.caption, padV: 5, padH: 11, gap: 6, family: fonts.sansSemiBold },
  md: { icon: 13, font: 15, padV: 4, padH: 14, gap: 7, family: fonts.sansBold },
};

export function ClientGoalLine({ goal, tone = "ghost", size = "sm", style }) {
  if (!goal) return null;

  if (tone === "pill") {
    const s = PILL_SIZES[size] ?? PILL_SIZES.sm;
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: s.gap,
            backgroundColor: colors.primary,
            borderRadius: 999,
            paddingVertical: s.padV,
            paddingHorizontal: s.padH,
            // Hugs its text so it reads as a pill rather than a bar, but a
            // long goal still stops at the container edge and truncates.
            alignSelf: "flex-start",
            maxWidth: "100%",
          },
          style,
        ]}
      >
        <Ionicons name="flag" size={s.icon} color={CLAY_EYEBROW} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          style={{ flexShrink: 1, fontFamily: s.family, fontSize: s.font, color: CLAY_TEXT }}
        >
          {goal}
        </Text>
      </View>
    );
  }

  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 5 }, style]}>
      <Ionicons name="flag" size={11} color={colors.primaryOnWhite} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.primaryOnWhite }}
      >
        {goal}
      </Text>
    </View>
  );
}
