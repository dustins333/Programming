import { Platform } from "react-native";

// iOS Safari puts an "AutoFill Contact" bar over the keyboard and paints a
// blue highlight box on the focused field, on the member's numeric log
// fields (macros, weight, sleep, steps, reps). autocomplete="off" does not
// stop it: Safari deliberately ignores that value, because sites abused it.
// What Safari does honour is its own field classification — a field it maps
// to "search" is one it decides needs no AutoFill at all, which suppresses
// both the in-field contacts icon and the keyboard bar.
//
// So: hand the DOM node type="search" plus a name containing "search" (the
// two signals Safari's classifier keys on). Both are safe here —
//   - a search input holds and reports its value exactly like a text input
//     (unlike type="number", which reports "" for a half-typed decimal like
//     "174." and would silently eat every decimal weight), and
//   - react-native-web already sets WebkitAppearance:none on every TextInput
//     and hides ::-webkit-search-cancel-button/-decoration in its own global
//     reset, so nothing about the field looks different.
// The `inputmode="decimal"` these fields already carry is what picks the
// keyboard, independent of type, so the decimal keypad is unaffected.
//
// It has to be applied to the node rather than passed as a prop:
// react-native-web computes `type` itself from keyboardType/inputMode and
// overwrites whatever a caller passes. React never sets a type attribute
// for these fields (it's undefined all the way through), so it doesn't
// fight this on re-render.
//
// Native is a no-op — this is a Safari-on-web behavior only.
let nameCounter = 0;

export function suppressSafariAutofill(node) {
  if (Platform.OS !== "web" || node == null) return;
  try {
    if (node.tagName !== "INPUT") return;
    // Never touch a field that genuinely wants autofill/masking.
    if (node.type === "password" || node.type === "email") return;
    if (node.type !== "search") node.type = "search";
    if (!node.name) node.name = `kova-search-${++nameCounter}`;
  } catch {
    // A DOM that won't take either assignment just keeps the old behavior.
  }
}

// Convenience ref for the common case (no other ref on the input), and a
// merging version for callers that already have one.
export const autofillSuppressedRef = (node) => suppressSafariAutofill(node);

export function mergeAutofillRef(otherRef) {
  return (node) => {
    suppressSafariAutofill(node);
    if (typeof otherRef === "function") otherRef(node);
    else if (otherRef && typeof otherRef === "object") otherRef.current = node;
  };
}
