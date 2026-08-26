// The formatting layer for staff documents (0093).
//
// Deliberately a pure-JS tokenizer with NO DOM dependency, even though the
// only place anyone authors one of these is the web admin screen. Two
// reasons: the sanitizer has to be able to run again at render time on
// native (where there is no DOMParser), and one implementation that both
// platforms share can't drift into disagreeing about what a document says.

// Everything a pasted SOP or agreement actually uses. Anything outside this
// list is UNWRAPPED, not dropped — a Word paste is mostly <span> and <div>
// noise wrapped around the real content, so throwing the content away with
// the tag would empty the document.
const ALLOWED = new Set([
  "p", "br", "ul", "ol", "li", "b", "strong", "i", "em", "u", "h1", "h2", "h3", "h4", "blockquote", "a",
  // Tables are here because a Google SHEETS copy puts a <table> on the
  // clipboard — without them a pasted grid arrived as one run-together blob
  // of cell text with all its structure thrown away.
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
]);
const VOID = new Set(["br"]);
// Word/Docs wrap real content in these; map them to the nearest thing we do
// render rather than unwrapping, or the block structure collapses into one
// long paragraph.
const REMAP = { div: "p", h5: "h4", h6: "h4", strike: null, span: null, font: null, caption: "p", colgroup: null };
// Content inside these is markup for the browser, never text for a reader —
// so unlike everything else, the CONTENT is dropped along with the tag.
// STRICTLY tags that really do have a closing partner: a void element here
// would send the "skip ahead to </tag>" scan to the end of the string and
// swallow the whole document (a Google Docs paste opens with <meta charset>,
// which is exactly how this was caught).
const DROP_CONTENT = new Set(["script", "style", "xml", "head", "title"]);
// Dropped, but they close nothing, so only the tag itself goes.
const DROP_VOID = new Set(["meta", "link", "base", "col", "input", "img", "hr", "source"]);

const BLOCK_TAGS = new Set(["p", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote"]);
const CELL_TAGS = new Set(["td", "th"]);

// Merged cells in a spreadsheet arrive as colspan/rowspan. These are the only
// attributes kept anywhere besides href — dropping them silently reshapes the
// grid, and they're trivially safe once clamped to a small integer.
function spanAttrs(attrs) {
  let out = "";
  for (const name of ["colspan", "rowspan"]) {
    const raw = attrs.match(new RegExp(name + '\\s*=\\s*["\']?(\\d{1,2})', "i"))?.[1];
    const value = Number(raw);
    if (Number.isFinite(value) && value > 1) out += ` ${name}="${Math.min(value, 50)}"`;
  }
  return out;
}

function safeHref(value) {
  const href = String(value ?? "").trim();
  // Scheme allow-list, not a deny-list: `javascript:` is the obvious one to
  // block, but so are data:, vbscript:, and anything invented later.
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^\/|^#/.test(href)) return href;
  return null;
}

function escapeText(text) {
  return text.replace(/&(?!#?\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Splits into { type: "tag" | "text" } tokens. Comments and the content of
// DROP_CONTENT tags are consumed here so nothing downstream has to think
// about them.
function tokenize(html) {
  const tokens = [];
  let i = 0;
  const source = String(html ?? "");
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      tokens.push({ type: "text", value: source.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ type: "text", value: source.slice(i, lt) });

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    const gt = source.indexOf(">", lt);
    if (gt === -1) {
      // A lone "<" with no closing bracket is text, not a broken tag.
      tokens.push({ type: "text", value: source.slice(lt) });
      break;
    }

    const raw = source.slice(lt + 1, gt);
    const closing = raw.startsWith("/");
    const body = closing ? raw.slice(1) : raw;
    // A tag name must START with a letter. Without this, prose like
    // "5 < 6 and a > b" reads as a tag called "6" and everything up to the
    // next ">" disappears.
    const name = (body.match(/^[a-zA-Z][a-zA-Z0-9:_-]*/)?.[0] ?? "").toLowerCase().replace(/^o:/, "");
    if (!name) {
      tokens.push({ type: "text", value: source.slice(lt, gt + 1) });
      i = gt + 1;
      continue;
    }
    if (DROP_VOID.has(name)) {
      i = gt + 1;
      continue;
    }

    if (!closing && DROP_CONTENT.has(name)) {
      const close = source.toLowerCase().indexOf(`</${name}`, gt);
      if (close === -1) {
        i = source.length;
      } else {
        const closeEnd = source.indexOf(">", close);
        i = closeEnd === -1 ? source.length : closeEnd + 1;
      }
      continue;
    }
    if (closing && DROP_CONTENT.has(name)) {
      i = gt + 1;
      continue;
    }

    tokens.push({ type: "tag", name, closing, selfClosing: body.trimEnd().endsWith("/"), attrs: body.slice(name.length) });
    i = gt + 1;
  }
  return tokens;
}

function resolveTag(name) {
  if (Object.prototype.hasOwnProperty.call(REMAP, name)) return REMAP[name];
  return ALLOWED.has(name) ? name : null;
}

const INLINE_TAGS = new Set(["b", "strong", "i", "em", "u"]);

function parseStyle(attrs) {
  const raw = attrs.match(/style\s*=\s*"([^"]*)"/i)?.[1] ?? attrs.match(/style\s*=\s*'([^']*)'/i)?.[1] ?? "";
  const map = {};
  for (const declaration of raw.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    map[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim().toLowerCase();
  }
  return map;
}

// Formatting has to be read from the STYLE first and the tag name second,
// because Google Docs (and Sheets) express it entirely through inline CSS on
// <span> — bold is `font-weight:700`, not <b>. Reading only the tag name lost
// every bit of formatting in a Docs paste.
//
// The style also has to be able to say NO. A Docs paste wraps its whole body
// in `<b style="font-weight:normal">`; trusting the tag there turns the
// entire document bold.
function inlineStateFor(tag, attrs) {
  const style = parseStyle(attrs);

  const weight = style["font-weight"];
  const bold =
    weight !== undefined
      ? weight === "bold" || weight === "bolder" || Number(weight) >= 600
      : tag === "b" || tag === "strong";

  const fontStyle = style["font-style"];
  const italic =
    fontStyle !== undefined ? fontStyle === "italic" || fontStyle === "oblique" : tag === "i" || tag === "em";

  const decoration = style["text-decoration-line"] ?? style["text-decoration"];
  const underline = decoration !== undefined ? decoration.includes("underline") : tag === "u";

  return { bold, italic, underline };
}

function lastFrameIndex(stack, name) {
  for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].name === name) return i;
  return -1;
}

// Whitelist-sanitize, dropping every attribute except a validated href and a
// cell's colspan/rowspan.
//
// The stack holds a frame per open element recording which tags were actually
// EMITTED for it, which is what makes style-derived formatting work: an
// unwrapped <span style="font-weight:700"> emits a <b> that its own </span>
// then closes. `active` stops a run of nested bold spans (which Docs emits
// freely) from producing <b><b><b>.
export function sanitizeHtml(html) {
  const out = [];
  const stack = [];
  const active = { b: 0, i: 0, u: 0 };

  const closeFrame = (frame) => {
    for (let i = frame.emitted.length - 1; i >= 0; i -= 1) {
      const tag = frame.emitted[i];
      out.push(`</${tag}>`);
      if (active[tag] !== undefined) active[tag] -= 1;
    }
  };

  for (const token of tokenize(html)) {
    if (token.type === "text") {
      out.push(escapeText(token.value));
      continue;
    }

    const base = resolveTag(token.name);

    if (token.closing) {
      const at = lastFrameIndex(stack, token.name);
      if (at === -1) continue; // stray close with nothing open
      while (stack.length > at) closeFrame(stack.pop());
      continue;
    }

    if (base && VOID.has(base)) {
      out.push(`<${base}>`);
      continue;
    }
    // A self-closing element has no content, so there is nothing to format.
    if (token.selfClosing) continue;

    const frame = { name: token.name, emitted: [] };

    // Structural tag first, so any inline formatting nests INSIDE it.
    if (base && !INLINE_TAGS.has(base)) {
      if (base === "a") {
        const href = safeHref(token.attrs.match(/href\s*=\s*["']?([^"'\s>]+)/i)?.[1]);
        // A link with nowhere to go is just text — but keep the frame, so
        // its own closing tag still balances.
        if (href) {
          out.push(`<a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer">`);
          frame.emitted.push("a");
        }
      } else if (CELL_TAGS.has(base)) {
        out.push(`<${base}${spanAttrs(token.attrs)}>`);
        frame.emitted.push(base);
      } else {
        out.push(`<${base}>`);
        frame.emitted.push(base);
      }
    }

    const state = inlineStateFor(token.name, token.attrs);
    for (const [tag, on] of [["b", state.bold], ["i", state.italic], ["u", state.underline]]) {
      if (!on || active[tag] > 0) continue;
      out.push(`<${tag}>`);
      active[tag] += 1;
      frame.emitted.push(tag);
    }

    stack.push(frame);
  }
  while (stack.length) closeFrame(stack.pop());

  let output = out.join("");
  // Indentation between block tags is markup formatting, not content. Left
  // in, it shows up as text nodes — harmless to a browser, but it makes the
  // stored value noisy and means sanitizing twice gives two different
  // answers. Only block boundaries are touched, so a real space between
  // inline runs ("set <b>targets</b> now") survives.
  const BLOCKS = "p|ul|ol|li|h[1-4]|blockquote|table|thead|tbody|tfoot|tr";
  output = output
    .replace(new RegExp(`(</?(?:${BLOCKS})>)[ \\t\\r\\n]+`, "g"), "$1")
    .replace(new RegExp(`[ \\t\\r\\n]+(</?(?:${BLOCKS})>)`, "g"), "$1")
    // A cell tag can carry colspan/rowspan, so it needs its own pattern.
    .replace(/(<t[dh][^>]*>)[ \t\r\n]+/g, "$1")
    .replace(/[ \t\r\n]+(<\/t[dh]>)/g, "$1");

  // Looped, not a single pass: removing an empty inner block can leave its
  // parent empty in turn (Word writes <p><o:p>&nbsp;</o:p></p>, which needs
  // two passes to disappear). Bounded so a pathological input can't spin.
  for (let pass = 0; pass < 6; pass += 1) {
    const before = output;
    output = output
      .replace(/<(b|i|u)>(?:\s|&nbsp;)*<\/\1>/gi, "")
      .replace(/<(p|h[1-4]|blockquote)>(?:\s|&nbsp;|<br>)*<\/\1>/gi, "")
      .replace(/<li>(?:\s|&nbsp;|<br>)*<\/li>/gi, "")
      .replace(/<(ul|ol)>\s*<\/\1>/gi, "")
      // A spreadsheet selection almost always drags trailing blank rows in
      // with it.
      .replace(/<tr>(?:<t[dh][^>]*>(?:\s|&nbsp;|<br>)*<\/t[dh]>)+<\/tr>/gi, "")
      .replace(/<(thead|tbody|tfoot)>\s*<\/\1>/gi, "")
      .replace(/<table>\s*<\/table>/gi, "");
    if (output === before) break;
  }
  return output.trim();
}

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "\u2019", "&lsquo;": "\u2018", "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&mdash;": "\u2014", "&ndash;": "\u2013" };

function decodeEntities(text) {
  return text
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&rsquo;|&lsquo;|&ldquo;|&rdquo;|&mdash;|&ndash;/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// Plain-text flattening — used for the list-row preview and anywhere the
// formatting isn't wanted.
export function htmlToPlainText(html) {
  let text = String(html ?? "");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Deliberately no </li> here — each <li> already opens its own line, and
  // adding one on close puts a blank line between every bullet.
  text = text.replace(/<\/t[dh]>\s*(?=<t[dh])/gi, "\t");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|blockquote)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  return decodeEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

// Plain text -> HTML, for opening a pre-0093 document (or one typed rather
// than pasted) in the rich editor without losing its line breaks.
export function textToHtml(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const html = lines
    .map((line) => (line.trim().length === 0 ? "" : `<p>${escapeText(line)}</p>`))
    .filter(Boolean)
    .join("");
  return html || "<p></p>";
}

// Structured form for the native renderer, which has no innerHTML to hand
// the browser. Blocks in document order, each carrying inline runs that
// know their own bold/italic/underline state.
export function parseRichBlocks(html) {
  const blocks = [];
  const inline = { b: 0, i: 0, u: 0 };
  const listStack = [];
  const counters = [];
  let current = null;
  // Table state. `cell` takes priority over `current` for incoming text —
  // a paragraph inside a cell belongs to the cell, not to the document.
  let table = null;
  let row = null;
  let cell = null;
  // Google Docs nests a <p> inside every <li>. Without this, that paragraph
  // starts its own block and steals the bullet's text, leaving an empty <li>
  // that then gets filtered out — the bullets vanish entirely.
  let liDepth = 0;

  const startBlock = (type, extra = {}) => {
    current = { type, spans: [], ...extra };
    blocks.push(current);
  };
  const pushText = (value) => {
    const text = decodeEntities(value);
    if (!text) return;
    const target = cell ?? current;
    if (!target) {
      if (!text.trim()) return;
      startBlock("p");
      return pushText(value);
    }
    if (!target.spans.length && !text.trim()) return;
    target.spans.push({ text, bold: inline.b > 0, italic: inline.i > 0, underline: inline.u > 0 });
  };

  for (const token of tokenize(sanitizeHtml(html))) {
    if (token.type === "text") {
      pushText(token.value);
      continue;
    }
    const tag = token.name;
    if (tag === "br") {
      pushText("\n");
      continue;
    }
    if (tag === "b" || tag === "strong") inline.b += token.closing ? -1 : 1;
    else if (tag === "i" || tag === "em") inline.i += token.closing ? -1 : 1;
    else if (tag === "u") inline.u += token.closing ? -1 : 1;
    else if (tag === "table") {
      if (token.closing) {
        table = null;
        row = null;
        cell = null;
      } else {
        table = { type: "table", rows: [] };
        blocks.push(table);
        current = null;
      }
    } else if (tag === "tr") {
      if (token.closing) {
        row = null;
        cell = null;
      } else if (table) {
        row = [];
        table.rows.push(row);
      }
    } else if (tag === "td" || tag === "th") {
      if (token.closing) {
        cell = null;
      } else if (row) {
        cell = { spans: [], header: tag === "th", colspan: Number(token.attrs.match(/colspan\s*=\s*"(\d+)"/i)?.[1] ?? 1) };
        row.push(cell);
      }
    } else if (tag === "ul" || tag === "ol") {
      if (token.closing) {
        listStack.pop();
        counters.pop();
      } else {
        listStack.push(tag);
        counters.push(0);
      }
      current = null;
    } else if (tag === "li") {
      if (!token.closing) {
        liDepth += 1;
        const ordered = listStack[listStack.length - 1] === "ol";
        if (ordered) counters[counters.length - 1] += 1;
        startBlock("li", {
          depth: Math.max(0, listStack.length - 1),
          marker: ordered ? `${counters[counters.length - 1]}.` : "\u2022",
        });
      } else {
        liDepth = Math.max(0, liDepth - 1);
        current = null;
      }
    } else if (BLOCK_TAGS.has(tag)) {
      // Inside a cell or a list item these are just line structure — the
      // cell or the bullet is the block.
      if (cell || liDepth > 0) continue;
      if (token.closing) current = null;
      else startBlock(tag === "blockquote" ? "quote" : tag);
    }
    // Inline counters can't go negative on a stray close.
    inline.b = Math.max(0, inline.b);
    inline.i = Math.max(0, inline.i);
    inline.u = Math.max(0, inline.u);
  }

  return blocks.filter((block) =>
    block.type === "table"
      ? block.rows.some((r) => r.some((c) => c.spans.some((span) => span.text.trim().length > 0)))
      : block.spans.some((span) => span.text.trim().length > 0)
  );
}

// Is there anything to read? An "empty" body is often <p></p> or a stray
// <br>, which is not the same as a blank string.
export function isRichEmpty(body, format) {
  if (format === "html") return htmlToPlainText(body).length === 0;
  return String(body ?? "").trim().length === 0;
}
