import { Text } from "react-native";
import { splitIntoSegments } from "../../lib/nutrition/highlightSegments";
import { fonts } from "../../lib/theme";

// Native (and default/fallback) renderer — read-only. Drag-to-highlight is a
// web-only interaction (see HighlightableAnswer.web.js, picked up
// automatically by Metro's platform-extension resolution); existing
// highlights still render here so a highlight made on web is visible when
// the same check-in is viewed on the native coach app, just not editable.
export function HighlightableAnswer({ text, ranges }) {
  const segments = splitIntoSegments(text, ranges);
  return (
    <Text style={{ fontFamily: fonts.sans }}>
      {segments.map((seg, i) => (
        <Text key={i} style={seg.highlighted ? { backgroundColor: "#fdece5" } : undefined}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}
