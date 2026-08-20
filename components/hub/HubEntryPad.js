import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { PressFade } from "../PressFade";
import { HubNumberPad } from "./HubNumberPad";
import { schemeLabel, formatRest } from "../builder/SessionBuilderParts";
import { getLastLoggedSession } from "../../lib/programming/memberPlan";
import { listCoachingNoteHistory } from "../../lib/programming/coachingNotes";
import { todayInBoise } from "../../lib/boiseDate";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors, type } from "../../lib/theme";

// The hub's big touch entry overlay — tap a lift on the board, this opens,
// type the sets on the keypad, Save commits everything at once (one
// logResult per set through useHubBoard.saveLift). Deliberately NOT the
// member phone's autosave model: on a shared touchscreen a discrete
// commit-on-Save is what lets the poll merge stay simple (the board holds
// last-committed values while this holds the draft — see useHubBoard's
// editingRef).
//
// No StyleSheet.absoluteFillObject anywhere in a style array — it renders
// the view invisible on this app's Fabric build (see CLAUDE.md).

const CARD_BORDER = "#ece7e1";
const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";

function prescriptionLine(item) {
  const scheme = schemeLabel({ rep_scheme: item.repScheme, sets: item.targetSets, reps: item.targetReps });
  const parts = [scheme];
  if (item.tempo) parts.push(`Tempo ${item.tempo}`);
  if (item.rest) parts.push(`Rest ${formatRest(item.rest)}`);
  return parts.join(" | ");
}

function rowsFromLogs(item, logs) {
  const targetSets = item.targetSets > 0 ? item.targetSets : 3;
  const maxSet = (logs ?? []).reduce((m, r) => Math.max(m, r.set_number ?? 1), 0);
  const count = Math.max(targetSets, maxSet);
  return Array.from({ length: count }, (_, i) => {
    const row = (logs ?? []).find((r) => (r.set_number ?? 1) === i + 1);
    return {
      reps: row?.reps != null ? String(row.reps) : "",
      weight: row?.weight != null ? String(row.weight) : "",
    };
  });
}

export function HubEntryPad({
  visible,
  onClose,
  clientName,
  item, // member-plan item shape (+ spcWorkoutExerciseId)
  siblingItems = [], // the superset pair incl. this item, for one-tap switching
  onSwitchItem,
  logs, // this exercise's log rows (sorted by set_number)
  latestNote, // latest coaching note row for this (user, exercise), or null
  userId,
  onSave, // ({ rows, memberNotes, coachingNote }) => Promise
  saving = false,
  scale = "tv",
}) {
  const tracksWeight = item?.exercise?.tracks_weight !== false;
  const [rows, setRows] = useState([]);
  const [memberNotes, setMemberNotes] = useState("");
  const [coachingNote, setCoachingNote] = useState("");
  const [active, setActive] = useState({ set: 0, field: "reps" });
  const [lastTime, setLastTime] = useState(undefined); // undefined loading, null none
  const [history, setHistory] = useState(null); // coaching note history, lazy
  const [showHistory, setShowHistory] = useState(false);
  const seededForRef = useRef(null);

  // Seed the draft when the pad opens or the lift switches (superset chips).
  useEffect(() => {
    if (!visible || !item) return;
    const key = `${userId}:${item.id}`;
    if (seededForRef.current === key) return;
    seededForRef.current = key;
    setRows(rowsFromLogs(item, logs));
    setMemberNotes((logs ?? []).find((r) => r.notes)?.notes ?? "");
    setCoachingNote("");
    setActive({ set: 0, field: "reps" });
    setShowHistory(false);
    setHistory(null);
    setLastTime(undefined);
    // Last-time ghost line — own catch, purely informational.
    getLastLoggedSession(userId, item.exercise.id, todayInBoise())
      .then(setLastTime)
      .catch(() => setLastTime(null));
  }, [visible, item, logs, userId]);

  useEffect(() => {
    if (!visible) seededForRef.current = null;
  }, [visible]);

  const letters = useMemo(() => {
    if (!item?.supersetGroupId || siblingItems.length < 2) return null;
    return siblingItems;
  }, [item, siblingItems]);

  if (!item) return null;

  const setValue = (setIndex, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === setIndex ? { ...r, [field]: value } : r)));
  };

  const handleKey = (key) => {
    const current = rows[active.set]?.[active.field] ?? "";
    if (key === "back") {
      setValue(active.set, active.field, current.slice(0, -1));
      return;
    }
    if (key === "." && (current.includes(".") || active.field === "reps")) return;
    if (current.length >= 6) return;
    setValue(active.set, active.field, current + key);
  };

  const handleNext = () => {
    if (tracksWeight && active.field === "reps") {
      setActive({ set: active.set, field: "weight" });
    } else if (active.set + 1 < rows.length) {
      setActive({ set: active.set + 1, field: "reps" });
    }
  };

  const handleSameAsLast = () => {
    if (active.set === 0) return;
    const prev = rows[active.set - 1];
    setRows((r) => r.map((row, i) => (i === active.set ? { ...prev } : row)));
  };

  const handleAddSet = () => setRows((prev) => [...prev, { reps: "", weight: "" }]);

  const openHistory = async () => {
    setShowHistory(true);
    if (history === null) {
      try {
        setHistory(await listCoachingNoteHistory(userId, item.exercise.id));
      } catch {
        setHistory([]);
      }
    }
  };

  const fieldBox = (setIndex, field) => {
    const value = rows[setIndex]?.[field] ?? "";
    const isActive = active.set === setIndex && active.field === field;
    const filled = value !== "";
    return (
      <Pressable
        key={field}
        onPress={() => setActive({ set: setIndex, field })}
        style={{
          flex: 1,
          height: scale === "tv" ? 58 : 48,
          marginHorizontal: 4,
          borderRadius: 12,
          borderWidth: isActive ? 2 : 1.5,
          borderColor: isActive ? colors.primary : filled ? LOGGED_BORDER : "#ddd6cd",
          borderStyle: filled || isActive ? "solid" : "dashed",
          backgroundColor: filled ? LOGGED_BG : "white",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.sansSemiBold,
            fontSize: scale === "tv" ? 22 : 18,
            color: filled ? "#3f4a36" : colors.hint,
          }}
        >
          {value !== "" ? value : field === "weight" ? "–" : (item.repScheme?.[setIndex] ?? item.targetReps ?? "–")}
        </Text>
      </Pressable>
    );
  };

  const lastTimeLine = (() => {
    if (lastTime === undefined) return null;
    if (!lastTime) return "First time logging this lift.";
    const sets = lastTime.sets
      .filter((s) => s.reps != null || s.weight != null)
      .map((s) => (s.weight != null ? `${s.reps ?? "–"}×${s.weight}` : `${s.reps ?? "–"}`))
      .join("  ");
    return `Last time (${formatDateMD(lastTime.date)}): ${sets}`;
  })();

  const padWidth = scale === "tv" ? 660 : "100%";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View
          style={{
            width: padWidth,
            maxWidth: "100%",
            maxHeight: "94%",
            borderRadius: 22,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            overflow: "hidden",
          }}
        >
          <ScrollView contentContainerStyle={{ padding: scale === "tv" ? 24 : 16 }} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <Text style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1, color: colors.muted, textTransform: "uppercase" }}>
              {clientName}
            </Text>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: scale === "tv" ? 26 : 20, color: colors.primaryOnWhite, marginTop: 2 }}>
              {item.exercise.name}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 4 }}>
              {prescriptionLine(item)}
            </Text>

            {/* Superset siblings — one-tap A1 <-> A2 switching without closing the pad */}
            {letters ? (
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                {letters.map((sib) => {
                  const activeSib = sib.id === item.id;
                  return (
                    <PressFade
                      key={sib.id}
                      onPress={() => !activeSib && onSwitchItem?.(sib)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        marginRight: 8,
                        borderRadius: 999,
                        backgroundColor: activeSib ? colors.primary : "white",
                        borderWidth: 1,
                        borderColor: activeSib ? colors.primary : CARD_BORDER,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: activeSib ? "white" : "#57534e" }} numberOfLines={1}>
                        {sib.exercise.name}
                      </Text>
                    </PressFade>
                  );
                })}
              </View>
            ) : null}

            {item.notes ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#57534e", marginTop: 8 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Coach note: </Text>
                {item.notes}
              </Text>
            ) : null}
            {lastTimeLine ? (
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#8a5140", marginTop: 8 }}>{lastTimeLine}</Text>
            ) : null}

            {/* Set rows + keypad side by side at TV scale, stacked on phone */}
            <View style={{ flexDirection: scale === "tv" ? "row" : "column", marginTop: 16 }}>
              <View style={{ flex: scale === "tv" ? 1 : undefined, marginRight: scale === "tv" ? 20 : 0 }}>
                <View style={{ flexDirection: "row", marginBottom: 6, paddingHorizontal: 4 }}>
                  <Text style={{ width: 52, fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, color: colors.muted }}>SET</Text>
                  <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, color: colors.muted }}>REPS</Text>
                  {tracksWeight ? (
                    <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, color: colors.muted }}>LB</Text>
                  ) : null}
                </View>
                {rows.map((row, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ width: 52, fontFamily: fonts.sansSemiBold, fontSize: type.body, color: "#57534e", paddingLeft: 4 }}>{i + 1}</Text>
                    {fieldBox(i, "reps")}
                    {tracksWeight ? fieldBox(i, "weight") : null}
                  </View>
                ))}
                <View style={{ flexDirection: "row", marginTop: 2 }}>
                  <PressFade onPress={handleAddSet} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.primaryOnWhite }}>+ Add set</Text>
                  </PressFade>
                  <PressFade
                    onPress={handleSameAsLast}
                    disabled={active.set === 0}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, opacity: active.set === 0 ? 0.5 : 1 }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.primaryOnWhite }}>Same as last set</Text>
                  </PressFade>
                </View>

                {/* Member notes — written into logs.notes, duplicated per set (existing convention) */}
                <TextInput
                  value={memberNotes}
                  onChangeText={setMemberNotes}
                  placeholder="Session notes (member's log)"
                  placeholderTextColor={colors.hint}
                  multiline
                  style={{
                    marginTop: 12,
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    backgroundColor: "white",
                    padding: 10,
                    fontFamily: fonts.sans,
                    fontSize: type.body,
                    color: "#292524",
                  }}
                />

                {/* Coaching note — the "killed this, go up in weight" that follows
                    the client into next week (exercise_coaching_notes, keyed on
                    the raw exercise id). */}
                {latestNote ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#57534e", marginTop: 10 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>
                      Coach ({formatDateMD(latestNote.created_at.slice(0, 10))}):{" "}
                    </Text>
                    {latestNote.body}
                  </Text>
                ) : null}
                <TextInput
                  value={coachingNote}
                  onChangeText={setCoachingNote}
                  placeholder="Coaching note for next time (e.g. killed this — go up in weight)"
                  placeholderTextColor={colors.hint}
                  multiline
                  style={{
                    marginTop: 8,
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#cfd8c4",
                    backgroundColor: "#fbfcf9",
                    padding: 10,
                    fontFamily: fonts.sans,
                    fontSize: type.body,
                    color: "#292524",
                  }}
                />
                <PressFade onPress={showHistory ? () => setShowHistory(false) : openHistory} style={{ paddingVertical: 8 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: colors.muted }}>
                    {showHistory ? "Hide note history" : "Note history"}
                  </Text>
                </PressFade>
                {showHistory
                  ? (history ?? []).map((n) => (
                      <Text key={n.id} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#57534e", marginBottom: 4 }}>
                        <Text style={{ color: colors.muted }}>{formatDateMD(n.created_at.slice(0, 10))} — </Text>
                        {n.body}
                      </Text>
                    ))
                  : null}
                {showHistory && history && history.length === 0 ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>No notes yet.</Text>
                ) : null}
              </View>

              <View style={{ marginTop: scale === "tv" ? 0 : 16 }}>
                <HubNumberPad onKey={handleKey} onNext={handleNext} scale={scale} />
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: CARD_BORDER, backgroundColor: "white" }}>
            <PressFade onPress={onClose} disabled={saving} style={{ flex: 1, paddingVertical: 16, alignItems: "center", opacity: saving ? 0.5 : 1 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#57534e" }}>Cancel</Text>
            </PressFade>
            <PressFade
              onPress={() => onSave({ rows, memberNotes, coachingNote })}
              disabled={saving}
              style={{ flex: 1.4, paddingVertical: 16, alignItems: "center", backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>{saving ? "Saving…" : "Save"}</Text>
            </PressFade>
          </View>
        </View>
      </View>
    </Modal>
  );
}
