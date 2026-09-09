import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnchoredPopup, measureAnchor } from "../AnchoredPopup";
import { formatDateMD, formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { phaseColor } from "../../lib/nutrition/weekPhases";
import { NOTE_COLORS, noteColor } from "../../lib/nutrition/weekNotes";
import { Swatch } from "./WeekPhaseEditor";

// Hanging-folder tabs along the top edge of a week on the Weeks tab.
//
// Terra's metaphor, and the reason for the shape: the tabs that stick up
// out of a hanging folder, so a coach running down eleven weeks can see
// what was going on in each one without opening any of them.
//
//   the date         the week's own label, and the handle that opens it
//   Targets changed  a target change that landed INSIDE this week
//   a free label     "Mexico trip" (0125)
//   +                add another label
//
// The phase is NOT a tab. It reads down the card's left edge instead, as a
// coloured spine spelling the run out a letter at a time (PhaseRail below)
// — a phase is a property of the whole week rather than one more thing
// filed against it, and as a tab it competed with the labels for the strip.
//
// The targets tab is what prompted the whole idea. It used to be a divider
// drawn BETWEEN two weeks, which reads as belonging to the week above it —
// wrong whenever the change happened mid-week, which is most of the time.
// As a tab it is unambiguously part of the week it landed in.
//
// ---------------------------------------------------------------------
// Why the tabs overlap the card by a pixel
// ---------------------------------------------------------------------
// A tab has a border on three sides and none along the bottom, and sits
// with marginBottom: -1 over the card's own top border. The strip carries
// zIndex so the tab's fill paints OVER that border rather than under it —
// without it the card, being the later sibling, draws its top line straight
// through the bottom of every tab and they read as detached chips.
//
// rowGap is 0 on purpose: when the strip wraps (phone width, or several
// labels) each row of tabs then sits on the row below it the same way the
// bottom row sits on the card, which is what a stack of folder tabs looks
// like. A positive row gap would leave the upper rows floating with an open
// bottom edge.

const TAB_RADIUS = 8;
// A target change is an event rather than a state, so it reads in the
// app's own "needs a look" amber rather than borrowing a phase colour.
const TARGETS = { bg: "#f7f0e3", border: "#e2d2b4", text: "#8a5a2e" };
const DASHED = { bg: "white", border: "#ddd6cd", text: "#a8a29e" };
// A week with no phase yet. It has to be a FILL, not white: the spine is
// what draws the card's left edge now, and white-on-white dissolved it — a
// run of unphased weeks read as though the cards themselves were missing.
// Recessed rather than tinted, so it says "nothing here yet" without
// competing with the real phases above and below it.
const UNSET = { bg: "#f6f3ef", border: "#ddd6cd", text: "#a8a29e" };
// The week's own label reads a shade heavier than a note's, since it names
// the thing the rest of the tabs are filed against.
const DATE = { bg: "white", border: "#e2ddd6", text: "#44403c" };

function Tab({ tone, label, dashed, maxWidth, chevron, accessibilityLabel, onPress }) {
  const ref = useRef(null);
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => measureAnchor(ref, onPress)}
      style={{
        maxWidth,
        backgroundColor: tone.bg,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: tone.border,
        borderStyle: dashed ? "dashed" : "solid",
        borderTopLeftRadius: TAB_RADIUS,
        borderTopRightRadius: TAB_RADIUS,
        paddingHorizontal: 9,
        paddingTop: 3,
        // The extra bottom padding is the 1px the tab gives back below, so
        // the label stays optically centred in the visible part of the tab.
        paddingBottom: 4,
        marginBottom: -1,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 4 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: tone.text }}
        >
          {label}
        </Text>
        {chevron ? <Ionicons name={chevron} size={11} color="#a8a29e" /> : null}
      </View>
    </Pressable>
  );
}

// The phase, read down the card's left edge — the spine of the folder
// rather than one more tab filed onto it.
//
// Stacked letters, not rotated text: RN has no dependable transform-origin
// and a rotated block has to be measured before it can be placed, where a
// column of single characters simply lays itself out. A space becomes a
// gap rather than a blank Text — a whitespace-only line in a
// numberOfLines={1} Text collapses to zero height, so "Fat loss" would
// otherwise read as "FATLOSS".
//
// The run's number sits under the name with a line's worth of air between
// them, which is what tells the two apart at this size.
export const RAIL_WIDTH = 26;

// The letters shrink as the name gets longer, because a column of them is
// taller than the card whenever the name is. A short name is the common
// case and keeps a comfortable size; a long one steps down rather than
// stretching its row away from its neighbours.
//
// Measured against the live data this is sized for: Diet (4) is 12 of the
// 20 markers in the gym and costs nothing, Reverse (7) and Recomp (6) add a
// little, and Maintenance (11) is the worst case. The alternative — one
// rotated line, truncated — fits any length at one size but reads worse for
// the short names that dominate.
function railType(name) {
  const n = name.length;
  if (n <= 5) return { fontSize: 10, lineHeight: 13, gap: 9 };
  if (n <= 8) return { fontSize: 8.5, lineHeight: 10.5, gap: 7 };
  return { fontSize: 7.5, lineHeight: 9, gap: 6 };
}

export function PhaseRail({ phase, onPress }) {
  const ref = useRef(null);
  const tone = phase ? phaseColor(phase.color) : UNSET;
  const type = railType(phase?.name ?? "");
  const letter = { fontFamily: fonts.sansBold, fontSize: type.fontSize, lineHeight: type.lineHeight, textAlign: "center" };

  return (
    <Pressable
      ref={ref}
      collapsable={false}
      accessibilityLabel={
        phase ? `Change the phase from this week (currently ${phase.name} ${phase.number})` : "Set the phase from this week"
      }
      onPress={() => measureAnchor(ref, onPress)}
      style={{
        width: RAIL_WIDTH,
        backgroundColor: tone.bg,
        borderRightWidth: 1,
        borderRightColor: tone.border,
        borderStyle: phase ? "solid" : "dashed",
        alignItems: "center",
        // Top-aligned, not centred: the card's height changes when the day
        // table opens, and letters floating in the middle of an expanded
        // week would drift away from the row they belong to.
        paddingTop: 12,
        paddingBottom: 8,
      }}
    >
      {phase ? (
        <>
          {[...phase.name.toUpperCase()].map((ch, i) =>
            ch === " " ? (
              <View key={i} style={{ height: type.gap - 2 }} />
            ) : (
              <Text key={i} maxFontSizeMultiplier={1} style={{ ...letter, color: tone.text }}>
                {ch}
              </Text>
            )
          )}
          <Text maxFontSizeMultiplier={1} style={{ ...letter, color: tone.text, marginTop: type.gap }}>
            {phase.number}
          </Text>
        </>
      ) : (
        <>
          <Text maxFontSizeMultiplier={1} style={{ ...letter, fontSize: 12, lineHeight: 14, color: tone.text }}>
            +
          </Text>
          {[..."PHASE"].map((ch, i) => (
            <Text key={i} maxFontSizeMultiplier={1} style={{ ...letter, color: tone.text }}>
              {ch}
            </Text>
          ))}
        </>
      )}
    </Pressable>
  );
}

// `onOpen(kind, anchor, payload)` — the row above owns which popup is open,
// so only one is ever mounted no matter how many weeks are on screen.
//
// `railWidth` shifts the strip clear of the phase spine below it, so the
// first tab sits over the card's white content rather than over the spine's
// own colour. The spine's top edge is then what shows to the tabs' left,
// which reads as it running up to meet them.
export function WeekTabStrip({ dateLabel, expanded, onToggle, targetChange, notes, notesEnabled, railWidth = 0, onOpen }) {
  return (
    <View
      className="flex-row flex-wrap"
      style={{ paddingLeft: 12 + railWidth, paddingRight: 12, columnGap: 4, rowGap: 0, zIndex: 1 }}
    >
      {/* The week's own label, and the handle that opens it. It carries the
          chevron so the card's first line is all numbers. */}
      <Tab
        tone={DATE}
        label={dateLabel}
        chevron={expanded ? "chevron-up" : "chevron-down"}
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} the week of ${dateLabel}`}
        onPress={onToggle}
      />

      {targetChange ? (
        <Tab
          tone={TARGETS}
          label="Targets changed"
          accessibilityLabel="See what changed about the targets this week"
          onPress={(anchor) => onOpen("targets", anchor)}
        />
      ) : null}

      {(notes ?? []).map((note) => (
        <Tab
          key={note.id}
          tone={noteColor(note.color)}
          label={note.label}
          maxWidth={180}
          accessibilityLabel={`Edit the label "${note.label}"`}
          onPress={(anchor) => onOpen("note", anchor, note)}
        />
      ))}

      {notesEnabled ? (
        <Tab tone={DASHED} dashed label="+" accessibilityLabel="Add a label to this week" onPress={(anchor) => onOpen("note", anchor, null)} />
      ) : null}
    </View>
  );
}

// Read-only: what moved, and the day it took effect. There is nothing to
// edit here — targets are changed on the Targets tab, and a second way in
// would be a second place for the two to disagree.
export function TargetChangePopup({ visible, anchor, change, onClose }) {
  if (!visible || !change) return null;
  return (
    <AnchoredPopup visible anchor={anchor} width={276} estimatedHeight={200} onClose={onClose}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Targets changed {change.date ? formatDateMDY(change.date) : ""}
      </Text>
      <View className="mt-2" style={{ gap: 5 }}>
        {change.changes.map((c, i) => (
          <Text key={i} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c" }}>
            {c.text}
          </Text>
        ))}
      </View>
    </AnchoredPopup>
  );
}

// Add a label, or edit one that's already there. `note` null means adding.
export function WeekNoteEditor({ visible, anchor, weekStart, note, onSave, onDelete, onClose }) {
  const [label, setLabel] = useState("");
  // null is a real value, not "unset" — it is the plain white tab, and it
  // is the default for a new label.
  const [color, setColor] = useState(null);
  const [busy, setBusy] = useState(null);

  // Seeded once per opening. Keyed on the note's id (or the week, when
  // adding) so re-rendering behind the card can't overwrite what she's
  // typing.
  const openedFor = useRef(null);
  const key = note?.id ?? `new:${weekStart}`;
  useEffect(() => {
    if (!visible) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === key) return;
    openedFor.current = key;
    setLabel(note?.label ?? "");
    setColor(note?.color ?? null);
    setBusy(null);
  }, [visible, key, note?.label, note?.color]);

  if (!visible) return null;

  const trimmed = label.trim();
  // The colour is savable on its own — recolouring a label without
  // retyping it is the common edit once the label itself is right.
  const changed = trimmed !== (note?.label ?? "") || color !== (note?.color ?? null);
  const canSave = trimmed.length > 0 && changed;

  const run = async (which, fn) => {
    setBusy(which);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnchoredPopup visible anchor={anchor} width={272} estimatedHeight={330} onClose={onClose}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {note ? "Label on" : "Label this week"} {formatDateMD(weekStart)}
      </Text>

      <TextInput
        value={label}
        onChangeText={setLabel}
        autoFocus
        // Short enough that a tab stays a tab. The strip wraps rather than
        // scrolling, so one long label would push everything after it onto
        // its own line.
        maxLength={32}
        onSubmitEditing={() => canSave && run("save", () => onSave(trimmed, color))}
        className="mt-2.5 rounded-lg px-3 py-2"
        style={{ borderWidth: 1, borderColor: "#e2ddd6", fontFamily: fonts.sans, fontSize: 14, color: "#2a211c" }}
      />

      <Text className="mt-3" style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Colour
      </Text>
      {/* The same swatches as the phase editor, from the same component, so
          a colour picked here reads identically to one picked there. */}
      <View className="mt-1.5 flex-row flex-wrap" style={{ gap: 7 }}>
        {NOTE_COLORS.map((swatch) => (
          <Swatch key={swatch.key ?? "none"} swatch={swatch} active={swatch.key === color} onPress={() => setColor(swatch.key)} />
        ))}
      </View>

      <Pressable
        onPress={() => run("save", () => onSave(trimmed, color))}
        disabled={!canSave || busy !== null}
        className="mt-3 items-center rounded-lg py-2.5"
        style={{ backgroundColor: colors.primary, opacity: !canSave || busy !== null ? 0.45 : 1 }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "white" }}>
          {busy === "save" ? "Saving…" : note ? "Save" : "Add"}
        </Text>
      </Pressable>

      {note ? (
        <Pressable onPress={() => run("delete", onDelete)} disabled={busy !== null} hitSlop={6} className="mt-3 self-start" style={{ opacity: busy ? 0.5 : 1 }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#b23a22" }}>
            {busy === "delete" ? "Removing…" : "Remove this label"}
          </Text>
        </Pressable>
      ) : null}
    </AnchoredPopup>
  );
}
