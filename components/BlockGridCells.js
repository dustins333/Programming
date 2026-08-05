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

const RUST = "#a46a57";
const RUST_TEXT = "#8a5140";

// copyRole (all optional — undefined means "not in copy mode", the plain
// published/draft rendering below): 'source' (the tile copy was started
// from), 'selected' (a target the coach has picked), 'eligible' (any other
// tile, a valid but not-yet-picked paste target). Highlight marks the
// current-week olive "anchor" treatment — suppressed while a copyRole style
// is active, since the two treatments would otherwise fight over the same
// border/background. onStartCopy, given only outside copy mode on a
// populated tile, renders the small ⧉ that begins it.
export function SessionCell({ workout, weekNum, exerciseNames, onPress, highlight, copyRole, onStartCopy }) {
  const shown = exerciseNames.slice(0, 5);
  const extra = exerciseNames.length - shown.length;
  const isPublished = workout.status === "published";

  let boxStyle = {
    borderWidth: 1,
    backgroundColor: isPublished ? PUBLISHED_BG : "white",
    borderColor: isPublished ? PUBLISHED_BORDER : "#e7e5e4",
  };
  if (highlight && !copyRole) {
    boxStyle = { borderWidth: 2, backgroundColor: "#f5f8f1", borderColor: "#4d6142" };
  }
  if (copyRole === "source") {
    boxStyle = { borderWidth: 2, backgroundColor: "#fdf6f2", borderColor: RUST };
  } else if (copyRole === "selected") {
    boxStyle = { borderWidth: 1.5, backgroundColor: "#fdf6f2", borderColor: RUST };
  } else if (copyRole === "eligible") {
    boxStyle = { borderWidth: 1.5, borderStyle: "dashed", backgroundColor: "white", borderColor: RUST };
  }

  return (
    <Pressable onPress={onPress} style={{ width: SESSION_COL_WIDTH, minHeight: CELL_MIN_HEIGHT, ...boxStyle }} className="rounded-[14px] p-2.5">
      {onStartCopy && !copyRole && shown.length > 0 ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onStartCopy();
          }}
          className="absolute right-2.5 top-2.5 z-10 items-center justify-center rounded-md border"
          style={{ width: 24, height: 24, backgroundColor: "white", borderColor: "#dbe8cf" }}
        >
          <Text style={{ color: "#4d6142", fontSize: 12 }}>⧉</Text>
        </Pressable>
      ) : null}
      {copyRole === "source" ? (
        <View className="absolute right-2.5 top-2.5 z-10 items-center justify-center rounded-md" style={{ width: 24, height: 24, backgroundColor: RUST }}>
          <Text style={{ color: "white", fontSize: 12 }}>⧉</Text>
        </View>
      ) : null}
      {copyRole === "selected" ? (
        <View className="absolute right-2.5 top-2.5 z-10 items-center justify-center rounded-full" style={{ width: 20, height: 20, backgroundColor: RUST }}>
          <Text style={{ color: "white", fontSize: 11 }}>✓</Text>
        </View>
      ) : null}

      {copyRole === "eligible" && shown.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: RUST_TEXT, fontStyle: "italic" }}>Click to paste here</Text>
        </View>
      ) : copyRole === "selected" && shown.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: RUST_TEXT }}>Selected</Text>
        </View>
      ) : (
        <>
          {/* The published/draft difference used to be a subtle background
              tint only — easy to miss at a glance scanning a whole grid
              (exactly what led to a session reading as unpublished with no
              clear signal why). A plain label is unambiguous; in-flow above
              the week line rather than an absolute overlay so it can't
              collide with the "Wk N" text sharing the same top-left corner. */}
          {!isPublished && !copyRole ? (
            <View className="mb-1 self-start rounded-full" style={{ backgroundColor: "#fdf1de", paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, color: "#92400e", letterSpacing: 0.4 }}>DRAFT</Text>
            </View>
          ) : null}
          <Text
            style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: copyRole === "source" ? RUST_TEXT : undefined }}
            className={copyRole === "source" ? "mb-1.5" : "mb-1.5 text-stone-500"}
          >
            Wk {weekNum}
            {copyRole === "source" ? " · copying" : ""}
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
        </>
      )}
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
// onStart is optional — omit it (native's "no programming from the app"
// policy) to render the gap as plain status text with no creation button.
export function GapSlot({ rowCount, groupWidth, onStart, starting }) {
  const height = rowCount * CELL_MIN_HEIGHT + (rowCount - 1) * CELL_GAP;
  return (
    <View
      style={{ width: groupWidth, height, marginBottom: CELL_GAP }}
      className="items-center justify-center rounded-xl border border-dashed border-stone-300 px-4"
    >
      <Text className={onStart ? "mb-3 text-center text-stone-400" : "text-center text-stone-400"} style={{ fontFamily: fonts.sans }}>
        Nothing scheduled yet.
      </Text>
      {onStart ? (
        <Pressable onPress={onStart} disabled={starting} className="rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50">
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {starting ? "Starting…" : "Start new block"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
