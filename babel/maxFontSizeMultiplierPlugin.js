// Caps iOS/Android Dynamic Type scaling app-wide without touching any of the
// ~150 existing Text/TextInput call sites. RN's Text/TextInput default
// `allowFontScaling` to true with no ceiling, and this RN version's Text
// component is a plain function with no `defaultProps` (confirmed by reading
// node_modules/react-native/Libraries/Text/Text.js), so the usual
// `Text.defaultProps.maxFontSizeMultiplier` trick doesn't work here — this
// plugin injects the same effect at compile time instead.
//
// Any element that already sets its own maxFontSizeMultiplier is left alone,
// which is how individual components opt into a tighter (or looser) cap —
// see components/SegmentedControl.js, TargetField.js, StatusBadge.js, etc.
module.exports = function maxFontSizeMultiplierPlugin({ types: t }) {
  const TARGET_NAMES = new Set(["Text", "TextInput"]);

  return {
    name: "max-font-size-multiplier",
    visitor: {
      JSXOpeningElement(path, state) {
        const name = path.node.name;
        if (name.type !== "JSXIdentifier" || !TARGET_NAMES.has(name.name)) {
          return;
        }

        const alreadySet = path.node.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.name === "maxFontSizeMultiplier"
        );
        if (alreadySet) {
          return;
        }

        const max = state.opts.max ?? 1.3;
        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("maxFontSizeMultiplier"),
            t.jsxExpressionContainer(t.numericLiteral(max))
          )
        );
      },
    },
  };
};
