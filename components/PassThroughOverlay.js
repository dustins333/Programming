import { Modal } from "react-native";

// Native implementation. See PassThroughOverlay.web.js for the whole reason
// this component exists — on web an RN <Modal> silently swallowed every
// touch on the app underneath it, which is what made scrolling "get stuck"
// on the PWA whenever a toast or banner was up.
//
// Native keeps the Modal: an RN Modal is presented as its own window, and
// that window boundary is exactly what lets a toast fired from inside an
// already-open modal still render above it (see ToastHost's own note, and
// KeyboardDoneButton's, which documents the same boundary from the other
// side). Children are expected to carry pointerEvents="box-none" as before.
export function PassThroughOverlay({ visible = true, onRequestClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose ?? (() => {})}>
      {children}
    </Modal>
  );
}
