import { Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { SetBubbleRow } from "./HubSetBubbles";
import { schemeLabel, formatRest } from "../builder/SessionBuilderParts";
import { fonts, colors } from "../../lib/theme";

// The lift being typed into. Clay 2px border and 16px radius — the ONLY
// 2px-clay thing on the board, so "which lift is live" is unmistakable from
// across a gym floor, and the keypad dock beneath it carries the same 2px
// clay top border to tie the two together.
//
// Set rows adopt the member app's pattern from
// design_handoff_member_lasttime_v1 exactly, so the wall and the phone in a
// client's hand cannot disagree about what an empty box means. One
// deliberate correction to that README: the ghost value here is
// colors.hint (#9a9187, ~3:1), not the #d5cdc4 it quotes — that predates the
// 2026-08-18 legibility pass, and #d5cdc4 measures ~1.5:1, which is not
// readable across a room.

const CARD_BORDER = "#ece7e1";
const KEYED_BG = "#f3f6ef";
const KEYED_BORDER = "#dbe8cf";
const KEYED_TEXT = "#3f4a36";
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";

function prescriptionLine(item, letter) {
  return [
    schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps }),
    item.tempo ? `Tempo ${item.tempo}` : null,
    item.rest ? `Rest ${formatRest(item.rest)}` : null,
    letter || null,
    item.exercise?.tracks_weight === false ? "no weight tracked" : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function FieldBox({ value, target, isActive, isWeight, onPress, compact }) {
  const filled = value !== "" && value != null;
  const height = compact ? 40 : 44;
  return (
    <PressFade
      onPress={onPress}
      style={{
        flex: 1,
        height,
        marginLeft: 6,
        borderRadius: 10,
        borderWidth: isActive ? 2 : filled ? 1 : 1.5,
        borderStyle: filled || isActive ? "solid" : "dashed",
        borderColor: isActive ? colors.primary : filled ? KEYED_BORDER : "#ddd6cd",
        backgroundColor: isActive ? "white" : filled ? KEYED_BG : "#fdfbf8",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
      }}
    >
      {filled || isActive ? (
        <>
          <Text
            style={{
              fontFamily: fonts.sansBold,
              fontSize: compact ? 19 : 21,
              color: isActive ? "#292524" : KEYED_TEXT,
            }}
          >
            {value === "" ? "" : value}
          </Text>
          {isActive ? (
            <View style={{ width: 2, height: compact ? 20 : 22, backgroundColor: colors.primary, marginLeft: 3, borderRadius: 1 }} />
          ) : null}
        </>
      ) : (
        <View style={{ alignItems: "center" }}>
          {/* A weight box holds an en dash, never a target — nothing in this
              app ever prescribes a weight, so a TARGET tag there would be
              inventing a number the coach never wrote. */}
          {isWeight ? null : (
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.8, color: colors.hint, marginBottom: -1 }}>
              TARGET
            </Text>
          )}
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: isWeight ? 19 : 17, color: colors.hint }}>
            {isWeight ? "–" : target ?? "–"}
          </Text>
        </View>
      )}
    </PressFade>
  );
}

function ActionButton({ label, onPress, disabled }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PEACH_BG,
        borderWidth: 1,
        borderColor: PEACH_BORDER,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>{label}</Text>
    </PressFade>
  );
}

// The last week this lift was actually logged, as one line: its label, its
// sets as bubbles, whoever's note, and the way into the rest of the block.
// This answers "what did she do last week and what did we say about it"
// with no tap at all — on a screen four people are reading at once, a tap
// only one of them knows about is worth avoiding.
function HistoryStrip({ lastWeek, weekCount, tracksWeight, onOpen, compact }) {
  return (
    <PressFade
      onPress={onOpen}
      style={{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: PEACH_BORDER,
        backgroundColor: PEACH_BG,
        paddingHorizontal: 10,
        paddingTop: 6,
        paddingBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: colors.primaryOnWhite, marginRight: 8 }}>
          {lastWeek?.weekNumber != null ? `WEEK ${lastWeek.weekNumber}` : "NO HISTORY"}
        </Text>
        <View style={{ flex: 1 }}>
          {lastWeek ? (
            <SetBubbleRow sets={lastWeek.sets} tracksWeight={tracksWeight} size="sm" tone="plain" />
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted }}>First time this block.</Text>
          )}
        </View>
        {weekCount > 0 ? (
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite, marginLeft: 8 }}>
            {weekCount} {weekCount === 1 ? "week" : "weeks"} ›
          </Text>
        ) : null}
      </View>
      {lastWeek?.note ? (
        <Text numberOfLines={compact ? 2 : 3} style={{ fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: "#57534e", marginTop: 4 }}>
          {lastWeek.note}
          {lastWeek.noteAuthor ? <Text style={{ color: colors.muted }}> — {lastWeek.noteAuthor}</Text> : null}
        </Text>
      ) : null}
    </PressFade>
  );
}

export function HubLiftCard({
  item,
  letter,
  siblings = [],
  rows,
  active,
  note,
  weekNumber,
  lastWeek,
  weekCount = 0,
  historyLoading = false,
  compact = false,
  onSetActive,
  onSwitchItem,
  onAddSet,
  onSameAsLast,
  onChangeNote,
  onCommitNote,
  onOpenHistory,
  onCollapse,
}) {
  const tracksWeight = item.exercise?.tracks_weight !== false;

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 12,
        marginBottom: 8,
        shadowColor: "#44403c",
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      {/* Header — collapse is a control in a circle, never a line of text. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text numberOfLines={2} style={{ fontFamily: fonts.sansBold, fontSize: compact ? 18 : 20, color: colors.primaryOnWhite }}>
            {item.exercise.name}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
            {prescriptionLine(item, letter)}
          </Text>
        </View>
        <PressFade
          onPress={onCollapse}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: PEACH_BORDER,
            backgroundColor: PEACH_BG,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-up" size={20} color={colors.primaryOnWhite} />
        </PressFade>
      </View>

      {/* Superset pair — switching A1 ↔ A2 does not close the card. */}
      {siblings.length > 1 ? (
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          {siblings.map((sib, i) => {
            const isActive = sib.id === item.id;
            return (
              <PressFade
                key={sib.id}
                onPress={() => !isActive && onSwitchItem?.(sib)}
                style={{
                  flex: 1,
                  marginLeft: i === 0 ? 0 : 8,
                  height: 38,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 10,
                  backgroundColor: isActive ? colors.primary : "white",
                  borderWidth: 1,
                  borderColor: isActive ? colors.primary : CARD_BORDER,
                }}
              >
                <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: isActive ? "white" : "#57534e" }}>
                  {sib.letter ? `${sib.letter} ` : ""}
                  {sib.exercise.name}
                </Text>
              </PressFade>
            );
          })}
        </View>
      ) : null}

      {/* Set rows */}
      <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 4, paddingRight: 2 }}>
        <Text style={{ width: 26, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: colors.muted }}>SET</Text>
        <Text style={{ flex: 1, marginLeft: 6, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: colors.muted }}>
          REPS
        </Text>
        {tracksWeight ? (
          <Text style={{ flex: 1, marginLeft: 6, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: colors.muted }}>
            LB
          </Text>
        ) : null}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ width: 26, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#57534e" }}>{i + 1}</Text>
          <FieldBox
            value={row.reps}
            target={item.repScheme?.[i] ?? item.targetReps ?? null}
            isActive={active?.set === i && active?.field === "reps"}
            onPress={() => onSetActive({ set: i, field: "reps" })}
            compact={compact}
          />
          {tracksWeight ? (
            <FieldBox
              value={row.weight}
              isWeight
              isActive={active?.set === i && active?.field === "weight"}
              onPress={() => onSetActive({ set: i, field: "weight" })}
              compact={compact}
            />
          ) : null}
        </View>
      ))}

      <View style={{ flexDirection: "row", marginTop: 2 }}>
        <ActionButton label="+ Add set" onPress={onAddSet} />
        <View style={{ width: 8 }} />
        <ActionButton label="Same as last" onPress={onSameAsLast} disabled={(active?.set ?? 0) === 0} />
      </View>

      {/* One note field. Coach or client — one note, both see it. */}
      <TextInput
        value={note}
        onChangeText={onChangeNote}
        onBlur={onCommitNote}
        placeholder={weekNumber != null ? `Add a note for week ${weekNumber}…` : "Add a note…"}
        placeholderTextColor={colors.hint}
        style={{
          marginTop: 10,
          height: 42,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: CARD_BORDER,
          backgroundColor: "white",
          paddingHorizontal: 12,
          fontFamily: fonts.sans,
          fontSize: 13,
          color: "#292524",
        }}
      />

      {historyLoading ? (
        <View style={{ marginTop: 10, paddingVertical: 10 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.hint }}>Loading this block's history…</Text>
        </View>
      ) : (
        <HistoryStrip
          lastWeek={lastWeek}
          weekCount={weekCount}
          tracksWeight={tracksWeight}
          onOpen={onOpenHistory}
          compact={compact}
        />
      )}
    </View>
  );
}
