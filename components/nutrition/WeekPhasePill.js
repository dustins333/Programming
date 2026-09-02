import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, useWindowDimensions } from "react-native";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { SUGGESTED_PHASES, markerCovering, nextMarkerAfter, isRedundantPhase, resolveWeekPhase } from "../../lib/nutrition/weekPhases";

// The phase a client is in, week by week, on the Weeks tab (migration
// 0111). "Diet 1" on the week it starts, "Diet 2" the week after, and so on
// until the coach changes it.
//
// A phase is stored as one row per CHANGE, so this pill is the visible end
// of a run rather than a per-week value — which is why the popup below talks
// about what a change will affect, not about "this week".

const CARD_WIDTH = 288;
const EDGE = 12;

export function PhasePill({ phase, onPress }) {
  if (!phase) {
    return (
      <Pressable onPress={onPress} hitSlop={6} accessibilityLabel="Set the phase from this week">
        <View
          className="self-start rounded-full px-2 py-0.5"
          style={{ borderWidth: 1, borderColor: "#ddd6cd", borderStyle: "dashed" }}
        >
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansMedium, fontSize: 10, color: "#a8a29e" }}>
            + Phase
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={`Change the phase from this week (currently ${phase.name} ${phase.number})`}>
      <View
        className="self-start rounded-full px-2 py-0.5"
        style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#f0ddd2" }}
      >
        <Text
          maxFontSizeMultiplier={1.1}
          numberOfLines={1}
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: colors.primaryOnWhite }}
        >
          {phase.name} {phase.number}
        </Text>
      </View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-2.5 py-1"
      style={{
        borderWidth: 1,
        borderColor: active ? colors.primary : "#e2ddd6",
        backgroundColor: active ? "#fdf6f2" : "white",
      }}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: active ? colors.primaryOnWhite : "#57534e" }}>{label}</Text>
    </Pressable>
  );
}

function Action({ label, onPress, busy, tone = "#78716c" }) {
  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={6} style={{ opacity: busy ? 0.5 : 1 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: tone }}>{label}</Text>
    </Pressable>
  );
}

// Anchored to the pill that opened it rather than centred, per the ask —
// "a little pop up over the pill". Position comes from the pill's own
// measureInWindow, which on react-native-web is a getBoundingClientRect, so
// the viewport-relative coordinates line up with the fixed-position Modal
// even on a scrolled page. Clamped to the window on every edge, and it
// falls back to roughly centred if the anchor is missing.
export function PhaseEditor({ visible, anchor, weekStart, markers, phaseNames, onApply, onClear, onRemove, onClose }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null);

  const current = visible ? resolveWeekPhase(markers, weekStart) : null;
  const markerHere = visible ? markerCovering(markers, weekStart) : null;
  const hasMarkerOnThisWeek = !!markerHere && markerHere.week_start === weekStart;
  const next = visible ? nextMarkerAfter(markers, weekStart) : null;

  // Seeded once per opening, not on every render — the coach is typing into
  // this and re-seeding would fight her.
  const openedFor = useRef(null);
  useEffect(() => {
    if (!visible) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === weekStart) return;
    openedFor.current = weekStart;
    setName(current?.name ?? "");
    setBusy(null);
  }, [visible, weekStart, current?.name]);

  if (!visible) return null;

  const suggestions = [...new Set([...(phaseNames ?? []), ...SUGGESTED_PHASES])].slice(0, 6);
  const trimmed = name.trim();
  const redundant = trimmed.length > 0 && isRedundantPhase(markers, weekStart, trimmed);
  const canApply = trimmed.length > 0 && !redundant;

  const left = anchor ? Math.max(EDGE, Math.min(anchor.x, winW - CARD_WIDTH - EDGE)) : Math.max(EDGE, (winW - CARD_WIDTH) / 2);
  // Below the pill by default; above it when there isn't room underneath,
  // so the card never runs off the bottom of a long weeks list.
  const belowY = anchor ? anchor.y + anchor.height + 6 : winH / 2 - 140;
  const top = Math.max(EDGE, Math.min(belowY, winH - 300));

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.25)" }} onPress={onClose}>
        {/* Swallows presses so tapping inside the card doesn't dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            position: "absolute",
            left,
            top,
            width: CARD_WIDTH,
            backgroundColor: "white",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#ece7e1",
            padding: 14,
            shadowColor: "#44403c",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 18,
            elevation: 8,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Phase from {formatDateMDY(weekStart)}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Diet"
            placeholderTextColor="#c9c4bd"
            autoFocus
            onSubmitEditing={() => canApply && run("apply", () => onApply(trimmed))}
            className="mt-2.5 rounded-lg px-3 py-2"
            style={{ borderWidth: 1, borderColor: "#e2ddd6", fontFamily: fonts.sans, fontSize: 14, color: "#2a211c" }}
          />

          {suggestions.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
              {suggestions.map((s) => (
                <Chip key={s} label={s} active={s.toLowerCase() === trimmed.toLowerCase()} onPress={() => setName(s)} />
              ))}
            </View>
          ) : null}

          {/* Says what pressing Apply will actually do. A run holds until the
              next change, so "from here on" would be a lie whenever one
              already exists further down the list. */}
          <Text className="mt-2.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", lineHeight: 16 }}>
            {redundant
              ? `These weeks are already ${current?.name}. Pick a different phase, or change the week it started.`
              : next
                ? `Applies to every week from here until ${formatDateMDY(next.week_start)}, where it changes again.`
                : "Applies to this week and every week after it, and counts them as it goes."}
          </Text>

          <Pressable
            onPress={() => run("apply", () => onApply(trimmed))}
            disabled={!canApply || busy !== null}
            className="mt-3 items-center rounded-lg py-2.5"
            style={{ backgroundColor: colors.primary, opacity: !canApply || busy !== null ? 0.45 : 1 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "white" }}>
              {busy === "apply" ? "Saving…" : "Apply"}
            </Text>
          </Pressable>

          <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 14 }}>
            {current ? <Action label="No phase from here" onPress={() => run("clear", onClear)} busy={busy === "clear"} /> : null}
            {/* Only when a change actually sits on THIS week. Removing it
                lets the week fall back to whatever ran before, which is
                undoing a change rather than ending a phase — a different
                thing from "No phase from here" above, so it gets its own
                action rather than one button meaning both. */}
            {hasMarkerOnThisWeek ? <Action label="Remove this change" onPress={() => run("remove", onRemove)} busy={busy === "remove"} tone="#b23a22" /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
