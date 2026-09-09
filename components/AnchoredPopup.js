import { Pressable, Modal, useWindowDimensions } from "react-native";

// A small card that opens against the thing that opened it rather than in
// the middle of the window.
//
// Extracted from the phase editor when the Weeks tab grew a strip of tabs
// each with its own popup — three copies of this clamping arithmetic is
// three chances for one of them to open off the bottom of a long list.
//
// `anchor` is a box in WINDOW coordinates, as measureInWindow gives it. On
// react-native-web that is a getBoundingClientRect, which is what makes the
// numbers line up with a fixed-position Modal even on a scrolled page. A
// null anchor falls back to roughly centred, so a missing measurement is a
// worse position rather than a broken one.

const EDGE = 12;

export function AnchoredPopup({ visible, anchor, width = 288, estimatedHeight = 300, onClose, children }) {
  const { width: winW, height: winH } = useWindowDimensions();
  if (!visible) return null;

  const left = anchor
    ? Math.max(EDGE, Math.min(anchor.x, winW - width - EDGE))
    : Math.max(EDGE, (winW - width) / 2);
  // Below the anchor by default, pushed up when there isn't room underneath.
  const belowY = anchor ? anchor.y + anchor.height + 6 : winH / 2 - estimatedHeight / 2;
  const top = Math.max(EDGE, Math.min(belowY, winH - estimatedHeight));

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.25)" }} onPress={onClose}>
        {/* Swallows presses so tapping inside the card doesn't dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            position: "absolute",
            left,
            top,
            width,
            backgroundColor: "white",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#ece7e1",
            padding: 14,
            shadowColor: "#44403c",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 18,
            elevation: 8,
          }}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Hands a popup the on-screen box of the control that opened it. Falls back
// to a null anchor (centred) when the ref isn't measurable yet.
export function measureAnchor(ref, then) {
  if (!ref?.current?.measureInWindow) {
    then(null);
    return;
  }
  ref.current.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
}
