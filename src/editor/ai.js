// What the AI assistant can do to a document (assistant.js turns these into its tools). Each operation takes the
// editor state and returns { tr, result }; the editor applies tr as one undo step of the document the conversation
// belongs to. Blocks are the top-level items of the document (paragraph, heading, list, quote, code block, rule,
// picture, shape), numbered from 0 in reading order; read_document lists them.
import { closeHistory } from "prosemirror-history";
import { findWrapping } from "prosemirror-transform";
import { schema, docFromJSON, SHAPE_TYPES } from "./schema.js";
import { fromMarkdown, toMarkdown } from "./convert.js";
import { CONTENT_WIDTH } from "./media.js";

const { nodes, marks } = schema;
const fail = (message) => { throw new Error(message); };
const hex = (value) => (/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fail(`"${value}" is not a color: use #RRGGBB.`));

// ---------- Reading ----------
function describe(node) {
  if (node.type === nodes.image) return { type: "picture", description: node.attrs.alt, width: node.attrs.width, align: node.attrs.align };
  if (node.type === nodes.shape) { const { keepRatio, ...attrs } = node.attrs; return { type: "shape", ...attrs }; }
  const type = node.type === nodes.heading ? `heading${node.attrs.level}` : { paragraph: "paragraph", blockquote: "quote", code_block: "code", horizontal_rule: "rule", bullet_list: "bulleted list", ordered_list: "numbered list" }[node.type.name];
  const markdown = toMarkdown(nodes.doc.create(null, [node])).trim();
  return { type, ...(node.attrs.align ? { align: node.attrs.align } : {}), markdown };
}
/** The document as numbered blocks, with their Markdown (bold, italic, links, lists, headings) and alignment. */
export const readDocument = (state) => ({
  blocks: state.doc.content.content.map((node, index) => ({ index, ...describe(node) })),
  note: "Markdown shows structure, bold, italic, strikethrough, code, and links; underline, color, font, and size are not shown in it.",
});

// ---------- Positions ----------
function blockRange(doc, from, to = from) {
  const count = doc.childCount;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= count) fail(`Blocks go from 0 to ${count - 1}; got ${from}–${to}.`);
  let start = 0;
  for (let i = 0; i < from; i++) start += doc.child(i).nodeSize;
  let end = start;
  for (let i = from; i <= to; i++) end += doc.child(i).nodeSize;
  return { start, end };
}
// Where new blocks go: "start", "end", or after block n. An empty document's single empty paragraph is replaced.
function insertionPoint(doc, at = "end") {
  const empty = doc.childCount === 1 && doc.firstChild.type === nodes.paragraph && doc.firstChild.childCount === 0;
  if (empty) return { from: 0, to: doc.content.size };
  if (at === "start") return { from: 0, to: 0 };
  if (at === "end") return { from: doc.content.size, to: doc.content.size };
  const { end } = blockRange(doc, at);
  return { from: end, to: end };
}
const blocksFrom = (markdown) => {
  const content = fromMarkdown(String(markdown)).content;
  docFromJSON(nodes.doc.create(null, content.size ? content : [nodes.paragraph.create()]).toJSON());
  return content;
};
const finish = (tr, result) => ({ tr: closeHistory(tr).scrollIntoView(), result });

// Every occurrence of `text` inside text blocks (within blocks `from`–`to` when given), as document positions.
function findText(doc, text, scope) {
  if (typeof text !== "string" || !text) fail('"text" must not be empty.');
  const found = [];
  const limits = scope ? blockRange(doc, scope.from, scope.to) : { start: 0, end: doc.content.size };
  doc.nodesBetween(limits.start, limits.end, (node, pos) => {
    if (!node.isTextblock) return true;
    // Positions of each character of the block's text (hard breaks count as one position and no character).
    const chars = [], offsets = [];
    node.forEach((child, offset) => {
      if (child.isText) for (let i = 0; i < child.text.length; i++) { chars.push(child.text[i]); offsets.push(pos + 1 + offset + i); }
      else { chars.push("\n"); offsets.push(pos + 1 + offset); }
    });
    const content = chars.join("");
    for (let i = content.indexOf(text); i !== -1; i = content.indexOf(text, i + text.length)) found.push({ from: offsets[i], to: offsets[i + text.length - 1] + 1 });
    return false;
  });
  return found;
}
function pick(found, occurrence = "all", text) {
  if (!found.length) fail(`"${text}" was not found. Use read_document to see the exact text.`);
  if (occurrence === "all") return found;
  if (occurrence === "first") return [found[0]];
  if (Number.isInteger(occurrence) && occurrence >= 1 && occurrence <= found.length) return [found[occurrence - 1]];
  return fail(`"occurrence" must be "all", "first", or a number from 1 to ${found.length}.`);
}

// ---------- Changes ----------
export function insertContent(state, { markdown, at }) {
  const content = blocksFrom(markdown), { from, to } = insertionPoint(state.doc, at);
  return finish(state.tr.replaceWith(from, to, content), `Inserted ${content.childCount} block(s).`);
}

export function replaceBlocks(state, { from, to = from, markdown = "" }) {
  const { start, end } = blockRange(state.doc, from, to);
  const content = markdown.trim() ? blocksFrom(markdown) : null;
  const tr = content ? state.tr.replaceWith(start, end, content) : state.tr.delete(start, end);
  if (!tr.doc.childCount) tr.insert(0, nodes.paragraph.create());
  return finish(tr, content ? `Replaced blocks ${from}–${to}.` : `Deleted blocks ${from}–${to}.`);
}

const STYLES = ["paragraph", "heading1", "heading2", "heading3", "quote", "code"];
export function setBlockStyle(state, { from, to = from, style, align }) {
  if (style === undefined && align === undefined) fail('Give "style", "align", or both.');
  if (style !== undefined && !STYLES.includes(style)) fail(`"style" must be one of: ${STYLES.join(", ")}.`);
  const tr = state.tr;
  let { start, end } = blockRange(tr.doc, from, to);
  if (style !== undefined && style !== "quote") {
    // Quotes in the range give up their wrapping first, so a quoted paragraph can become a heading.
    const quotes = [];
    tr.doc.nodesBetween(start, end, (node, pos) => { if (node.type === nodes.blockquote) { quotes.push({ node, pos }); return false; } return true; });
    const before = tr.mapping.maps.length;
    for (const { node, pos } of quotes.reverse()) tr.replaceWith(pos, pos + node.nodeSize, node.content);
    ({ start, end } = { start: tr.mapping.slice(before).map(start, -1), end: tr.mapping.slice(before).map(end, 1) });
    const heading = /^heading([1-3])$/.exec(style);
    const type = style === "code" ? nodes.code_block : heading ? nodes.heading : nodes.paragraph;
    const steps = tr.mapping.maps.length;
    tr.setBlockType(start, end, type, heading ? { level: Number(heading[1]) } : null);
    ({ start, end } = { start: tr.mapping.slice(steps).map(start, -1), end: tr.mapping.slice(steps).map(end, 1) });
  } else if (style === "quote") {
    const range = tr.doc.resolve(start + 1).blockRange(tr.doc.resolve(end - 1)), wrapping = range && findWrapping(range, nodes.blockquote);
    if (wrapping) { const steps = tr.mapping.maps.length; tr.wrap(range, wrapping); ({ start, end } = { start: tr.mapping.slice(steps).map(start, -1), end: tr.mapping.slice(steps).map(end, 1) }); }
  }
  if (align !== undefined) {
    if (!["left", "center", "right", "justify"].includes(align)) fail('"align" must be left, center, right, or justify.');
    tr.doc.nodesBetween(start, end, (node, pos) => {
      if (node.type === nodes.paragraph || node.type === nodes.heading) tr.setNodeMarkup(pos, null, { ...node.attrs, align: align === "left" ? null : align });
      else if (node.type === nodes.image || node.type === nodes.shape) tr.setNodeMarkup(pos, null, { ...node.attrs, align: align === "justify" ? "center" : align });
      return true;
    });
  }
  return finish(tr, "Done.");
}

// Formatting of found text: each given property is applied (true/value) or removed (false/""/null).
export function formatText(state, { text, occurrence, from, to, bold, italic, underline, strike, code, color, fontSize, fontFamily, link, clear }) {
  const scope = from !== undefined ? { from, to: to ?? from } : null;
  const ranges = text !== undefined ? pick(findText(state.doc, text, scope), occurrence, text)
    : scope ? [(({ start, end }) => ({ from: start, to: end }))(blockRange(state.doc, scope.from, scope.to))] : fail('Give "text" (and optionally blocks "from"–"to"), or blocks alone.');
  const tr = state.tr;
  const toggles = { bold: marks.strong, italic: marks.em, underline: marks.underline, strike: marks.strike, code: marks.code };
  const given = { bold, italic, underline, strike, code };
  for (const range of ranges) {
    if (clear) for (const type of [marks.strong, marks.em, marks.underline, marks.strike, marks.code, marks.sub, marks.sup, marks.color, marks.size, marks.font]) tr.removeMark(range.from, range.to, type);
    for (const [key, type] of Object.entries(toggles)) {
      if (given[key] === true) tr.addMark(range.from, range.to, type.create());
      if (given[key] === false) tr.removeMark(range.from, range.to, type);
    }
    if (color !== undefined) { tr.removeMark(range.from, range.to, marks.color); if (color) tr.addMark(range.from, range.to, marks.color.create({ color: hex(color) })); }
    if (fontSize !== undefined) {
      tr.removeMark(range.from, range.to, marks.size);
      if (fontSize) { if (!(fontSize >= 1 && fontSize <= 400)) fail('"fontSize" is in points, from 1 to 400.'); tr.addMark(range.from, range.to, marks.size.create({ size: Math.round(fontSize * 2) / 2 })); }
    }
    if (fontFamily !== undefined) { tr.removeMark(range.from, range.to, marks.font); if (fontFamily) tr.addMark(range.from, range.to, marks.font.create({ family: fontFamily })); }
    if (link !== undefined) {
      tr.removeMark(range.from, range.to, marks.link);
      if (link) { const href = (() => { try { return new URL(/^[a-z]+:/i.test(link) ? link : `https://${link}`).href; } catch { return ""; } })(); if (!/^(https?|mailto):/.test(href)) fail('"link" must be an http, https, or mailto address.'); tr.addMark(range.from, range.to, marks.link.create({ href })); }
    }
  }
  docFromJSON(tr.doc.toJSON());
  return finish(tr, `Formatted ${ranges.length} place(s).`);
}

export function replaceText(state, { find, replace, occurrence, from, to }) {
  const scope = from !== undefined ? { from, to: to ?? from } : null;
  const ranges = pick(findText(state.doc, find, scope), occurrence, find);
  const tr = state.tr;
  // From the end, so earlier positions stay valid. The new text keeps the formatting of the text it replaces.
  for (const range of [...ranges].reverse()) {
    const marksHere = state.doc.resolve(range.from + 1).marks();
    if (replace) tr.replaceWith(range.from, range.to, schema.text(replace, marksHere)); else tr.delete(range.from, range.to);
  }
  return finish(tr, `Replaced ${ranges.length} place(s).`);
}

function insertBlockAt(state, node, at) {
  const { from, to } = insertionPoint(state.doc, at);
  docFromJSON(nodes.doc.create(null, [node]).toJSON());
  return finish(state.tr.replaceWith(from, to, node), "Inserted.");
}

export function insertShape(state, { shapeType, at, width, height, align = "center", ...style }) {
  if (!SHAPE_TYPES.includes(shapeType)) fail(`"shapeType" must be one of: ${SHAPE_TYPES.join(", ")}.`);
  const square = !/^(rect|rounded|arrow)$/.test(shapeType);
  const attrs = { shapeType, width: Math.min(width ?? (square ? 140 : 220), CONTENT_WIDTH), height: height ?? (square ? 140 : 130), align, ...style };
  if (attrs.fill && attrs.fill !== "transparent") attrs.fill = hex(attrs.fill);
  if (attrs.lineColor && attrs.lineColor !== "transparent") attrs.lineColor = hex(attrs.lineColor);
  return insertBlockAt(state, nodes.shape.create(attrs), at);
}

export function insertImage(state, { key, at, width, align = "center", alt = "" }) {
  return insertBlockAt(state, nodes.image.create({ src: key, alt: String(alt).slice(0, 500), width: width ? Math.min(Math.max(width, 8), CONTENT_WIDTH) : null, align }), at);
}
