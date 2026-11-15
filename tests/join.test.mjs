// Join lines (the selected lines become one paragraph) and the selection count, in both views. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { EditorSelection } from "@codemirror/state";
import { schema, docFromJSON } from "../src/editor/schema.js";
import { joinText, joinLines } from "../src/editor/join.js";
import { countText } from "../src/editor/stats.js";
import { newCodeState, joinCodeLines } from "../src/editor/code.js";

const run = (state, command) => { let next = state; command(state, (tr) => { next = state.apply(tr); }); return next; };
const text = (value, marks) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (...content) => ({ type: "paragraph", content });
const stateOf = (blocks) => EditorState.create({ schema, doc: docFromJSON({ type: "doc", content: blocks }), plugins: [history()] });
const selectAll = (state) => state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));

test("joinText: single spaces between the lines, empty lines dropped, the first line's indentation kept", () => {
  assert.equal(joinText("uma linha\n  outra linha  \n\n\nterceira"), "uma linha outra linha terceira");
  assert.equal(joinText("    SELECT *\n    FROM t\n    WHERE a = 1"), "    SELECT * FROM t WHERE a = 1");
  assert.equal(joinText("dentro  da linha\nfica"), "dentro  da linha fica");
});

test("formatted text: paragraphs and line breaks become one paragraph, formatting kept, one undo step", () => {
  const start = selectAll(stateOf([
    para(text("Primeira "), text("linha", [{ type: "strong" }])),
    para(text("  segunda"), { type: "hard_break" }, text("terceira  ")),
    { type: "paragraph" },
    para(text("quarta", [{ type: "em" }])),
  ]));
  const joined = run(start, joinLines);
  assert.equal(joined.doc.childCount, 1);
  assert.equal(joined.doc.firstChild.type.name, "paragraph");
  assert.equal(joined.doc.textContent, "Primeira linha segunda terceira quarta");
  const bold = [], italic = [];
  joined.doc.descendants((node) => { if (node.isText) { if (node.marks.some((m) => m.type.name === "strong")) bold.push(node.text); if (node.marks.some((m) => m.type.name === "em")) italic.push(node.text); } });
  assert.deepEqual(bold, ["linha"]);
  assert.deepEqual(italic, ["quarta"]);
  assert.equal(joined.selection.from, 1);
  assert.equal(joined.selection.to, joined.doc.content.size - 1);
  const undone = run(joined, undo);
  assert.ok(undone.doc.eq(start.doc));
});

test("formatted text: a heading keeps its kind; nothing to join with an empty selection or a single line", () => {
  const heading = selectAll(stateOf([{ type: "heading", attrs: { level: 2 }, content: [text("Título")] }, para(text("continua"))]));
  const joined = run(heading, joinLines);
  assert.equal(joined.doc.firstChild.type.name, "heading");
  assert.equal(joined.doc.textContent, "Título continua");
  const single = stateOf([para(text("só uma linha"))]);
  assert.equal(joinLines(single), false);
  assert.equal(joinLines(selectAll(single)), false);
  assert.equal(joinLines(selectAll(stateOf([para(text("a"), { type: "hard_break" }, text("b"))]))), true);
});

test("code view: the lines the selection touches become one line, in one change", () => {
  let state = newCodeState("keep\n  one\n\n  two  \nthree\nnext", ".txt");
  state = state.update({ selection: EditorSelection.single(7, 22) }).state; // from inside "one" to inside "three"
  const view = { state, dispatch(tr) { this.state = this.state.update(tr).state; } };
  assert.equal(joinCodeLines(view), true);
  assert.equal(view.state.doc.toString(), "keep\n  one two three\nnext");
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), "  one two three");
});

test("selection count: characters as people see them, without line breaks; words in any language", () => {
  assert.deepEqual(countText("Olá, mundo!"), { chars: 11, words: 2 });
  assert.deepEqual(countText("linha um\nlinha dois"), { chars: 18, words: 4 });
  assert.deepEqual(countText("👍🏽 ok  "), { chars: 6, words: 1 });
  assert.deepEqual(countText("SELECT nome_aluno FROM turmas;"), { chars: 30, words: 4 });
  assert.deepEqual(countText(""), { chars: 0, words: 0 });
});
