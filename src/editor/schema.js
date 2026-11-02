// The Text Editor's document model (ProseMirror schema): what a document may contain. Every attribute is validated, so
// content read from a file or pasted from elsewhere can hold only these values.
//
// Blocks: paragraph and heading (levels 1–3), both with an optional alignment; blockquote; code block; horizontal rule;
// bulleted and numbered lists. Inline: text and hard breaks. Marks: bold, italic, underline, strikethrough, subscript or
// superscript, inline code, link (http, https, mailto), font family, font size (points), and color.
// Images and tables come later.
import { Schema } from "prosemirror-model";
import { schema as basic, marks as basicMarks } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

export const ALIGNS = ["left", "center", "right", "justify"];
export const DEFAULT_FONT = "Arial";
export const DEFAULT_SIZE = 12; // points
export const SIZE_RANGE = { min: 1, max: 400 };

const fail = (what) => { throw new RangeError(`Invalid ${what}.`); };
const alignValue = (value) => (value === null || ALIGNS.includes(value) ? value : fail("alignment"));
export const safeHref = (value) => {
  if (typeof value !== "string" || !/^\s*(https?:|mailto:)/i.test(value)) return null;
  try { return new URL(value.trim()).href; } catch { return null; }
};
const hexColor = (value) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null);
const fontFamily = (value) => (typeof value === "string" && /^[\w \-,'"]{1,80}$/.test(value) ? value : null);
const fontSize = (value) => (Number.isFinite(value) && value >= SIZE_RANGE.min && value <= SIZE_RANGE.max ? value : null);
// Sizes found in HTML: points, pixels (0.75 pt each), or em relative to the default size.
function pointsOf(css) {
  const match = /^([\d.]+)(pt|px|em|rem)$/.exec(String(css || "").trim());
  if (!match) return null;
  const n = Number(match[1]), unit = match[2];
  const pt = unit === "pt" ? n : unit === "px" ? n * 0.75 : n * DEFAULT_SIZE;
  return fontSize(Math.round(pt * 2) / 2);
}
const alignOf = (dom) => (ALIGNS.includes(dom.style?.textAlign) ? dom.style.textAlign : null);
const alignStyle = (align) => (align ? { style: `text-align: ${align}` } : {});

const nodes = basic.spec.nodes
  .remove("image")
  .update("paragraph", {
    content: "inline*", group: "block",
    attrs: { align: { default: null, validate: alignValue } },
    parseDOM: [{ tag: "p", getAttrs: (dom) => ({ align: alignOf(dom) }) }],
    toDOM: (node) => ["p", alignStyle(node.attrs.align), 0],
  })
  .update("heading", {
    content: "inline*", group: "block", defining: true,
    attrs: { level: { default: 1, validate: (v) => ([1, 2, 3].includes(v) ? v : fail("heading level")) }, align: { default: null, validate: alignValue } },
    // Levels 4–6 from other documents become level 3.
    parseDOM: [1, 2, 3, 4, 5, 6].map((n) => ({ tag: `h${n}`, getAttrs: (dom) => ({ level: Math.min(n, 3), align: alignOf(dom) }) })),
    toDOM: (node) => [`h${node.attrs.level}`, alignStyle(node.attrs.align), 0],
  });

const markSpecs = {
  link: {
    attrs: { href: { validate: (v) => (safeHref(v) === v ? v : fail("link")) } },
    inclusive: false,
    parseDOM: [{ tag: "a[href]", getAttrs: (dom) => { const href = safeHref(dom.getAttribute("href")); return href ? { href } : false; } }],
    toDOM: (mark) => ["a", { href: mark.attrs.href, rel: "noopener noreferrer" }, 0],
  },
  em: basicMarks.em,
  strong: basicMarks.strong,
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }, { style: "text-decoration-line=underline" }],
    toDOM: () => ["u", 0],
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }, { style: "text-decoration=line-through" }, { style: "text-decoration-line=line-through" }],
    toDOM: () => ["s", 0],
  },
  sub: { excludes: "sub sup", parseDOM: [{ tag: "sub" }, { style: "vertical-align=sub" }], toDOM: () => ["sub", 0] },
  sup: { excludes: "sub sup", parseDOM: [{ tag: "sup" }, { style: "vertical-align=super" }], toDOM: () => ["sup", 0] },
  code: basicMarks.code,
  font: {
    attrs: { family: { validate: (v) => (fontFamily(v) === v ? v : fail("font")) } },
    parseDOM: [{ style: "font-family", getAttrs: (value) => { const family = fontFamily(value.replace(/["']/g, "").split(",")[0].trim()); return family ? { family } : false; } }],
    toDOM: (mark) => ["span", { style: `font-family: ${mark.attrs.family}` }, 0],
  },
  size: {
    attrs: { size: { validate: (v) => (fontSize(v) === v ? v : fail("font size")) } },
    parseDOM: [{ style: "font-size", getAttrs: (value) => { const size = pointsOf(value); return size ? { size } : false; } }],
    toDOM: (mark) => ["span", { style: `font-size: ${mark.attrs.size}pt` }, 0],
  },
  color: {
    attrs: { color: { validate: (v) => (hexColor(v) === v ? v : fail("color")) } },
    parseDOM: [{ style: "color", getAttrs: (value) => { const color = cssColorToHex(value); return color ? { color } : false; } }],
    toDOM: (mark) => ["span", { style: `color: ${mark.attrs.color}` }, 0],
  },
};

// #rgb, #rrggbb, and rgb(r, g, b) as #rrggbb; anything else is not kept.
export function cssColorToHex(value) {
  const text = String(value || "").trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(text);
  return rgb ? `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}` : null;
}

export const schema = new Schema({
  nodes: addListNodes(nodes, "paragraph block*", "block"),
  marks: markSpecs,
});

export const emptyDoc = () => schema.node("doc", null, [schema.node("paragraph")]);

/** A document from its JSON (a file's content): every node, mark, and attribute is checked; throws on anything else. */
export function docFromJSON(json) {
  if (!json || typeof json !== "object" || json.type !== "doc") throw new RangeError("The document has no content.");
  const doc = schema.nodeFromJSON(json);
  doc.check();
  return doc;
}
