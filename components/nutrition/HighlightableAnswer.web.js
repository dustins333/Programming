import { useRef } from "react";
import { Text, View } from "react-native";
import { splitIntoSegments } from "../../lib/nutrition/highlightSegments";
import { fonts } from "../../lib/theme";

// Walks the container's text nodes to find the plain-text character offset
// of a DOM Range boundary — needed because our segments render as several
// nested <span>s (one per highlighted/plain run) rather than one text node,
// so a raw range.startOffset alone isn't a whole-string offset.
function textOffset(container, node, nodeOffset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return offset + nodeOffset;
    offset += current.textContent.length;
    current = walker.nextNode();
  }
  return offset;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

// Web-only: select a run of text in the answer to highlight it (stored as
// character-offset ranges on the checkin_responses.highlights jsonb
// column); tap an existing highlight to remove it. Selecting text is a
// mouse/trackpad-drag interaction that doesn't translate to touch, so this
// stays web-only per the nutrition rebuild plan — native renders the same
// highlights read-only (HighlightableAnswer.js).
export function HighlightableAnswer({ text, ranges, onChangeRanges }) {
  const containerRef = useRef(null);
  const segments = splitIntoSegments(text, ranges);

  const handleMouseUp = () => {
    if (!onChangeRanges || !containerRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const domRange = selection.getRangeAt(0);
    const containerNode = containerRef.current;
    // getRangeAt gives DOM nodes — bail if the selection isn't actually
    // inside this answer's container (e.g. spans multiple answers).
    if (!containerNode.contains(domRange.startContainer) || !containerNode.contains(domRange.endContainer)) return;

    try {
      const start = textOffset(containerNode, domRange.startContainer, domRange.startOffset);
      const end = textOffset(containerNode, domRange.endContainer, domRange.endOffset);
      if (end <= start) return;
      const next = mergeRanges([...(ranges ?? []), [start, end]]);
      onChangeRanges(next);
      selection.removeAllRanges();
    } catch {
      // Selection landed somewhere we couldn't map cleanly — no-op rather
      // than corrupt the stored ranges.
    }
  };

  const handleRemove = (range) => {
    if (!onChangeRanges) return;
    onChangeRanges((ranges ?? []).filter((r) => r[0] !== range[0] || r[1] !== range[1]));
  };

  return (
    // @ts-ignore - RN Web passes unrecognized DOM event props straight through.
    <View ref={containerRef} onMouseUp={handleMouseUp}>
      <Text style={{ fontFamily: fonts.sans }}>
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <Text
              key={i}
              onPress={() => handleRemove(seg.range)}
              style={{ backgroundColor: "#fdece5", cursor: "pointer" }}
              title="Click to remove highlight"
            >
              {seg.text}
            </Text>
          ) : (
            <Text key={i}>{seg.text}</Text>
          )
        )}
      </Text>
    </View>
  );
}
