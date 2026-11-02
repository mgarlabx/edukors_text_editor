// Conversions between the Text Editor's documents and other formats, for Export and Import.
//
//   Export: HTML (a self-contained page), PDF (that page printed on A4 by the host), Markdown, plain text, and DOCX.
//   Import: HTML, Markdown, plain text, DOCX (through mammoth), and PDF (the text only, through pdf.js).
//
// Everything imported goes through the document schema (src/editor/schema.js), so only what a document may contain
// is kept: scripts, styles, event attributes, unsafe links, and unknown elements are dropped. Images and tables are
// not part of documents yet: images are left out, and a table's cells become paragraphs.
import { DOMParser as SchemaParser, DOMSerializer } from "prosemirror-model";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown";
import MarkdownIt from "markdown-it";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth/mammoth.browser.js";
import { schema, docFromJSON, safeHref, DEFAULT_FONT, DEFAULT_SIZE } from "./schema.js";

const { nodes, marks } = schema;
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- HTML and PDF ----------
// The page's look, shared by the HTML export and the PDF (A4 with 2 cm margins).
const PAGE_CSS = `@page{size:A4;margin:20mm}
body{margin:0 auto;max-width:170mm;padding:0;font:${DEFAULT_SIZE}pt/1.5 ${DEFAULT_FONT},Helvetica,sans-serif;color:#000;background:#fff}
@media screen{body{padding:20mm}}
p{margin:0 0 8pt}h1{margin:18pt 0 8pt;font-size:24pt;line-height:1.2}h2{margin:16pt 0 6pt;font-size:18pt;line-height:1.25}h3{margin:14pt 0 4pt;font-size:14pt;line-height:1.3}
h1:first-child,h2:first-child,h3:first-child,p:first-child{margin-top:0}
blockquote{margin:0 0 8pt;padding:2pt 0 2pt 14pt;border-left:3pt solid #c9cdd8;color:#3c4252}
pre{margin:0 0 8pt;padding:8pt 10pt;border-radius:4px;background:#f3f4f7;font:10.5pt/1.45 "Courier New",monospace;white-space:pre-wrap}
code{padding:0 2pt;border-radius:3px;background:#f3f4f7;font-family:"Courier New",monospace;font-size:.92em}pre code{padding:0;background:none}
ul,ol{margin:0 0 8pt;padding-left:24pt}li>p{margin-bottom:2pt}a{color:#1155cc}hr{margin:12pt 0;border:0;border-top:1px solid #c9cdd8}
h1,h2,h3{break-after:avoid}li,blockquote,pre{break-inside:avoid}`;

function bodyHTML(doc) {
  const holder = document.createElement("div");
  holder.append(DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document }));
  return holder.innerHTML;
}
export const toHTML = (doc, title = "") =>
  `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body>${bodyHTML(doc)}</body></html>\n`;

// HTML from anywhere is parsed inert (nothing runs or loads) and read through the schema.
export function fromHTML(html) {
  const dom = new DOMParser().parseFromString(String(html), "text/html");
  return SchemaParser.fromSchema(schema).parse(dom.body);
}

// ---------- Markdown ----------
const markdownIt = MarkdownIt("commonmark", { html: false }).enable("strikethrough");
// Links Markdown allows but documents do not (relative paths, other schemes) keep their text without the link.
markdownIt.core.ruler.push("edukors_safe_links", (state) => {
  for (const block of state.tokens) {
    if (!block.children) continue;
    const dropped = [];
    block.children = block.children.filter((token) => {
      if (token.type === "link_open") { const keep = !!safeHref(token.attrGet("href") || ""); dropped.push(!keep); if (keep) token.attrSet("href", safeHref(token.attrGet("href"))); return keep; }
      if (token.type === "link_close") return !dropped.pop();
      return true;
    });
  }
});
const markdownParser = new MarkdownParser(schema, markdownIt, {
  ...defaultMarkdownParser.tokens,
  heading: { block: "heading", getAttrs: (token) => ({ level: Math.min(3, Number(token.tag.slice(1))) }) },
  code_block: { block: "code_block", noCloseToken: true },
  fence: { block: "code_block", noCloseToken: true },
  ordered_list: { block: "ordered_list", getAttrs: (token) => ({ order: Number(token.attrGet("start")) || 1 }) },
  bullet_list: { block: "bullet_list" },
  link: { mark: "link", getAttrs: (token) => ({ href: token.attrGet("href") }) },
  image: { ignore: true, noCloseToken: true },
  s: { mark: "strike" },
});
export const fromMarkdown = (text) => markdownParser.parse(String(text));

const plain = { open: "", close: "", mixable: true };
const markdownSerializer = new MarkdownSerializer(
  { ...defaultMarkdownSerializer.nodes },
  { ...defaultMarkdownSerializer.marks, strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    underline: plain, sub: plain, sup: plain, font: plain, size: plain, color: plain },
);
export const toMarkdown = (doc) => `${markdownSerializer.serialize(doc, { tightLists: true })}\n`;

// ---------- Plain text ----------
export function toText(doc) {
  const blocks = [];
  const lines = (node) => node.textBetween(0, node.content.size, "\n", "\n");
  const isList = (node) => node.type === nodes.bullet_list || node.type === nodes.ordered_list;
  // Items start with "• " or "1. "; a list inside an item is indented four more spaces.
  const list = (node, indent, quote) => {
    let n = node.attrs.order ?? 1;
    node.forEach((item) => {
      const marker = node.type === nodes.bullet_list ? "• " : `${n++}. `;
      item.forEach((part, _offset, index) => {
        if (isList(part)) list(part, `${indent}    `, quote);
        else blocks.push(`${quote}${indent}${index === 0 ? marker : "  "}${lines(part).replace(/\n/g, `\n${quote}${indent}  `)}`);
      });
    });
  };
  const walk = (node, indent = "", quote = "") => {
    node.forEach((child) => {
      if (isList(child)) list(child, indent, quote);
      else if (child.type === nodes.blockquote) walk(child, indent, `${quote}> `);
      else if (child.type === nodes.horizontal_rule) blocks.push(`${quote}${"—".repeat(12)}`);
      else blocks.push(`${quote}${indent}${lines(child).replace(/\n/g, `\n${quote}${indent}`)}`);
    });
  };
  walk(doc);
  return `${blocks.join("\n\n")}\n`;
}
// Paragraphs are separated by blank lines; a single line break stays a line break inside the paragraph.
export function fromText(text) {
  const paragraphs = String(text).replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map((part) => part.replace(/^\n+|\n+$/g, "")).filter(Boolean);
  const content = paragraphs.map((part) => {
    const inline = [];
    part.split("\n").forEach((line, index) => { if (index) inline.push(nodes.hard_break.create()); if (line) inline.push(schema.text(line)); });
    return nodes.paragraph.create(null, inline);
  });
  return nodes.doc.create(null, content.length ? content : [nodes.paragraph.create()]);
}

// ---------- DOCX ----------
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };

function runsOf(block) {
  const out = [];
  let link = null; // the hyperlink being filled: consecutive text with the same link mark
  block.forEach((child) => {
    let run;
    if (child.type === nodes.hard_break) run = new TextRun({ break: 1 });
    else if (child.isText) {
      const has = (type) => child.marks.find((mark) => mark.type === type);
      run = new TextRun({
        text: child.text, bold: !!has(marks.strong), italics: !!has(marks.em), strike: !!has(marks.strike),
        underline: has(marks.underline) ? {} : undefined, subScript: !!has(marks.sub), superScript: !!has(marks.sup),
        font: has(marks.code) ? "Courier New" : has(marks.font)?.attrs.family, size: has(marks.size) ? Math.round(has(marks.size).attrs.size * 2) : undefined,
        color: has(marks.color)?.attrs.color.slice(1).toUpperCase(),
        style: has(marks.link) ? "Hyperlink" : undefined, // Word's own link style (blue, underlined)
      });
      const href = has(marks.link)?.attrs.href;
      if (href) {
        if (!link || link.href !== href) { link = { href, children: [] }; out.push(link); }
        link.children.push(run);
        return;
      }
    }
    if (run) { link = null; out.push(run); }
  });
  return out.map((item) => (item instanceof TextRun ? item : new ExternalHyperlink({ link: item.href, children: item.children })));
}

function docxBlocks(doc) {
  const out = [];
  let listInstance = 0;
  const walk = (node, context) => {
    node.forEach((child) => {
      // Quotes and code use the paragraph styles "Quote" and "Code", which Word shows and the import reads back.
      const base = { alignment: ALIGN[child.attrs?.align], style: context.quote ? "Quote" : undefined };
      if (child.type === nodes.paragraph) out.push(new Paragraph({ ...base, children: runsOf(child), numbering: context.numbering?.() }));
      else if (child.type === nodes.heading) out.push(new Paragraph({ ...base, heading: HEADING[child.attrs.level], children: runsOf(child) }));
      else if (child.type === nodes.code_block) {
        child.textContent.split("\n").forEach((line) => out.push(new Paragraph({ ...base, style: "Code", children: [new TextRun(line)] })));
      } else if (child.type === nodes.horizontal_rule) out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9CDD8", space: 1 } } }));
      else if (child.type === nodes.blockquote) walk(child, { ...context, quote: true });
      else if (child.type === nodes.bullet_list || child.type === nodes.ordered_list) {
        const level = (context.level ?? -1) + 1, reference = child.type === nodes.bullet_list ? "bullets" : "numbers", instance = ++listInstance;
        child.forEach((item) => {
          let first = true;
          // The first paragraph of an item carries the bullet or number; the item's other paragraphs are indented only.
          walk(item, { ...context, level, numbering: () => { if (!first) return undefined; first = false; return { reference, level: Math.min(level, 8), instance }; } });
        });
      }
    });
  };
  walk(doc, {});
  return out;
}

const listLevels = (format, text) => Array.from({ length: 9 }, (_, level) => ({
  level, format, text: typeof text === "function" ? text(level) : text, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 567 * (level + 1), hanging: 283 } } },
}));

export async function toDOCX(doc, title = "") {
  const file = new Document({
    title, creator: "Edukors Text Editor",
    styles: {
      default: { document: { run: { font: DEFAULT_FONT, size: DEFAULT_SIZE * 2 }, paragraph: { spacing: { after: 160, line: 360 } } } },
      paragraphStyles: [
        ...[1, 2, 3].map((n) => ({
          id: `Heading${n}`, name: `Heading ${n}`, basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { bold: true, size: [0, 48, 36, 28][n], color: "000000" }, paragraph: { spacing: { before: [0, 360, 320, 280][n], after: 120 }, keepNext: true },
        })),
        { id: "Quote", name: "Quote", basedOn: "Normal", next: "Normal", quickFormat: true, run: { color: "3C4252" },
          paragraph: { indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: "C9CDD8", space: 8 } } } },
        { id: "Code", name: "Code", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Courier New", size: 21 },
          paragraph: { spacing: { after: 0, line: 276 }, shading: { fill: "F3F4F7" } } },
      ],
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: "1155CC", underline: {} } }],
    },
    numbering: { config: [
      { reference: "bullets", levels: listLevels(LevelFormat.BULLET, (level) => ["•", "◦", "▪"][level % 3]) },
      { reference: "numbers", levels: listLevels(LevelFormat.DECIMAL, (level) => `%${level + 1}.`) },
    ] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: docxBlocks(doc) }],
  });
  return new Uint8Array(await (await Packer.toBlob(file)).arrayBuffer());
}

// Word documents through mammoth, as HTML: headings, paragraphs, lists, bold, italic, underline, strikethrough, sub- and
// superscript, and links come through. Pictures are left out; colors, sizes, fonts, and alignment are not read.
export async function fromDOCX(bytes) {
  const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, {
    // Word's quote styles become quotes and the "Code" style a code block, so the app's own DOCX comes back whole.
    styleMap: ["u => u", "strike => s", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Intense Quote'] => blockquote > p:fresh", "p[style-name='Code'] => pre:separator('\\n')"],
    convertImage: mammoth.images.imgElement(() => ({ src: "" })),
  });
  return fromHTML(result.value);
}

// ---------- PDF (text only) ----------
// pdf.js is loaded only when a PDF is imported (dist/pdfjs/, copied there by tools/build.mjs). Lines that continue one
// another join into one paragraph; a larger gap between lines starts a new paragraph.
export async function fromPDF(bytes) {
  const base = new URL("dist/pdfjs/", document.baseURI).href;
  const pdfjs = await import(/* not bundled */ `${base}pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true });
  const pdf = await task.promise;
  const paragraphs = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      let current = "", lastY = null, lastHeight = 0;
      for (const item of items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform[5], height = Math.abs(item.transform[3]) || lastHeight || 10;
        if (lastY !== null && Math.abs(lastY - y) > Math.max(height, lastHeight) * 1.8 && current.trim()) { paragraphs.push(current.trim()); current = ""; }
        current += item.str + (item.hasEOL ? " " : "");
        lastY = y; lastHeight = height;
      }
      if (current.trim()) paragraphs.push(current.trim());
    }
  } finally { await task.destroy(); }
  return fromText(paragraphs.map((text) => text.replace(/\s+/g, " ")).join("\n\n"));
}

// ---------- Entry points ----------
/** Export: { html, width, height } for HTML and PDF (the host prints the PDF); { data } for the other formats. */
export async function exportDocument(json, format, title) {
  const doc = docFromJSON(json);
  if (format === "html" || format === "pdf") return { html: toHTML(doc, title), width: 794, height: 1123 };
  if (format === "md") return { data: toMarkdown(doc) };
  if (format === "txt") return { data: toText(doc) };
  if (format === "docx") return { data: await toDOCX(doc, title) };
  throw new Error(`Unknown export format "${format}".`);
}

/** Import: the document as JSON, checked against the schema like a file being opened. */
export async function importDocument(format, bytes) {
  const text = () => new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  const doc = format === "html" ? fromHTML(text())
    : format === "md" ? fromMarkdown(text())
    : format === "text" ? fromText(text())
    : format === "docx" ? await fromDOCX(bytes)
    : format === "pdf" ? await fromPDF(bytes)
    : null;
  if (!doc) throw new Error(`Unknown import format "${format}".`);
  const json = doc.childCount ? doc.toJSON() : nodes.doc.create(null, [nodes.paragraph.create()]).toJSON();
  return docFromJSON(json).toJSON();
}
