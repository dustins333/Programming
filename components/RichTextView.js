import { View, Text, ScrollView } from "react-native";
import { parseRichBlocks } from "../lib/richText";
import { fonts, colors } from "../lib/theme";

const HEADING_SIZE = { h1: 20, h2: 18, h3: 16, h4: 15 };

function Runs({ spans, size, color }) {
  return (
    <Text selectable style={{ fontFamily: fonts.sans, color, fontSize: size, lineHeight: size * 1.55 }}>
      {spans.map((span, i) => (
        <Text
          key={i}
          style={{
            fontFamily: span.bold ? fonts.sansBold : fonts.sans,
            fontStyle: span.italic ? "italic" : "normal",
            textDecorationLine: span.underline ? "underline" : "none",
          }}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );
}

const CELL_MIN_WIDTH = 120;

// A pasted spreadsheet is usually wider than a phone, so the grid scrolls
// sideways rather than being crushed into unreadable columns. Column count
// comes from the widest row — a short row is padded so the borders line up
// instead of leaving a ragged edge.
function TableBlock({ rows }) {
  const columns = rows.reduce((max, row) => Math.max(max, row.reduce((n, cell) => n + (cell.colspan || 1), 0)), 0);
  if (!columns) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
      <View style={{ borderWidth: 1, borderColor: "#e7e3dd", borderRadius: 6, overflow: "hidden" }}>
        {rows.map((row, r) => {
          const used = row.reduce((n, cell) => n + (cell.colspan || 1), 0);
          const padding = Math.max(0, columns - used);
          return (
            <View key={r} style={{ flexDirection: "row", borderTopWidth: r === 0 ? 0 : 1, borderTopColor: "#e7e3dd" }}>
              {row.map((cell, c) => (
                <View
                  key={c}
                  style={{
                    width: CELL_MIN_WIDTH * (cell.colspan || 1),
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderLeftWidth: c === 0 ? 0 : 1,
                    borderLeftColor: "#e7e3dd",
                    backgroundColor: cell.header ? "#faf8f6" : "transparent",
                  }}
                >
                  <Text
                    selectable
                    style={{
                      fontFamily: cell.header || cell.spans.every((s) => s.bold) ? fonts.sansBold : fonts.sans,
                      color: "#44403c",
                      fontSize: 13.5,
                      lineHeight: 20,
                    }}
                  >
                    {cell.spans.map((s) => s.text).join("")}
                  </Text>
                </View>
              ))}
              {padding > 0 ? <View style={{ width: CELL_MIN_WIDTH * padding }} /> : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Native has no innerHTML, so the same sanitized markup is walked into real
// <Text> runs instead. Same source of truth as the web renderer
// (lib/richText.js), so the two can't disagree about what a document says —
// only about how much typographic polish it gets.
export function RichTextView({ body, format, emptyText = "This document has no content yet." }) {
  if (format !== "html") {
    const text = String(body ?? "");
    if (!text.trim()) {
      return <Text style={{ fontFamily: fonts.sans, color: colors.hint, fontSize: 14 }}>{emptyText}</Text>;
    }
    return (
      <Text selectable style={{ fontFamily: fonts.sans, color: "#44403c", fontSize: 14.5, lineHeight: 23 }}>
        {text}
      </Text>
    );
  }

  const blocks = parseRichBlocks(body ?? "");
  if (blocks.length === 0) {
    return <Text style={{ fontFamily: fonts.sans, color: colors.hint, fontSize: 14 }}>{emptyText}</Text>;
  }

  return (
    <View>
      {blocks.map((block, i) => {
        if (block.type === "table") {
          return <TableBlock key={i} rows={block.rows} />;
        }
        if (block.type === "li") {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6, paddingLeft: 4 + (block.depth ?? 0) * 16 }}>
              <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 14.5, lineHeight: 22.5, minWidth: 16 }}>
                {block.marker}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Runs spans={block.spans} size={14.5} color="#44403c" />
              </View>
            </View>
          );
        }
        if (HEADING_SIZE[block.type]) {
          return (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 16, marginBottom: 8 }}>
              <Text selectable style={{ fontFamily: fonts.sansBold, color: "#44403c", fontSize: HEADING_SIZE[block.type] }}>
                {block.spans.map((s) => s.text).join("")}
              </Text>
            </View>
          );
        }
        if (block.type === "quote") {
          return (
            <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: "#ece7e1", paddingLeft: 12, marginBottom: 12 }}>
              <Runs spans={block.spans} size={14.5} color={colors.muted} />
            </View>
          );
        }
        return (
          <View key={i} style={{ marginBottom: 12 }}>
            <Runs spans={block.spans} size={14.5} color="#44403c" />
          </View>
        );
      })}
    </View>
  );
}
