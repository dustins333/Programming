import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { splitIntoSegments } from "../../lib/nutrition/highlightSegments";
import { fonts } from "../../lib/theme";

// Plain-text character offset of a DOM Range boundary within the container —
// needed because our segments render as several nested <span>s (one per
// highlighted/plain run) rather than one text node, so a raw
// range.startOffset alone isn't a whole-string offset. Measuring a range
// from the container's start to the boundary handles an element-node
// boundary (which a drag that starts/ends on whitespace can produce) the
// same as a text-node one; walking text nodes by hand only handled the
// latter.
function textOffset(container, node, nodeOffset) {
  const measure = document.createRange();
  measure.selectNodeContents(container);
  measure.setEnd(node, nodeOffset);
  return measure.toString().length;
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
  // A drag that starts and ends inside one already-highlighted run fires
  // mouseup (which adds the new range) and THEN click on that run (which
  // removed it) — so re-highlighting over an existing highlight silently
  // wiped it instead of extending it. Set on a completed drag, cleared on
  // the next mousedown, checked by the click handler.
  const justSelectedRef = useRef(false);
  const segments = splitIntoSegments(text, ranges);

  const handleMouseUp = () => {
    if (!onChangeRanges || !containerRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const domRange = selection.getRangeAt(0);
    const containerNode = containerRef.current;

    try {
      // Clamp rather than bail when a boundary lands outside this answer.
      // Dragging a little past the last word, or starting just left of the
      // first one, routinely puts one boundary on a neighbouring node, and
      // the old all-or-nothing containment check silently did nothing in
      // exactly the cases a hand-drawn selection is most likely to produce.
      const containerRange = document.createRange();
      containerRange.selectNodeContents(containerNode);
      // compareBoundaryPoints' constant names read source-to-this:
      // END_TO_START compares THIS range's start against the source's end,
      // START_TO_END compares this range's end against the source's start.
      const startsAfterContainer = domRange.compareBoundaryPoints(Range.END_TO_START, containerRange) >= 0;
      const endsBeforeContainer = domRange.compareBoundaryPoints(Range.START_TO_END, containerRange) <= 0;
      if (startsAfterContainer || endsBeforeContainer) return;

      const start = containerNode.contains(domRange.startContainer)
        ? textOffset(containerNode, domRange.startContainer, domRange.startOffset)
        : 0;
      const end = containerNode.contains(domRange.endContainer)
        ? textOffset(containerNode, domRange.endContainer, domRange.endOffset)
        : text.length;
      if (end <= start) return;
      justSelectedRef.current = true;
      const next = mergeRanges([...(ranges ?? []), [start, end]]);
      onChangeRanges(next);
      selection.removeAllRanges();
    } catch {
      // Selection landed somewhere we couldn't map cleanly — no-op rather
      // than corrupt the stored ranges.
    }
  };

  // The mouseup has to be listened for on the document, not on this
  // answer's own container: a mouse event fires on whatever is under the
  // pointer when the button is RELEASED, and releasing a drag just past the
  // last word (a completely ordinary way to select a phrase) lands outside
  // this View, so a container-level handler never ran and the selection
  // silently produced no highlight. Everything the handler does is already
  // scoped to this container's own text, so listening globally is safe.
  const mouseUpRef = useRef(handleMouseUp);
  mouseUpRef.current = handleMouseUp;
  useEffect(() => {
    const onMouseDown = () => {
      justSelectedRef.current = false;
    };
    const onMouseUp = () => mouseUpRef.current();
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleRemove = (range) => {
    if (!onChangeRanges) return;
    if (justSelectedRef.current) {
      // This click is the tail of the drag we just turned into a highlight.
      justSelectedRef.current = false;
      return;
    }
    onChangeRanges((ranges ?? []).filter((r) => r[0] !== range[0] || r[1] !== range[1]));
  };

  return (
    <View ref={containerRef}>
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
