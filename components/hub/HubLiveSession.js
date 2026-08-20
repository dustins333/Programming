import { useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { SegmentedControl } from "../SegmentedControl";
import { HubBoard } from "./HubBoard";
import { HubClientColumn } from "./HubClientColumn";
import { HubEntryPad } from "./HubEntryPad";
import { toastError } from "../../lib/toast";
import { MOBILE_BREAKPOINT } from "../CoachShell";
import { fonts, colors, type } from "../../lib/theme";

// The running hub session — the pad wiring shared by the wall display
// (app/(display)/index.js) and the coach phone (app/(coach)/spc/live.js) so
// the two surfaces can't drift on how a lift gets entered. The caller owns
// useHubBoard (it also needs it for the idle/setup branch) and passes it in.
//
// authorId: who a coaching note is attributed to — the coach's own id on
// their phone, the hub session's coach_id on the TV (the display account is
// a device, not a person).
export function HubLiveSession({ hub, authorId, scale = "tv" }) {
  const { hubSession, board, warmups, setEditing, saveLift, toggleExerciseComplete, toggleFinalize, moveLift } = hub;
  const { width } = useWindowDimensions();
  const [pad, setPad] = useState(null); // { slot, item } | null
  const [saving, setSaving] = useState(false);
  const [activeClientId, setActiveClientId] = useState(null); // phone-width tabs

  const phoneWidth = scale === "phone" && width < MOBILE_BREAKPOINT;

  const clients = hubSession?.clients ?? [];
  const activeId = activeClientId ?? clients[0]?.user_id ?? null;

  const padEntry = pad ? board?.get(pad.slot.user_id) : null;
  // The pad's item + logs come from the live board so a reorder or another
  // device's write to a DIFFERENT lift stays current — the edited lift's own
  // logs are frozen by useHubBoard's editingRef while the pad is open.
  const padItem = padEntry?.items.find((i) => i.id === pad?.item.id) ?? pad?.item ?? null;
  const padSiblings = useMemo(() => {
    if (!padEntry || !padItem?.supersetGroupId) return [];
    return padEntry.items.filter((i) => i.supersetGroupId === padItem.supersetGroupId);
  }, [padEntry, padItem]);

  const openPad = (slot, item) => {
    setEditing(slot.user_id, item.exercise.id);
    setPad({ slot, item });
  };

  const closePad = () => {
    hub.clearEditing();
    setPad(null);
  };

  const switchPadItem = (item) => {
    // Superset chip — commit nothing, just retarget the pad (its seed effect
    // re-runs off the new item id).
    setEditing(pad.slot.user_id, item.exercise.id);
    setPad({ slot: pad.slot, item });
  };

  const handleSave = async ({ rows, memberNotes, coachingNote }) => {
    if (!pad || saving) return;
    setSaving(true);
    try {
      const entry = board.get(pad.slot.user_id);
      await saveLift({
        userId: pad.slot.user_id,
        spcWorkoutId: entry.spcWorkoutId,
        weekNumber: entry.weekNumber,
        exerciseId: padItem.exercise.id,
        rows,
        memberNotes,
        coachingNote,
        authorId,
      });
      setPad(null);
    } catch (e) {
      toastError("Couldn't save — check the connection.", e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async (slot, item, next) => {
    try {
      const entry = board.get(slot.user_id);
      await toggleExerciseComplete(slot.user_id, item, entry.weekNumber, next);
    } catch (e) {
      toastError("Couldn't update — try again.", e);
      hub.refreshBoard();
    }
  };

  const handleToggleFinalize = async (slot) => {
    try {
      await toggleFinalize(slot.user_id);
    } catch (e) {
      toastError("Couldn't update the session — try again.", e);
    }
  };

  const handleMoveLift = async (slot, itemId, dir) => {
    try {
      await moveLift(slot.user_id, itemId, dir);
    } catch (e) {
      toastError("Couldn't reorder — try again.", e);
      hub.refreshBoard();
    }
  };

  if (!hubSession || !board) return null;

  return (
    <View style={{ flex: 1 }}>
      {phoneWidth ? (
        <View style={{ flex: 1 }}>
          {clients.length > 1 ? (
            <SegmentedControl
              segments={clients.map((c) => ({ key: c.user_id, label: c.client_name.split(" ")[0] }))}
              activeKey={activeId}
              onSelect={setActiveClientId}
            />
          ) : null}
          {(() => {
            const slot = clients.find((c) => c.user_id === activeId) ?? clients[0];
            const entry = slot ? board.get(slot.user_id) : null;
            if (!slot || !entry) {
              return (
                <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted }}>Loading…</Text>
              );
            }
            return (
              <HubClientColumn
                entry={entry}
                warmups={warmups.get(slot.spc_workout_id)}
                scale="phone"
                onPressLift={(item) => openPad(slot, item)}
                onToggleComplete={(item, next) => handleToggleComplete(slot, item, next)}
                onMoveLift={(itemId, dir) => handleMoveLift(slot, itemId, dir)}
                onToggleFinalize={() => handleToggleFinalize(slot)}
              />
            );
          })()}
        </View>
      ) : (
        <HubBoard
          hubSession={hubSession}
          board={board}
          warmups={warmups}
          scale={scale}
          onPressLift={openPad}
          onToggleComplete={handleToggleComplete}
          onMoveLift={handleMoveLift}
          onToggleFinalize={handleToggleFinalize}
        />
      )}

      <HubEntryPad
        visible={!!pad}
        onClose={closePad}
        clientName={pad?.slot.client_name ?? ""}
        item={padItem}
        siblingItems={padSiblings}
        onSwitchItem={switchPadItem}
        logs={pad ? padEntry?.logsByExerciseId.get(padItem?.exercise?.id) : null}
        latestNote={pad && padItem ? padEntry?.latestNoteByExerciseId.get(padItem.exercise.id) ?? null : null}
        userId={pad?.slot.user_id}
        onSave={handleSave}
        saving={saving}
        scale={scale === "tv" ? "tv" : "phone"}
      />
    </View>
  );
}
