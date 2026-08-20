import { View } from "react-native";
import { HubClientColumn } from "./HubClientColumn";

// Layout shell — N client columns side by side (the wall display, or the
// coach's browser at desktop width). Column width falls out of flex: 1, so
// 1 client gets the whole board and 4 get ~468px each at 1920.
export function HubBoard({ hubSession, board, warmups, scale = "tv", onPressLift, onToggleComplete, onMoveLift, onToggleFinalize }) {
  if (!hubSession || !board) return null;
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {hubSession.clients.map((slot, i) => {
        const entry = board.get(slot.user_id);
        if (!entry) return null;
        return (
          <View key={slot.id} style={{ flex: 1, marginLeft: i === 0 ? 0 : 12 }}>
            <HubClientColumn
              entry={entry}
              warmups={warmups.get(slot.spc_workout_id)}
              scale={scale}
              onPressLift={(item) => onPressLift(slot, item)}
              onToggleComplete={(item, next) => onToggleComplete(slot, item, next)}
              onMoveLift={(itemId, dir) => onMoveLift(slot, itemId, dir)}
              onToggleFinalize={() => onToggleFinalize(slot)}
            />
          </View>
        );
      })}
    </View>
  );
}
