// Turns off browser autofill on every TextInput app-wide, unless the call
// site explicitly asks for it.
//
// react-native-web's TextInput does this (see its source, near the bottom of
// exports/TextInput/index.js):
//
//   supportedProps.autoComplete = autoComplete || autoCompleteType || 'on';
//
// so omitting the prop is not "leave it to the browser" — it renders a real
// autocomplete="on" attribute, an explicit opt-IN to autofill. In the
// installed iOS PWA that made Safari offer "AutoFill Contact" above the
// keypad and paint its blue autofill-target rectangles over unrelated fields
// (reported on the nutrition macro grid: the boxes sat offset from the real
// inputs, because Safari draws them in layout-viewport coordinates while the
// keyboard has shifted the visual viewport).
//
// Fields that genuinely should autofill — the sign-in email/password, the
// registration one-time code — set autoComplete themselves and are left
// alone here, same opt-out convention as babel/maxFontSizeMultiplierPlugin.js.
module.exports = function noAutofillPlugin({ types: t }) {
  return {
    name: "no-autofill",
    visitor: {
      JSXOpeningElement(path) {
        const name = path.node.name;
        if (name.type !== "JSXIdentifier" || name.name !== "TextInput") {
          return;
        }

        const alreadySet = path.node.attributes.some(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "autoComplete"
        );
        if (alreadySet) {
          return;
        }

        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier("autoComplete"), t.stringLiteral("off"))
        );
      },
    },
  };
};
