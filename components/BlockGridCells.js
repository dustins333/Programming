import { View, Text, Pressable } from "react-native";
import { fonts } from "../lib/theme";

// Shared by Group Programs' and SPC's block-creation grids — both lay a
// session/week grid out identically (fixed-size cells so gap spans and row
// labels stay aligned), just with a different data source per program vs.
// per client. Extracted once both screens needed pixel-identical versions.
export const SESSION_COL_WIDTH = 168;
export const CELL_MIN_HEIGHT = 122;
export const CELL_GAP = 12; // matches className="gap-3"

// Published/draft reads straight off the cell's own background now — a
// subtle green tint (same tone as the app's other "on track"/"logged"
// states) instead of a small corner dot, so status is visible at a glance
// across the whole grid rather than something you have to look for.
const PUBLISHED_BG = "#eef1e7";
const PUBLISHED_BORDER = "#d3ddc7";

export function SessionCell({ workout, weekNum, exerciseNames, onPress }) {
  const shown = exerciseNames.slice(0, 5);
  const extra = exerciseNames.length - shown.length;
  const isPublished = workout.status === "published";
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: SESSION_COL_WIDTH,
        minHeight: CELL_MIN_HEIGHT,
        backgroundColor: isPublished ? PUBLISHED_BG : "white",
        borderColor: isPublished ? PUBLISHED_BORDER : "#e7e5e4",
      }}
      className="rounded-lg border p-2.5"
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11 }} className="mb-1.5 text-stone-500">
        Wk {weekNum}
      </Text>
      {shown.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11 }} className="text-stone-300">
          Empty
        </Text>
      ) : (
        shown.map((name, i) => (
          <Text key={i} numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5 }} className="mb-0.5 text-stone-600">
            {name}
          </Text>
        ))
      )}
      {extra > 0 ? (
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11 }} className="text-stone-400">
          +{extra} more
        </Text>
      ) : null}
    </Pressable>
  );
}

export function PlaceholderCell() {
  return (
    <View
      style={{ width: SESSION_COL_WIDTH, minHeight: CELL_MIN_HEIGHT }}
      className="items-center justify-center rounded-lg border border-dashed border-stone-200"
    >
      <Text className="px-2 text-center text-xs text-stone-300" style={{ fontFamily: fonts.sans }}>
        Not scheduled
      </Text>
    </View>
  );
}

// One prompt spanning exactly the rows that have nothing covering them —
// right where the gap actually starts, whether that's because the
// program/client has never had a block or because its current one ends
// partway through the visible window.
export function GapSlot({ rowCount, groupWidth, onStart, starting }) {
  const height = rowCount * CELL_MIN_HEIGHT + (rowCount - 1) * CELL_GAP;
  return (
    <View
      style={{ width: groupWidth, height, marginBottom: CELL_GAP }}
      className="items-center justify-center rounded-xl border border-dashed border-stone-300 px-4"
    >
      <Text className="mb-3 text-center text-stone-400" style={{ fontFamily: fonts.sans }}>
        Nothing scheduled yet.
      </Text>
      <Pressable onPress={onStart} disabled={starting} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {starting ? "Starting…" : "Start new block"}
        </Text>
      </Pressable>
    </View>
  );
}
