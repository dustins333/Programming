import { View, Text } from "react-native";
import { PressFade } from "./PressFade";

// Native half of the shared reorderable list. @dnd-kit is web-only, so this
// falls back to the ▲/▼ pair already used by QuestionListEditor rather than
// leaving reordering unavailable on a phone. See SortableList.web.js for the
// real drag implementation — both expose the identical API:
//
//   <SortableList items={rows} onReorder={next => ...} renderItem={(item, controls) => ...} />
//
// `controls` is a ready-made node the caller drops wherever it wants the
// handle to sit in its own row. `onReorder` always receives the full new
// array, so callers persist positions as 1..N regardless of platform.
export function SortableList({ items, onReorder, renderItem, keyExtractor = (item) => item.id }) {
  const move = (index, direction) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  return (
    <View>
      {items.map((item, i) => {
        const atTop = i === 0;
        const atBottom = i === items.length - 1;
        const controls = (
          <View style={{ marginRight: 4 }}>
            <PressFade onPress={() => move(i, "up")} disabled={atTop} hitSlop={6} accessibilityLabel="Move up">
              <Text style={{ fontSize: 11, color: atTop ? "#d6d3d1" : "#78716c" }}>▲</Text>
            </PressFade>
            <PressFade onPress={() => move(i, "down")} disabled={atBottom} hitSlop={6} accessibilityLabel="Move down">
              <Text style={{ fontSize: 11, color: atBottom ? "#d6d3d1" : "#78716c" }}>▼</Text>
            </PressFade>
          </View>
        );
        return <View key={keyExtractor(item)}>{renderItem(item, controls, i)}</View>;
      })}
    </View>
  );
}
