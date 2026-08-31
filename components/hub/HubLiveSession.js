import { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { SegmentedControl } from "../SegmentedControl";
import { HubBoard } from "./HubBoard";
import { HubClientColumn } from "./HubClientColumn";
import { toastError } from "../../lib/toast";
import { MOBILE_BREAKPOINT } from "../CoachShell";
import { fonts, colors, type } from "../../lib/theme";

// The running hub session — the write wiring shared by the wall display
// (app/(display)/index.js) and the coach phone (app/(coach)/spc/live.js) so
// the two surfaces can't drift on how a lift gets entered. The caller owns
// useHubBoard (it also needs it for the idle/setup branch) and passes it in.
//
// There is no entry-pad modal any more on either surface: both expand a lift
// in place inside its own column, with the keypad docked beneath it. The
// phone is the same pattern at 390px, plus first-name tabs — the cheapest
// client switch at that width, and already what coaches use.
//
// authorName: whose first name a saved note is attributed to — the coach's
// own on their phone, the hub session's coach on the TV (the display account
// is a device, not a person, and cannot read core.users to look one up).
export function HubLiveSession({ hub, authorId, authorName, scale = "tv", now, onDropClient = null }) {
  const { hubSession, board, warmups, setEditing, markEdit, clearEditing, saveSets, saveNote, toggleExerciseComplete, toggleFinalize, moveLift } = hub;
  const { width } = useWindowDimensions();
  const [activeClientId, setActiveClientId] = useState(null); // phone-width tabs

  const phoneWidth = scale === "phone" && width < MOBILE_BREAKPOINT;
  const clients = hubSession?.clients ?? [];
  const activeId = activeClientId ?? clients[0]?.user_id ?? null;

  const handleSaveSets = async (slot, { exerciseId, rows }) => {
    const entry = board?.get(slot.user_id);
    if (!entry) return;
    try {
      await saveSets({ userId: slot.user_id, entry, exerciseId, rows });
    } catch (e) {
      toastError("Couldn't save those sets — check the connection.", e);
    }
  };

  const handleSaveNote = async (slot, { exerciseId, body, authorName: name }) => {
    const entry = board?.get(slot.user_id);
    if (!entry) return;
    try {
      await saveNote({
        userId: slot.user_id,
        entry,
        exerciseId,
        body,
        authorId,
        authorName: name ?? authorName ?? null,
      });
    } catch (e) {
      toastError("Couldn't save that note — try again.", e);
    }
  };

  const handleToggleComplete = async (slot, item, next) => {
    try {
      await toggleExerciseComplete(slot.user_id, item, next);
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

  const handleDropClient = onDropClient
    ? async (slot) => {
        try {
          await onDropClient(slot.user_id);
        } catch (e) {
          toastError("Couldn't take her off the board.", e);
        }
      }
    : null;

  const handlers = {
    onToggleComplete: handleToggleComplete,
    onDropClient: handleDropClient,
    onMoveLift: handleMoveLift,
    onToggleFinalize: handleToggleFinalize,
    onBeginEdit: setEditing,
    onEditDirty: markEdit,
    onEndEdit: clearEditing,
    onSaveSets: handleSaveSets,
    onSaveNote: handleSaveNote,
  };

  if (!hubSession || !board) return null;

  if (phoneWidth) {
    const slot = clients.find((c) => c.user_id === activeId) ?? clients[0];
    const entry = slot ? board.get(slot.user_id) : null;
    return (
      <View style={{ flex: 1 }}>
        {clients.length > 1 ? (
          <SegmentedControl
            segments={clients.map((c) => ({ key: c.user_id, label: c.client_name.split(" ")[0] }))}
            activeKey={activeId}
            onSelect={setActiveClientId}
          />
        ) : null}
        {!slot || !entry ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted }}>Loading…</Text>
        ) : (
          <HubClientColumn
            entry={entry}
            userId={slot.user_id}
            warmups={warmups.get(slot.group_workout_id ?? slot.spc_workout_id)}
            scale="phone"
            authorName={authorName}
            onToggleComplete={(item, next) => handleToggleComplete(slot, item, next)}
            onMoveLift={(itemId, dir) => handleMoveLift(slot, itemId, dir)}
            onToggleFinalize={() => handleToggleFinalize(slot)}
            onBeginEdit={setEditing}
            onEditDirty={markEdit}
            onEndEdit={clearEditing}
            onSaveSets={(payload) => handleSaveSets(slot, payload)}
            onSaveNote={(payload) => handleSaveNote(slot, payload)}
            onDropClient={handleDropClient ? () => handleDropClient(slot) : null}
          />
        )}
      </View>
    );
  }

  return (
    <HubBoard
      hubSession={hubSession}
      board={board}
      warmups={warmups}
      scale={scale}
      now={now}
      authorName={authorName}
      handlers={handlers}
    />
  );
}
