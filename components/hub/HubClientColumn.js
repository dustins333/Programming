import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { schemeLabel, formatRest } from "../builder/SessionBuilderParts";
import { supersetLettersFor } from "../../lib/programming/spcBlockDetail";
import { fonts, colors, type } from "../../lib/theme";

// One client's live session — a vertical "phone screen" on the wall display
// (scale="tv") or the coach phone's per-client view (scale="phone"). Pure
// presentation: all data comes off the board entry, all writes go back up
// through the handlers (useHubBoard owns them).

const CARD_BORDER = "#ece7e1";
const DONE = "#4d6142";
const DONE_BG = "#eef1e7";
const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";

function setChips(item, logs, scale) {
  const tracksWeight = item.exercise?.tracks_weight !== false;
  const targetSets = item.targetSets > 0 ? item.targetSets : 3;
  const real = (logs ?? []).filter((r) => r.reps != null || r.weight != null);
  const maxSet = real.reduce((m, r) => Math.max(m, r.set_number ?? 1), 0);
  const count = Math.max(targetSets, maxSet);
  const chips = [];
  for (let i = 1; i <= count; i++) {
    const row = real.find((r) => (r.set_number ?? 1) === i);
    chips.push(
      <View
        key={i}
        style={{
          minWidth: scale === "tv" ? 58 : 50,
          paddingHorizontal: 6,
          paddingVertical: scale === "tv" ? 5 : 4,
          marginRight: 5,
          marginTop: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: row ? LOGGED_BORDER : "#ddd6cd",
          borderStyle: row ? "solid" : "dashed",
          backgroundColor: row ? LOGGED_BG : "transparent",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.sansSemiBold,
            fontSize: scale === "tv" ? 13.5 : 12.5,
            color: row ? "#3f4a36" : colors.hint,
          }}
        >
          {row
            ? row.weight != null && tracksWeight
              ? `${row.reps ?? "–"}×${row.weight}`
              : `${row.reps ?? "–"}`
            : item.repScheme?.[i - 1] ?? item.targetReps ?? "–"}
        </Text>
      </View>
    );
  }
  return chips;
}

function LiftRow({ item, letter, logs, completed, hasNote, editOrder, isFirst, isLast, scale, onPress, onToggleComplete, onMove }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: completed ? DONE : CARD_BORDER,
        backgroundColor: "white",
        paddingHorizontal: scale === "tv" ? 12 : 10,
        paddingVertical: scale === "tv" ? 10 : 8,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {letter ? (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#fdf6f2",
              borderWidth: 1,
              borderColor: "#f0ddd2",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: colors.primaryOnWhite }}>{letter}</Text>
          </View>
        ) : null}
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: scale === "tv" ? 16 : 14.5, color: "#292524" }}
        >
          {item.exercise.name}
        </Text>
        {hasNote ? <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.primaryOnWhite} style={{ marginRight: 6 }} /> : null}
        {editOrder ? (
          <View style={{ flexDirection: "row" }}>
            <PressFade onPress={() => onMove(-1)} disabled={isFirst} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 6, opacity: isFirst ? 0.3 : 1 }}>
              <Ionicons name="arrow-up-circle" size={scale === "tv" ? 28 : 24} color={colors.primary} />
            </PressFade>
            <PressFade onPress={() => onMove(1)} disabled={isLast} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 6, opacity: isLast ? 0.3 : 1 }}>
              <Ionicons name="arrow-down-circle" size={scale === "tv" ? 28 : 24} color={colors.primary} />
            </PressFade>
          </View>
        ) : (
          <PressFade
            onPress={() => onToggleComplete(!completed)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingLeft: 6 }}
          >
            <Ionicons name={completed ? "checkmark-circle" : "checkmark-circle-outline"} size={scale === "tv" ? 28 : 24} color={DONE} />
          </PressFade>
        )}
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: scale === "tv" ? 12.5 : 11.5, color: colors.muted, marginTop: 2, marginLeft: letter ? 32 : 0 }}>
        {[schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps }), item.rest ? `Rest ${formatRest(item.rest)}` : null]
          .filter(Boolean)
          .join(" | ")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginLeft: letter ? 32 : 0 }}>{setChips(item, logs, scale)}</View>
    </PressFade>
  );
}

export function HubClientColumn({ entry, warmups, scale = "tv", onPressLift, onToggleComplete, onMoveLift, onToggleFinalize }) {
  const [editOrder, setEditOrder] = useState(false);
  const [showWarmups, setShowWarmups] = useState(false);

  // Superset letter suffixes (A1/A2) precomputed per item id — FlatList's
  // renderItem calls aren't guaranteed to run in document order, so a
  // counter mutated during render would hand out wrong suffixes.
  const letterById = useMemo(() => {
    const letters = supersetLettersFor(entry.items);
    const seen = {};
    const map = new Map();
    for (const item of entry.items) {
      if (!item.supersetGroupId) continue;
      seen[item.supersetGroupId] = (seen[item.supersetGroupId] ?? 0) + 1;
      map.set(item.id, `${letters[item.supersetGroupId]}${seen[item.supersetGroupId]}`);
    }
    return map;
  }, [entry.items]);

  const warmupRows = warmups ?? [];

  return (
    <View
      style={{
        // Fills its column slot on the TV; sizes to content inside the coach
        // phone page's ScrollView. (Never bare `flex: 0` — RNW compiles that
        // to a 0% basis that collapses explicit sizes.)
        flex: scale === "tv" ? 1 : undefined,
        borderRadius: 18,
        borderWidth: entry.finalized ? 2 : 1,
        borderColor: entry.finalized ? DONE : CARD_BORDER,
        backgroundColor: entry.finalized ? DONE_BG : "white",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: entry.finalized ? "#dbe8cf" : CARD_BORDER }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: scale === "tv" ? 20 : 17, color: "#292524" }}>
              {entry.clientName}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 1 }}>
              {[
                `Week ${entry.weekNumber}`,
                entry.sessionNumber ? `Session ${entry.sessionNumber}` : null,
                entry.title || null,
              ]
                .filter(Boolean)
                .join(" | ")}
            </Text>
          </View>
          <PressFade onPress={() => setEditOrder((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Ionicons name={editOrder ? "close-circle" : "swap-vertical"} size={scale === "tv" ? 26 : 22} color={editOrder ? colors.primary : colors.muted} />
          </PressFade>
        </View>
        {entry.finalized ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color={DONE} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: DONE, marginLeft: 4 }}>Session complete</Text>
          </View>
        ) : null}
      </View>

      {/* Warm-up strip */}
      {warmupRows.length > 0 ? (
        <PressFade onPress={() => setShowWarmups((v) => !v)} style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#faf8f6", borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
          <Text numberOfLines={showWarmups ? undefined : 1} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#57534e" }}>Warm-up: </Text>
            {showWarmups
              ? warmupRows
                  .map((w) => {
                    const name = w.label || w.exercises?.name || "—";
                    const sets = w.sets || w.exercises?.default_sets || "";
                    const reps = w.reps || w.exercises?.default_reps || "";
                    const rx = sets && reps ? ` ${sets}×${reps}` : "";
                    return `${name}${rx}`;
                  })
                  .join("\n")
              : warmupRows.map((w) => w.label || w.exercises?.name || "—").join(" · ")}
          </Text>
        </PressFade>
      ) : null}

      {/* Lifts. On the TV the column scrolls internally if a session
          genuinely overflows (the no-scroll target is enforced by the
          density arithmetic, not a clamp). On the phone the PAGE scrolls
          (live.js's own ScrollView), so a nested scroller here would just
          fight it — plain rows there. Plain .map either way: sessions cap
          out around 9 lifts, so virtualization buys nothing and a FlatList
          nested in the phone page's ScrollView would warn/break. */}
      {(() => {
        const rows = entry.items.map((item, index) => (
          <LiftRow
            key={item.id}
            item={item}
            letter={letterById.get(item.id) ?? null}
            logs={entry.logsByExerciseId.get(item.exercise.id)}
            completed={entry.completedItemIds.has(item.id)}
            hasNote={entry.latestNoteByExerciseId.has(item.exercise.id)}
            editOrder={editOrder}
            isFirst={index === 0}
            isLast={index === entry.items.length - 1}
            scale={scale}
            onPress={() => onPressLift(item)}
            onToggleComplete={(next) => onToggleComplete(item, next)}
            onMove={(dir) => onMoveLift(item.id, dir)}
          />
        ));
        const empty =
          entry.items.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, padding: 12 }}>
              Nothing published for this session yet.
            </Text>
          ) : null;
        if (scale === "tv") {
          return (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 4 }}>
              {rows}
              {empty}
            </ScrollView>
          );
        }
        return (
          <View style={{ padding: 10, paddingBottom: 4 }}>
            {rows}
            {empty}
          </View>
        );
      })()}

      {/* Finalize */}
      <View style={{ padding: 10, paddingTop: 4 }}>
        <PressFade
          onPress={onToggleFinalize}
          style={{
            borderRadius: 12,
            paddingVertical: scale === "tv" ? 12 : 10,
            alignItems: "center",
            backgroundColor: entry.finalized ? "transparent" : DONE,
            borderWidth: entry.finalized ? 1.5 : 0,
            borderColor: DONE,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: scale === "tv" ? 15 : 14, color: entry.finalized ? DONE : "white" }}>
            {entry.finalized ? "Un-finalize session" : "Finalize session"}
          </Text>
        </PressFade>
      </View>
    </View>
  );
}
