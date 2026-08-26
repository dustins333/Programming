import { useEffect } from "react";
import { Text } from "react-native";
import { sanitizeHtml } from "../lib/richText";
import { fonts, colors } from "../lib/theme";

const STYLE_ID = "kova-doc-view-style";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .kova-doc { font-family: ${fonts.sans}; font-size: 15px; line-height: 1.6; color: #44403c; }
    .kova-doc > :first-child { margin-top: 0; }
    .kova-doc > :last-child { margin-bottom: 0; }
    .kova-doc p { margin: 0 0 12px; }
    /* Both of these are load-bearing, and both were caught by measuring
       computed styles rather than reading the CSS: the app's base reset
       sets list-style-type:none (so bullets vanish without an explicit
       type), and Montserrat is loaded as a separate font FILE per weight,
       so font-weight:700 alone renders at regular weight — bold needs the
       family naming the bold file. */
    .kova-doc ul, .kova-doc ol { margin: 0 0 12px; padding-left: 24px; }
    .kova-doc ul { list-style-type: disc; }
    .kova-doc ol { list-style-type: decimal; }
    .kova-doc li { margin-bottom: 6px; display: list-item; }
    .kova-doc li > p { margin: 0; }
    .kova-doc u { text-decoration: underline; }
    .kova-doc i, .kova-doc em { font-style: italic; }
    .kova-doc h1, .kova-doc h2, .kova-doc h3, .kova-doc h4 { margin: 20px 0 8px; font-family: ${fonts.sansBold}; font-weight: 700; color: #44403c; }
    .kova-doc h1 { font-size: 20px; } .kova-doc h2 { font-size: 18px; }
    .kova-doc h3 { font-size: 16px; } .kova-doc h4 { font-size: 15px; }
    .kova-doc b, .kova-doc strong { font-family: ${fonts.sansBold}; font-weight: 700; }
    .kova-doc blockquote { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid #ece7e1; color: ${colors.muted}; }
    /* A pasted spreadsheet can be wider than a phone. The table itself is
       wrapped in a horizontally scrollable div (see below) rather than being
       squeezed, so the columns stay readable. */
    .kova-doc-tablewrap { overflow-x: auto; margin: 0 0 14px; -webkit-overflow-scrolling: touch; }
    .kova-doc table { border-collapse: collapse; }
    .kova-doc td, .kova-doc th { border: 1px solid #e7e3dd; padding: 7px 11px; text-align: left; vertical-align: top; }
    .kova-doc th { font-family: ${fonts.sansBold}; font-weight: 700; background: #faf8f6; }
    .kova-doc a { color: ${colors.primaryOnWhite}; }
  `;
  document.head.appendChild(el);
}

// Renders a saved document. Sanitizes AGAIN here rather than trusting what
// came out of the database — cheap, and it means a row written by anything
// other than this app's editor still can't inject markup.
export function RichTextView({ body, format, emptyText = "This document has no content yet." }) {
  useEffect(() => {
    ensureStyles();
  }, []);

  if (format !== "html") {
    const text = String(body ?? "");
    if (!text.trim()) {
      return <Text style={{ fontFamily: fonts.sans, color: colors.hint, fontSize: 14 }}>{emptyText}</Text>;
    }
    return (
      <Text selectable style={{ fontFamily: fonts.sans, color: "#44403c", fontSize: 14.5, lineHeight: 23 }}>
        {text}
      </Text>
    );
  }

  const safe = sanitizeHtml(body ?? "");
  if (!safe) {
    return <Text style={{ fontFamily: fonts.sans, color: colors.hint, fontSize: 14 }}>{emptyText}</Text>;
  }
  // Each table gets its own scroll container so a wide spreadsheet scrolls
  // sideways on a phone instead of stretching the page. Safe as a string
  // replace because sanitizeHtml always emits balanced table tags.
  const withScrollableTables = safe
    .replace(/<table>/g, '<div class="kova-doc-tablewrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return <div className="kova-doc" dangerouslySetInnerHTML={{ __html: withScrollableTables }} />;
}
