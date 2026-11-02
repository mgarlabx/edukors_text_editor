// Conversions that need no browser: Markdown, plain text, and DOCX (written by the app, read back by mammoth).
// HTML, PDF, and reading DOCX into a document use the page's DOM and are checked in the app.
import test from "node:test";
import assert from "node:assert/strict";
import mammoth from "mammoth";
import { schema, docFromJSON } from "../src/editor/schema.js";
import { fromMarkdown, toMarkdown, fromText, toText, toDOCX, exportDocument } from "../src/editor/convert.js";

const sample = docFromJSON({ type: "doc", content: [
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Fotossíntese" }] },
  { type: "paragraph", content: [{ type: "text", text: "As plantas usam " }, { type: "text", text: "luz", marks: [{ type: "strong" }] }, { type: "text", text: " e " }, { type: "text", text: "água", marks: [{ type: "em" }, { type: "link", attrs: { href: "https://edukors.org/" } }] }, { type: "text", text: "." }] },
  { type: "bullet_list", content: ["clorofila", "estômatos"].map((text) => ({ type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
  { type: "ordered_list", attrs: { order: 1 }, content: ["luz", "água"].map((text) => ({ type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
  { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Citação", marks: [{ type: "strike" }] }] }] },
  { type: "code_block", content: [{ type: "text", text: "6CO2 + 6H2O" }] },
] });

test("Markdown out and back keeps the structure", () => {
  const md = toMarkdown(sample);
  assert.match(md, /^# Fotossíntese/m);
  assert.match(md, /\*\*luz\*\*/);
  assert.match(md, /\[\*água\*\]\(https:\/\/edukors\.org\/\)/);
  assert.match(md, /^\* clorofila\n\* estômatos$/m);
  assert.match(md, /^1\. luz/m);
  assert.match(md, /^> ~~Citação~~/m);
  assert.ok(fromMarkdown(md).eq(sample), "round trip");
});

test("Markdown from elsewhere: deep headings, images, raw HTML, and unsafe links", () => {
  const doc = fromMarkdown("#### Deep\n\n![x](a.png) <b>raw</b> [bad](javascript:alert(1)) [rel](page.html) [ok](https://a.org)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
  assert.equal(doc.firstChild.attrs.level, 3);
  const json = JSON.stringify(doc.toJSON());
  // Unsafe or relative links lose the link (markdown-it leaves "javascript:" ones as visible text); images are left out.
  assert.doesNotMatch(json, /"href":"(javascript|page\.html)|"image"/);
  assert.deepEqual(doc.toJSON().content[1].content.filter((n) => n.marks).map((n) => n.marks[0].attrs.href), ["https://a.org/"]);
  assert.match(json, /https:\/\/a\.org/);
  assert.match(doc.textContent, /<b>raw<\/b>/);
  docFromJSON(doc.toJSON());
});

test("plain text out and back", () => {
  const text = toText(sample);
  assert.match(text, /^Fotossíntese\n\nAs plantas usam luz e água\.\n\n• clorofila\n\n• estômatos\n\n1\. luz\n\n2\. água\n\n> Citação\n\n6CO2 \+ 6H2O\n$/);
  const back = fromText("Linha 1\nLinha 2\n\n\nOutro parágrafo\r\n");
  assert.equal(back.childCount, 2);
  assert.equal(back.firstChild.childCount, 3); // text, hard break, text
  assert.equal(fromText("").childCount, 1);
});

test("DOCX: Word-readable, with headings, emphasis, links, and lists", async () => {
  const bytes = await toDOCX(sample, "Aula");
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b]); // a ZIP (OPC) package
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, { styleMap: ["strike => s", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Code'] => pre:separator('\\n')"] });
  assert.match(html, /<blockquote><p><s>Citação<\/s><\/p><\/blockquote>/);
  assert.match(html, /<pre>6CO2 \+ 6H2O<\/pre>/);
  assert.match(html, /<h1>Fotossíntese<\/h1>/);
  assert.match(html, /<strong>luz<\/strong>/);
  assert.match(html, /<a href="https:\/\/edukors\.org\/">/);
  assert.match(html, /<ul><li>clorofila<\/li><li>estômatos<\/li><\/ul>/);
  assert.match(html, /<ol><li>luz<\/li><li>água<\/li><\/ol>/);
  assert.deepEqual(Object.keys(await exportDocument(sample.toJSON(), "docx", "Aula")), ["data"]);
});
