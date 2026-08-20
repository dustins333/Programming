import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { getSpcRosterDetail } from "../../lib/programming/spcRoster";
import { listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { getCompletedSpcWorkoutIdsForWeek } from "../../lib/programming/sessionCompletions";
import { startHubSession } from "../../lib/programming/hub";
import { showToast } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The coach's "start a live session" picker — 4 slots, each resolving a
// client to their current block/week and defaulting to the first incomplete
// published session of that week, with an override row. Per-slot errors
// ("no current block", "nothing published this week") never block the other
// slots. Start → startHubSession → the parent switches to the running view.

const CARD_BORDER = "#ece7e1";

async function resolveSlot(rosterRow) {
  // Roster detail already carries the current block + week number.
  if (!rosterRow.block || !rosterRow.weekNumber) {
    return { userId: rosterRow.userId, name: rosterRow.name, error: "No current block", sessions: [] };
  }
  const workouts = await listSpcWorkoutsForWeek(rosterRow.block.id, rosterRow.weekNumber);
  const published = workouts.filter((w) => w.status === "published");
  if (published.length === 0) {
    return { userId: rosterRow.userId, name: rosterRow.name, error: "Nothing published this week", sessions: [] };
  }
  const completedIds = await getCompletedSpcWorkoutIdsForWeek(
    rosterRow.userId,
    published.map((w) => w.id),
    rosterRow.weekNumber
  );
  const sessions = published.map((w) => ({
    spcWorkoutId: w.id,
    sessionNumber: w.session_number,
    title: w.title || null,
    completed: completedIds.has(w.id),
  }));
  const firstIncomplete = sessions.find((s) => !s.completed) ?? sessions[0];
  return {
    userId: rosterRow.userId,
    name: rosterRow.name,
    weekNumber: rosterRow.weekNumber,
    sessions,
    selected: firstIncomplete.spcWorkoutId,
    error: null,
  };
}

function ClientPickerModal({ visible, onClose, roster, excludedIds, onPick }) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);
  const q = search.trim().toLowerCase();
  const rows = (roster ?? []).filter(
    (r) => !excludedIds.has(r.userId) && (!q || r.name.toLowerCase().includes(q))
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={() => {}}
          style={{ maxHeight: "80%", backgroundColor: colors.canvas, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: type.title, color: "#292524", marginBottom: 10 }}>Pick a client</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search clients"
            placeholderTextColor={colors.hint}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: CARD_BORDER,
              backgroundColor: "white",
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontFamily: fonts.sans,
              fontSize: type.body,
              color: "#292524",
              marginBottom: 10,
            }}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {rows.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, paddingVertical: 12 }}>No clients match.</Text>
            ) : null}
            {rows.map((r) => (
              <PressFade
                key={r.userId}
                onPress={() => onPick(r)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: CARD_BORDER,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.bodyLg, color: "#292524" }}>{r.name}</Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 1 }}>
                    {r.block ? `${r.blockLabel ?? "Block"} | Week ${r.weekNumber}` : "No current block"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </PressFade>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function HubSessionSetup({ profile, onStarted }) {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [slots, setSlots] = useState([null, null, null, null]);
  const [pickerFor, setPickerFor] = useState(null); // slot index or null
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getSpcRosterDetail();
        if (!cancelled) setRoster(rows.filter((r) => r.status !== "paused"));
      } catch (e) {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filled = slots.filter(Boolean);
  const validSlots = filled.filter((s) => !s.error && s.selected);
  const excludedIds = new Set(filled.map((s) => s.userId));

  const handlePick = async (rosterRow) => {
    const index = pickerFor;
    setPickerFor(null);
    // Optimistic placeholder while sessions resolve.
    setSlots((prev) => prev.map((s, i) => (i === index ? { userId: rosterRow.userId, name: rosterRow.name, resolving: true, sessions: [] } : s)));
    try {
      const resolved = await resolveSlot(rosterRow);
      setSlots((prev) => prev.map((s, i) => (i === index ? resolved : s)));
    } catch (e) {
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { userId: rosterRow.userId, name: rosterRow.name, error: "Couldn't load sessions", sessions: [] } : s))
      );
    }
  };

  const handleStart = async () => {
    if (validSlots.length === 0 || starting) return;
    setStarting(true);
    try {
      const payload = validSlots.map((s) => {
        const session = s.sessions.find((x) => x.spcWorkoutId === s.selected);
        return { userId: s.userId, clientName: s.name, spcWorkoutId: s.selected, weekNumber: s.weekNumber, session };
      });
      const started = await startHubSession({ coachId: profile.id, slots: payload });
      onStarted?.(started);
    } catch (e) {
      showToast(e?.message ?? "Couldn't start the session.");
    } finally {
      setStarting(false);
    }
  };

  if (loadError) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: "#b23a22" }}>Couldn't load the SPC roster — check your connection and reopen this screen.</Text>
      </View>
    );
  }
  if (!roster) {
    return (
      <View style={{ padding: 40, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View>
      <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginBottom: 14 }}>
        Pick up to 4 clients for this session. Each defaults to their next incomplete session this week — tap a session pill to change it.
      </Text>

      {slots.map((slot, i) => (
        <View
          key={i}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: slot ? "#f0ddd2" : CARD_BORDER,
            backgroundColor: slot ? "#fdf6f2" : "white",
            padding: 14,
            marginBottom: 10,
          }}
        >
          {!slot ? (
            <PressFade onPress={() => setPickerFor(i)} style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: type.bodyLg, color: colors.primaryOnWhite, marginLeft: 8 }}>
                Add client
              </Text>
            </PressFade>
          ) : (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: type.bodyLg, color: "#292524" }}>{slot.name}</Text>
                  {slot.resolving ? (
                    <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 2 }}>Loading sessions…</Text>
                  ) : slot.error ? (
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#b23a22", marginTop: 2 }}>{slot.error}</Text>
                  ) : (
                    <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 2 }}>Week {slot.weekNumber}</Text>
                  )}
                </View>
                <PressFade onPress={() => setSlots((prev) => prev.map((s, j) => (j === i ? null : s)))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={22} color={colors.muted} />
                </PressFade>
              </View>
              {slot.sessions?.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                  {slot.sessions.map((sess) => {
                    const active = slot.selected === sess.spcWorkoutId;
                    return (
                      <PressFade
                        key={sess.spcWorkoutId}
                        onPress={() => setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, selected: sess.spcWorkoutId } : s)))}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 999,
                          marginRight: 8,
                          marginTop: 4,
                          backgroundColor: active ? colors.primary : "white",
                          borderWidth: 1,
                          borderColor: active ? colors.primary : CARD_BORDER,
                        }}
                      >
                        {sess.completed ? (
                          <Ionicons name="checkmark-circle" size={14} color={active ? "white" : "#4d6142"} style={{ marginRight: 4 }} />
                        ) : null}
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: active ? "white" : "#57534e" }}>
                          {`Session ${sess.sessionNumber}${sess.title ? ` — ${sess.title}` : ""}`}
                        </Text>
                      </PressFade>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        </View>
      ))}

      <PressFade
        onPress={handleStart}
        disabled={validSlots.length === 0 || starting}
        style={{
          marginTop: 6,
          borderRadius: 14,
          paddingVertical: 15,
          alignItems: "center",
          backgroundColor: colors.primary,
          opacity: validSlots.length === 0 || starting ? 0.5 : 1,
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
          {starting ? "Starting…" : `Start live session${validSlots.length > 0 ? ` (${validSlots.length})` : ""}`}
        </Text>
      </PressFade>

      <ClientPickerModal
        visible={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        roster={roster}
        excludedIds={excludedIds}
        onPick={handlePick}
      />
    </View>
  );
}
