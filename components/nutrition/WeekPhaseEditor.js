import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { AnchoredPopup } from "../AnchoredPopup";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import {
  SUGGESTED_PHASES,
  PHASE_COLORS,
  DEFAULT_PHASE_COLOR,
  phaseColor,
  markerCovering,
  nextMarkerAfter,
  isRedundantPhase,
  resolveWeekPhase,
} from "../../lib/nutrition/weekPhases";

// The popup behind a week's Phase tab (migration 0111, colours 0125).
//
// A phase is stored as one row per CHANGE, so this card talks about what a
// change will AFFECT rather than about "this week" — it is the visible end
// of a run, not a per-week value.
//
// Was WeekPhasePill.js. The pill it was named for is now a tab on the week
// card (see WeekTabs.js); only the editor survived the move.

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

function Swatch({ swatch, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={swatch.label}
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: swatch.bg,
        // The ring around the chosen one is the swatch's own text colour, so
        // the selection is legible on every fill in the palette rather than
        // relying on one accent that some of them swallow.
        borderWidth: active ? 2 : 1,
        borderColor: active ? swatch.text : swatch.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: swatch.text }} /> : null}
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

// `phaseNames` is [{ name, color }] — every name already in use in the gym,
// with the colour it last carried, so picking a familiar name comes out the
// same colour without a registry table enforcing it.
export function PhaseEditor({ visible, anchor, weekStart, markers, phaseNames, onApply, onClear, onRemove, onClose }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PHASE_COLOR);
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
    setColor(current?.color ?? DEFAULT_PHASE_COLOR);
    setBusy(null);
  }, [visible, weekStart, current?.name, current?.color]);

  // Typing or picking a name already in use pulls that name's colour across,
  // unless this week already has a phase of its own to keep. Nothing is
  // locked: the swatches below still win if she picks one afterwards.
  const adoptName = (next) => {
    setName(next);
    const known = (phaseNames ?? []).find((p) => p.name.toLowerCase() === next.trim().toLowerCase());
    if (known && known.name.toLowerCase() !== (current?.name ?? "").toLowerCase()) setColor(known.color);
  };

  if (!visible) return null;

  const known = phaseNames ?? [];
  const suggestions = [...new Set([...known.map((p) => p.name), ...SUGGESTED_PHASES])].slice(0, 6);
  const trimmed = name.trim();
  const redundant = trimmed.length > 0 && isRedundantPhase(markers, weekStart, trimmed);
  const canApply = trimmed.length > 0 && !redundant;
  const preview = phaseColor(color);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnchoredPopup visible anchor={anchor} width={288} estimatedHeight={360} onClose={onClose}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Phase from {formatDateMDY(weekStart)}
      </Text>

      <TextInput
        value={name}
        onChangeText={adoptName}
        placeholder="Diet"
        placeholderTextColor="#c9c4bd"
        autoFocus
        maxLength={28}
        onSubmitEditing={() => canApply && run("apply", () => onApply(trimmed, color))}
        className="mt-2.5 rounded-lg px-3 py-2"
        style={{ borderWidth: 1, borderColor: "#e2ddd6", fontFamily: fonts.sans, fontSize: 14, color: "#2a211c" }}
      />

      {suggestions.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
          {suggestions.map((s) => (
            <Chip key={s} label={s} active={s.toLowerCase() === trimmed.toLowerCase()} onPress={() => adoptName(s)} />
          ))}
        </View>
      ) : null}

      <Text className="mt-3" style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Colour
      </Text>
      <View className="mt-1.5 flex-row flex-wrap" style={{ gap: 7 }}>
        {PHASE_COLORS.map((swatch) => (
          <Swatch key={swatch.key} swatch={swatch} active={swatch.key === color} onPress={() => setColor(swatch.key)} />
        ))}
      </View>

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
        onPress={() => run("apply", () => onApply(trimmed, color))}
        disabled={!canApply || busy !== null}
        className="mt-3 items-center rounded-lg py-2.5"
        style={{
          backgroundColor: canApply ? preview.bg : "#f4f2ef",
          borderWidth: 1,
          borderColor: canApply ? preview.border : "#e2ddd6",
          opacity: !canApply || busy !== null ? 0.45 : 1,
        }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: canApply ? preview.text : "#78716c" }}>
          {busy === "apply" ? "Saving…" : trimmed ? `Apply ${trimmed}` : "Apply"}
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
    </AnchoredPopup>
  );
}
