// Find and replace (src/editor/search.js) on a real editor state: matches, options, moving, replacing, undo.
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { schema } from "../src/editor/schema.js";
import { fromMarkdown, toMarkdown } from "../src/editor/convert.js";
import { searchPlugin, searchState, setSearch, goToMatch, replaceMatch, replaceAll, findMatches } from "../src/editor/search.js";

const start = (md) => EditorState.create({ schema, doc: fromMarkdown(md), plugins: [history(), searchPlugin()] });
// Runs a command and returns the new state.
const run = (state, command) => { let next = state; command(state, (tr) => { next = state.apply(tr); }); return next; };
const searched = (md, search) => run(start(md), setSearch(search));
const md = (state) => toMarkdown(state.doc).trim();
const texts = (state) => searchState(state).matches.map(({ from, to }) => state.doc.textBetween(from, to));

test("finds the text in every kind of block, ignoring case unless asked", () => {
  const state = searched("# Água\n\nA água ferve.\n\n- água fria\n\n> ÁGUA\n\n| a | b |\n| - | - |\n| água | x |\n", { query: "água" });
  assert.deepEqual(texts(state), ["Água", "água", "água", "ÁGUA", "água"]);
  assert.equal(texts(run(state, setSearch({ query: "água", caseSensitive: true }))).length, 3);
});

test("whole words, special characters taken literally, and no match across blocks or formatting breaks", () => {
  assert.deepEqual(texts(searched("cat category cat. scat", { query: "cat", wholeWord: true })), ["cat", "cat"]);
  assert.deepEqual(texts(searched("custa R$ 5.00 (ou 5x00)", { query: "5.00" })), ["5.00"]);
  assert.deepEqual(texts(searched("texto **forte** aqui", { query: "o forte a" })), ["o forte a"]);
  assert.equal(findMatches(start("fim\n\ninício").doc, { query: "fim início" }).length, 0);
  assert.equal(findMatches(start("nada").doc, { query: "" }).length, 0);
});

test("moving goes round the matches and selects the current one", () => {
  let state = searched("um dois um três um", { query: "um" });
  assert.equal(searchState(state).current, 0);
  state = run(state, goToMatch({ step: 1 }));
  assert.equal(searchState(state).current, 1);
  assert.equal(state.doc.textBetween(state.selection.from, state.selection.to), "um");
  state = run(run(state, goToMatch({ step: 1 })), goToMatch({ step: 1 }));
  assert.equal(searchState(state).current, 0);
  state = run(state, goToMatch({ step: -1 }));
  assert.equal(searchState(state).current, 2);
});

test("replace one keeps the formatting and moves on; editing finds the matches again", () => {
  let state = searched("**gato** e gato", { query: "gato" });
  state = run(state, replaceMatch("cão"));
  assert.equal(md(state), "**cão** e gato");
  assert.deepEqual(texts(state), ["gato"]);
  assert.equal(searchState(state).current, 0);
  state = run(state, replaceMatch(""));
  assert.equal(md(state), "**cão** e");
  assert.deepEqual(texts(state), []);
});

test("replace all is one undo step, also when the replacement contains the text", () => {
  let state = searched("a b a b a", { query: "a" });
  let count = 0;
  state = run(state, (s, dispatch) => { count = replaceAll(s, dispatch, "aa"); return true; });
  assert.equal(count, 3);
  assert.equal(md(state), "aa b aa b aa");
  state = run(state, undo);
  assert.equal(md(state), "a b a b a");
});

test("clearing the search removes the highlights; a document without a search is left alone", () => {
  let state = searched("x y x", { query: "x" });
  assert.equal(searchState(state).decorations.find().length, 2);
  state = run(state, setSearch(null));
  assert.equal(searchState(state).matches.length, 0);
  assert.equal(searchState(state).decorations.find().length, 0);
  assert.equal(replaceAll(state, null, "z"), 0);
});
