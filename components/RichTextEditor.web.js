import { useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { sanitizeHtml, textToHtml } from "../lib/richText";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";
const STYLE_ID = "kova-doc-editor-style";

// Nested elements can't be styled from an inline style object, so the rules
// for <ul>/<li>/<b> inside the editable area go in a real stylesheet,
// injected once per document rather than once per mount.
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .kova-doc-edit { outline: none; }
    .kova-doc-edit p { margin: 0 0 10px; }
    /* Both of these are load-bearing, and both were caught by measuring
       computed styles rather than reading the CSS: the app's base reset
       sets list-style-type:none (so bullets vanish without an explicit
       type), and Montserrat is loaded as a separate font FILE per weight,
       so font-weight:700 alone renders at regular weight — bold needs the
       family naming the bold file. */
    .kova-doc-edit ul, .kova-doc-edit ol { margin: 0 0 10px; padding-left: 22px; }
    .kova-doc-edit ul { list-style-type: disc; }
    .kova-doc-edit ol { list-style-type: decimal; }
    .kova-doc-edit li { margin-bottom: 4px; display: list-item; }
    .kova-doc-edit li > p { margin: 0; }
    .kova-doc-edit b, .kova-doc-edit strong { font-family: ${fonts.sansBold}; font-weight: 700; }
    .kova-doc-edit u { text-decoration: underline; }
    .kova-doc-edit i, .kova-doc-edit em { font-style: italic; }
    .kova-doc-edit h1, .kova-doc-edit h2, .kova-doc-edit h3, .kova-doc-edit h4 { margin: 14px 0 8px; font-family: ${fonts.sansBold}; font-weight: 700; }
    .kova-doc-edit h1 { font-size: 1.35em; } .kova-doc-edit h2 { font-size: 1.2em; }
    .kova-doc-edit h3 { font-size: 1.08em; } .kova-doc-edit h4 { font-size: 1em; }
    .kova-doc-edit blockquote { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid ${CARD_BORDER}; color: ${colors.muted}; }
    .kova-doc-edit table { border-collapse: collapse; margin: 0 0 10px; }
    .kova-doc-edit td, .kova-doc-edit th { border: 1px solid #e7e3dd; padding: 6px 10px; text-align: left; vertical-align: top; min-width: 60px; }
    .kova-doc-edit th { font-family: ${fonts.sansBold}; font-weight: 700; background: #faf8f6; }
    .kova-doc-edit a { color: ${colors.primaryOnWhite}; }
    .kova-doc-edit:empty:before { content: attr(data-placeholder); color: ${colors.hint}; }
  `;
  document.head.appendChild(el);
}

function ToolButton({ label, title, onPress, bold, italic, underline }) {
  return (
    <Pressable
      // onMouseDown, not onPress: a click steals focus from the editable
      // area first, which collapses the selection the command is meant to
      // act on. Preventing the default here keeps the caret where it was.
      onMouseDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      accessibilityLabel={title}
      style={{
        minWidth: 34,
        height: 30,
        paddingHorizontal: 8,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: bold ? fonts.sansBold : fonts.sansMedium,
          color: "#44403c",
          fontSize: 13,
          fontStyle: italic ? "italic" : "normal",
          textDecorationLine: underline ? "underline" : "none",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Rich text for staff documents. Uncontrolled by design: the DOM owns the
// content while you're typing and `onChange` only reports outward. Writing
// sanitized HTML back into the node on every keystroke would move the caret
// to the end of the document on every character.
//
// `resetKey` is what re-seeds it — pass the document id, never the value,
// or every keystroke would reset the editor.
export function RichTextEditor({ initialValue, initialFormat, onChange, resetKey, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    // A pre-0093 document is plain text; converting it here is what lets an
    // existing document be opened and reformatted rather than retyped.
    const html = initialFormat === "html" ? sanitizeHtml(initialValue ?? "") : textToHtml(initialValue ?? "");
    ref.current.innerHTML = html;
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => {
    if (!ref.current) return;
    onChange(sanitizeHtml(ref.current.innerHTML));
  };

  const exec = (command, value) => {
    if (typeof document === "undefined") return;
    // execCommand is formally deprecated and still the only thing every
    // browser implements for contenteditable formatting. The alternative is
    // a Selection/Range implementation of bold-a-partial-word, which is a
    // large amount of subtle code to replace something that works.
    document.execCommand(command, false, value);
    emit();
  };

  const handlePaste = (e) => {
    // The whole point of the feature: take the clipboard's HTML flavour
    // (which carries the bullets and the underline) and keep the parts we
    // render, instead of letting the browser drop in Word's raw markup.
    const html = e.clipboardData?.getData("text/html");
    const text = e.clipboardData?.getData("text/plain");
    if (!html && !text) return;
    e.preventDefault();
    const safe = html ? sanitizeHtml(html) : textToHtml(text);
    document.execCommand("insertHTML", false, safe);
    emit();
  };

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <ToolButton label="B" title="Bold" bold onPress={() => exec("bold")} />
        <ToolButton label="I" title="Italic" italic onPress={() => exec("italic")} />
        <ToolButton label="U" title="Underline" underline onPress={() => exec("underline")} />
        <ToolButton label="H" title="Heading" bold onPress={() => exec("formatBlock", "<h3>")} />
        <ToolButton label="¶" title="Normal text" onPress={() => exec("formatBlock", "<p>")} />
        <ToolButton label="• List" title="Bulleted list" onPress={() => exec("insertUnorderedList")} />
        <ToolButton label="1. List" title="Numbered list" onPress={() => exec("insertOrderedList")} />
        <ToolButton label="Clear" title="Remove formatting" onPress={() => exec("removeFormat")} />
      </View>

      <div
        ref={ref}
        className="kova-doc-edit"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? "Paste the document here."}
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        style={{
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: CARD_BORDER,
          borderRadius: 10,
          padding: 14,
          minHeight: 260,
          maxHeight: 520,
          overflowY: "auto",
          overflowX: "auto",
          fontFamily: fonts.sans,
          fontSize: 15,
          lineHeight: 1.55,
          color: "#44403c",
          background: "white",
        }}
      />
      <Text style={{ fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        Paste straight from Google Docs, Sheets or Word — bullets, numbering, bold, italic, underline, headings and
        tables all come with it. Fonts, colours and sizes are stripped so it reads the same on every phone.
      </Text>
    </View>
  );
}
