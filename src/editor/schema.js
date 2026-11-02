// The Text Editor's document model (ProseMirror schema): what a document may contain. Every attribute is validated, so
// content read from a file or pasted from elsewhere can hold only these values.
//
// Blocks: paragraph and heading (levels 1–3), both with an optional alignment; blockquote; code block; horizontal rule;
// bulleted and numbered lists; image and shape (between paragraphs, aligned left, center, or right). Inline: text and
// hard breaks. Marks: bold, italic, underline, strikethrough, subscript or superscript, inline code, link (http, https,
// mailto), font family, font size (points), and color. Tables come later.
//
// Pictures live in `media` (a key per picture, its Blob, and an object URL to show it); a document names them by key.
// The file keeps them as package parts (document.js).
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
// ---------- Pictures ----------
const store = new Map(); // key → { blob, url }
let counter = 0;
const PICTURE_TYPES = /^image\/(png|jpeg|gif|webp|bmp|svg\+xml|avif)$/;
export const MAX_PICTURE = 50 * 2 ** 20;
export const media = {
  /** Keeps a picture and returns its key. */
  put(blob) {
    if (!PICTURE_TYPES.test(blob?.type || "") || blob.size > MAX_PICTURE) return null;
    const key = `m${(++counter).toString(36)}${Date.now().toString(36)}`;
    store.set(key, { blob, url: URL.createObjectURL(blob) });
    return key;
  },
  get: (key) => store.get(key),
  url: (key) => store.get(key)?.url || "",
  /** The key for a picture found in HTML: one of ours (its object URL) or a data: URL; other addresses are not fetched. */
  fromURL(src) {
    const text = String(src || "").trim();
    if (text.startsWith("blob:")) { for (const [key, entry] of store) if (entry.url === text) return key; return null; }
    const match = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(text);
    if (!match || match[2].length > MAX_PICTURE * 1.4) return null;
    try {
      const binary = atob(match[2].replace(/\s/g, "")), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return this.put(new Blob([bytes], { type: match[1].toLowerCase() }));
    } catch { return null; }
  },
};

// The shape catalog of Common (src/shapes/shapes.js), repeated so the model also loads without the page.
export const SHAPE_TYPES = ["rect", "rounded", "ellipse", "triangle", "rightTriangle", "diamond", "pentagon", "hexagon", "arrow", "star"];
const BLOCK_ALIGNS = ["left", "center", "right"];
const sizeValue = (value, what) => (Number.isFinite(value) && value >= 8 && value <= 2000 ? value : fail(what));
const colorOrNone = (value) => (value === "transparent" || hexColor(value) === value ? value : fail("color"));
const SHAPE_ATTRS = {
  shapeType: { default: "rect", validate: (v) => (SHAPE_TYPES.includes(v) ? v : fail("shape")) },
  width: { default: 200, validate: (v) => sizeValue(v, "width") },
  height: { default: 120, validate: (v) => sizeValue(v, "height") },
  fill: { default: "#e9e7fb", validate: colorOrNone },
  lineColor: { default: "#6156db", validate: colorOrNone },
  lineWidth: { default: 2, validate: (v) => (Number.isFinite(v) && v >= 0 && v <= 50 ? v : fail("line width")) },
  lineStyle: { default: "solid", validate: (v) => (["solid", "dashed", "dotted"].includes(v) ? v : fail("line style")) },
  opacity: { default: 100, validate: (v) => (Number.isFinite(v) && v >= 0 && v <= 100 ? v : fail("opacity")) },
  shadow: { default: false, validate: "boolean" },
  keepRatio: { default: true, validate: "boolean" },
  align: { default: "center", validate: (v) => (BLOCK_ALIGNS.includes(v) ? v : fail("alignment")) },
};
// A shape's attributes from HTML (our own export keeps them as JSON): each one kept only if valid.
function shapeAttrs(raw) {
  const attrs = {};
  for (const [name, spec] of Object.entries(SHAPE_ATTRS)) {
    try { if (raw?.[name] !== undefined) attrs[name] = typeof spec.validate === "function" ? spec.validate(raw[name]) : typeof raw[name] === "boolean" ? raw[name] : fail(name); } catch { /* the default stays */ }
  }
  return attrs;
}
const figureAlign = (dom) => { const a = dom.getAttribute("data-align") || dom.closest?.("figure")?.getAttribute("data-align"); return BLOCK_ALIGNS.includes(a) ? a : "center"; };

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
  })
  .addToEnd("image", {
    group: "block", atom: true, draggable: true,
    attrs: {
      src: { validate: (v) => (/^m[a-z0-9]{1,30}$/.test(v) ? v : fail("picture")) },
      alt: { default: "", validate: (v) => (typeof v === "string" && v.length <= 500 ? v : fail("description")) },
      width: { default: null, validate: (v) => (v === null ? v : sizeValue(v, "width")) }, // pixels; null = the picture's own width
      align: SHAPE_ATTRS.align,
    },
    parseDOM: [{ tag: "img[src]", getAttrs: (dom) => {
      const src = media.fromURL(dom.getAttribute("src"));
      if (!src) return false;
      const width = parseFloat(dom.getAttribute("width") || dom.style.width);
      return { src, alt: (dom.getAttribute("alt") || "").slice(0, 500), width: width >= 8 ? Math.min(width, 2000) : null, align: figureAlign(dom) };
    } }],
    toDOM: (node) => ["figure", { class: "doc-image", "data-align": node.attrs.align, style: `text-align: ${node.attrs.align}` },
      ["img", { src: media.url(node.attrs.src), "data-media": node.attrs.src, alt: node.attrs.alt, ...(node.attrs.width ? { width: String(node.attrs.width) } : {}) }]],
  })
  .addToEnd("shape", {
    group: "block", atom: true, draggable: true,
    attrs: SHAPE_ATTRS,
    parseDOM: [{ tag: "figure[data-edukors-shape]", getAttrs: (dom) => {
      try { return { ...shapeAttrs(JSON.parse(dom.getAttribute("data-edukors-shape"))), align: figureAlign(dom) }; } catch { return false; }
    } }],
    // The SVG comes from Common's shape catalog (EdukorsShapes.svg), drawn at the shape's size.
    toDOM: (node) => {
      const figure = document.createElement("figure");
      figure.className = "doc-shape";
      figure.dataset.align = node.attrs.align;
      figure.style.textAlign = node.attrs.align;
      const { align, ...style } = node.attrs;
      figure.dataset.edukorsShape = JSON.stringify(style);
      figure.innerHTML = globalThis.EdukorsShapes?.svg(style, node.attrs.width, node.attrs.height) ?? "";
      return figure;
    },
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
