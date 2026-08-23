import { Text, View, useWindowDimensions } from "react-native";
import { HubClientColumn } from "./HubClientColumn";
import { fonts, colors } from "../../lib/theme";

// The board's layout shell, and its one real layout rule: A COLUMN IS ONLY
// EVER ONE OF TWO WIDTHS.
//
// Four clients is the standard 460px column and three expands to fill (~620);
// one and two hold that same 463px column. The card inside a column therefore
// never has to be redrawn for the session size, and — the reason this matters
// more than it sounds — a column never resizes because of something happening
// in another column, so nothing moves under a finger when someone taps.
//
// At one and two clients the COLUMNS are centred on the wall, not pushed to
// one side, and the clock takes the gap to their left. Equal flex spacers on
// both sides are what does it: the group lands dead centre and the clock
// centres itself inside its own half of the leftover.
export const HUB_COLUMN_MAX = 463;
const GAP = 12;

function BoardClock({ now }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, letterSpacing: 2.2, color: colors.muted, textTransform: "uppercase" }}>
        {now.toLocaleDateString([], { weekday: "long" })} · {now.toLocaleDateString([], { month: "long", day: "numeric" })}
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 150, lineHeight: 168, color: "#44403c" }}>
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}
      </Text>
    </View>
  );
}

export function HubBoard({ hubSession, board, warmups, scale = "tv", now, authorName, handlers }) {
  const { width } = useWindowDimensions();
  if (!hubSession || !board) return null;
  const slots = hubSession.clients;
  // 1–2 clients keep the four-up column width and centre. Guarded on there
  // actually being room for it — on a narrower browser (a coach at desktop
  // width, not the 1920 wall) two fixed 463px columns would run off the edge,
  // so below that they fall back to filling like 3 and 4 do.
  const needed = HUB_COLUMN_MAX * slots.length + GAP * (slots.length - 1);
  const fixedWidth = slots.length <= 2 && width >= needed + 80;

  const columns = slots.map((slot, i) => {
    const entry = board.get(slot.user_id);
    if (!entry) return null;
    return (
      <View
        key={slot.id}
        style={fixedWidth ? { width: HUB_COLUMN_MAX, marginLeft: i === 0 ? 0 : GAP } : { flex: 1, maxWidth: HUB_COLUMN_MAX * 2, marginLeft: i === 0 ? 0 : GAP }}
      >
        <HubClientColumn
          entry={entry}
          userId={slot.user_id}
          warmups={warmups.get(slot.spc_workout_id)}
          scale={scale}
          authorName={authorName}
          onToggleComplete={(item, next) => handlers.onToggleComplete(slot, item, next)}
          onMoveLift={(itemId, dir) => handlers.onMoveLift(slot, itemId, dir)}
          onToggleFinalize={() => handlers.onToggleFinalize(slot)}
          onBeginEdit={handlers.onBeginEdit}
          onEditDirty={handlers.onEditDirty}
          onEndEdit={handlers.onEndEdit}
          onSaveSets={(payload) => handlers.onSaveSets(slot, payload)}
          onSaveNote={(payload) => handlers.onSaveNote(slot, payload)}
        />
      </View>
    );
  });

  if (fixedWidth) {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {now ? <BoardClock now={now} /> : null}
        </View>
        <View style={{ flexDirection: "row" }}>{columns}</View>
        {/* Matches the clock's flex so the columns land centred, not pushed right. */}
        <View style={{ flex: 1 }} />
      </View>
    );
  }

  return <View style={{ flex: 1, flexDirection: "row" }}>{columns}</View>;
}
