// A physical keyboard typing into the hub board's set boxes.
//
// The gym floor screen is a touchscreen with a real keyboard next to it, and
// the girls use whichever is closer. The docked keypad has always handled
// touch; this routes hardware keys to the SAME active cell, so the two are
// interchangeable rather than one replacing the other.
//
// Deliberately a document-level key listener rather than turning the set
// boxes into focusable <input>s:
//   - Focusing a real input on the coach's phone pops the soft keyboard over
//     the card she is typing into. The boxes must stay plain tap targets.
//   - The active cell is already a piece of shared state driving the dock's
//     label and the keypad; a browser focus ring would be a second, parallel
//     idea of "which box is live" that could disagree with it.
//
// Up to four columns can be expanded at once, so exactly one of them owns the
// keyboard: whichever was touched last. Each expanded column registers a
// dispatcher, and claiming happens on expand and on every field tap. If the
// owner collapses while another column is still open, a single remaining
// column takes over rather than the keys going nowhere.
//
// Web only — on native this module is never wired up (see HubClientColumn).

const dispatchers = new Map(); // id -> (action) => void
let activeId = null;
let listening = false;

function currentDispatcher() {
  const owned = activeId != null ? dispatchers.get(activeId) : null;
  if (owned) return owned;
  // The last owner closed its card but something else is still open, and
  // there is only one candidate — no ambiguity, so keep typing working.
  if (dispatchers.size === 1) return dispatchers.values().next().value;
  return null;
}

// A keystroke aimed at a real text field (the lift's note box, a search box,
// a bar-weight field) belongs to that field, not to the set boxes.
function typingIntoAField() {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function actionFor(e) {
  const k = e.key;
  if (k >= "0" && k <= "9") return { type: "digit", key: k };
  if (k === "." || k === ",") return { type: "digit", key: "." };
  if (k === "Backspace" || k === "Delete") return { type: "digit", key: "back" };
  // Enter and Tab both mean "done with this box" — same as the dock's Next.
  if (k === "Enter" || k === "Tab") return { type: "next" };
  if (k === "ArrowUp") return { type: "move", dir: "up" };
  if (k === "ArrowDown") return { type: "move", dir: "down" };
  if (k === "ArrowLeft") return { type: "move", dir: "left" };
  if (k === "ArrowRight") return { type: "move", dir: "right" };
  return null;
}

function onKeyDown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  if (typingIntoAField()) return;
  const dispatch = currentDispatcher();
  if (!dispatch) return;
  const action = actionFor(e);
  if (!action) return;
  // Tab in particular has to be stopped, or the browser moves focus off the
  // board mid-set and the next keystroke lands somewhere else entirely.
  e.preventDefault();
  dispatch(action);
}

function attach() {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", onKeyDown);
  listening = true;
}

function detach() {
  if (!listening || typeof document === "undefined") return;
  document.removeEventListener("keydown", onKeyDown);
  listening = false;
}

// Called by an expanded column. Returns its own teardown.
export function registerHubKeyboard(id, dispatch) {
  dispatchers.set(id, dispatch);
  attach();
  return () => {
    dispatchers.delete(id);
    if (activeId === id) activeId = null;
    if (dispatchers.size === 0) detach();
  };
}

// "This column is the one being typed into." Cheap enough to call on every tap.
export function focusHubKeyboard(id) {
  activeId = id;
}
