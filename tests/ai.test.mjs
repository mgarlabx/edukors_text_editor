// The AI assistant's operations on a document (src/editor/ai.js), on a real editor state.
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo, undoDepth } from "prosemirror-history";
import { schema, docFromJSON } from "../src/editor/schema.js";
import { fromMarkdown, toMarkdown } from "../src/editor/convert.js";
import * as ai from "../src/editor/ai.js";

const start = (md) => EditorState.create({ schema, doc: fromMarkdown(md), plugins: [history()] });
const apply = (state, op, args) => { const { tr, result } = ai[op](state, args); return { state: state.apply(tr), result }; };
const md = (state) => toMarkdown(state.doc).trim();

test("read_document numbers the blocks and shows their Markdown", () => {
  const { blocks } = ai.readDocument(start("# Título\n\nTexto **forte**.\n\n- a\n- b\n"));
  assert.deepEqual(blocks.map((b) => [b.index, b.type]), [[0, "heading1"], [1, "paragraph"], [2, "bulleted list"]]);
  assert.equal(blocks[1].markdown, "Texto **forte**.");
});

test("insert, replace, and delete blocks; an empty document is filled, not appended to", () => {
  let { state } = apply(EditorState.create({ schema, plugins: [history()] }), "insertContent", { markdown: "# Fotossíntese\n\nAs plantas usam luz." });
  assert.equal(md(state), "# Fotossíntese\n\nAs plantas usam luz.");
  ({ state } = apply(state, "insertContent", { markdown: "Primeiro.", at: "start" }));
  ({ state } = apply(state, "insertContent", { markdown: "Depois do título.", at: 1 }));
  assert.equal(md(state), "Primeiro.\n\n# Fotossíntese\n\nDepois do título.\n\nAs plantas usam luz.");
  ({ state } = apply(state, "replaceBlocks", { from: 2, to: 3, markdown: "- um\n- dois" }));
  ({ state } = apply(state, "replaceBlocks", { from: 0, markdown: "" }));
  assert.equal(md(state), "# Fotossíntese\n\n* um\n* dois");
  assert.throws(() => apply(state, "replaceBlocks", { from: 5 }), /Blocks go from 0 to 1/);
});

test("block styles and alignment, out of and into quotes", () => {
  let { state } = apply(start("> citado\n\nnormal\n\ntítulo"), "setBlockStyle", { from: 0, style: "heading2" });
  ({ state } = apply(state, "setBlockStyle", { from: 1, style: "quote" }));
  ({ state } = apply(state, "setBlockStyle", { from: 2, style: "code", align: "center" }));
  ({ state } = apply(state, "setBlockStyle", { from: 0, align: "center" }));
  assert.equal(md(state), "## citado\n\n> normal\n\n```\ntítulo\n```");
  assert.equal(state.doc.child(0).attrs.align, "center");
  assert.throws(() => apply(state, "setBlockStyle", { from: 0, style: "heading9" }), /style/);
});

test("format_text: every occurrence, one occurrence, whole blocks, removal, and invalid values", () => {
  let { state, result } = apply(start("luz e luz\n\noutra luz"), "formatText", { text: "luz", bold: true, color: "#C00000", fontSize: 14 });
  assert.equal(result, "Formatted 3 place(s).");
  assert.equal(md(state), "**luz** e **luz**\n\noutra **luz**");
  ({ state } = apply(state, "formatText", { text: "luz", occurrence: 2, bold: false }));
  assert.equal(md(state), "**luz** e luz\n\noutra **luz**");
  ({ state } = apply(state, "formatText", { from: 1, italic: true, link: "edukors.org" }));
  assert.equal(md(state), "**luz** e luz\n\n[*outra **luz***](https://edukors.org/)");
  const colored = []; state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === "color")) colored.push(n.text); });
  assert.deepEqual(colored, ["luz", "luz", "luz"]);
  assert.throws(() => apply(state, "formatText", { text: "sombra", bold: true }), /not found/);
  assert.throws(() => apply(state, "formatText", { text: "luz", color: "red" }), /color/);
  assert.throws(() => apply(state, "formatText", { text: "luz", link: "javascript:alert(1)" }), /http/);
});

test("replace_text keeps the formatting; each change is its own undo step", () => {
  let { state } = apply(start("A **planta** cresce. A planta vive."), "replaceText", { find: "planta", replace: "árvore" });
  assert.equal(md(state), "A **árvore** cresce. A árvore vive.");
  ({ state } = apply(state, "replaceText", { find: "A ", replace: "", occurrence: "first" }));
  assert.equal(md(state), "**árvore** cresce. A árvore vive.");
  assert.equal(undoDepth(state), 2);
  undo(state, (tr) => { state = state.apply(tr); });
  assert.equal(md(state), "A **árvore** cresce. A árvore vive.");
});

test("shapes and pictures are inserted as checked blocks", () => {
  let { state } = apply(start("texto"), "insertShape", { shapeType: "star", fill: "#FF0000", at: "start", align: "right" });
  assert.equal(state.doc.firstChild.type.name, "shape");
  assert.deepEqual([state.doc.firstChild.attrs.fill, state.doc.firstChild.attrs.align], ["#ff0000", "right"]);
  assert.throws(() => apply(state, "insertShape", { shapeType: "evil" }), /shapeType/);
  assert.throws(() => apply(state, "insertShape", { shapeType: "rect", fill: "url(x)" }), /color/);
  ({ state } = apply(state, "insertImage", { key: "mabc", width: 9999, alt: "foto" }));
  assert.deepEqual([state.doc.lastChild.type.name, state.doc.lastChild.attrs.width], ["image", 642]);
  assert.throws(() => apply(state, "insertImage", { key: "../x" }), /picture/i);
  docFromJSON(state.doc.toJSON());
});

test("the assistant writes and reads tables in Markdown", () => {
  const { state } = apply(start("Texto."), "insertContent", { markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |" });
  const { blocks } = ai.readDocument(state);
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "table"]);
  assert.equal(blocks[1].markdown, "| A | B |\n| --- | --- |\n| 1 | 2 |");
  const { state: bold } = apply(state, "formatText", { text: "2", bold: true });
  assert.match(ai.readDocument(bold).blocks[1].markdown, /\| 1 \| \*\*2\*\* \|/);
});
