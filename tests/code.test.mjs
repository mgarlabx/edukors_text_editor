// Plain-text files in the code view: bytes to text and back, the extensions that open as code, languages, folding,
// line wrapping, and joining lines. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { foldable, ensureSyntaxTree } from "@codemirror/language";
import { CODE_EXTENSIONS, decodeText, encodeText } from "../src/editor/code-text.js";
import { newCodeState, wraps, setWrap, selectedText } from "../src/editor/code.js";

const bytes = (...parts) => Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...new TextEncoder().encode(part)] : part)));
const roundTrip = (input) => { const read = decodeText(input); return { read, back: encodeText(read.text, read) }; };

test("a file opened and saved unchanged keeps its bytes: line endings, byte order mark, blank lines, no final newline", () => {
  for (const input of [
    bytes("def f():\n\n\n    return 1\n"),
    bytes("a,b\r\n1,2\r\n\r\n"),
    bytes([0xef, 0xbb, 0xbf], "{\"a\": 1}"),
    bytes("\n\nfirst line after two empty ones"),
    bytes(""),
    bytes("acentuação ✓ 😀\n"),
  ]) {
    const { read, back } = roundTrip(input);
    assert.deepEqual(back, input);
    assert.ok(!read.text.includes("\r"));
  }
  assert.equal(decodeText(bytes("a\r\nb\r\nc\n")).eol, "\r\n");
  assert.equal(decodeText(bytes("a\nb\r\nc\n")).eol, "\n");
});

test("other encodings: UTF-16 with a byte order mark, and Windows-1252 when the file is not UTF-8", () => {
  const le = bytes([0xff, 0xfe, 0x41, 0x00, 0xe7, 0x00, 0x0a, 0x00]);
  assert.deepEqual(decodeText(le), { text: "Aç\n", eol: "\n", bom: true, encoding: "utf-16le" });
  assert.deepEqual(roundTrip(le).back, le);
  const be = bytes([0xfe, 0xff, 0x00, 0x41, 0x00, 0x0a]);
  assert.equal(decodeText(be).encoding, "utf-16be");
  assert.deepEqual(roundTrip(be).back, be);
  const latin = bytes("Jos", [0xe9], ";S", [0xe3], "o Paulo;", [0x80], "10\r\n");
  const read = decodeText(latin);
  assert.equal(read.encoding, "windows-1252");
  assert.equal(read.text, "José;São Paulo;€10\n");
  assert.deepEqual(encodeText(read.text, read), latin);
  // A character Windows-1252 cannot hold makes the file UTF-8, so nothing typed is lost.
  assert.equal(new TextDecoder().decode(encodeText("José 😀", read)), "José 😀");
});

test("the extensions that open as code are the same in app-config.js, desktop/main.mjs, and code-text.js", async () => {
  const config = await readFile(new URL("../app-config.js", import.meta.url), "utf8");
  const main = await readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8");
  const list = (source, pattern) => [...pattern.exec(source)[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(list(config, /id: 'code', extensions: \[([^\]]*)\]/), CODE_EXTENSIONS);
  assert.deepEqual(list(main, /const CODE_EXTENSIONS = \[([^\]]*)\]/), CODE_EXTENSIONS);
  assert.match(config, /saveOriginal: \{ md: 'md', code: 'code' \}/);
  for (const ext of [".py", ".sql", ".js", ".html", ".css", ".ts", ".txt", ".json", ".csv"]) assert.ok(CODE_EXTENSIONS.includes(ext), ext);
});

test("blocks fold by language: JSON objects, functions, HTML elements, Python bodies; plain text by indentation", () => {
  const firstLineFold = (text, ext) => {
    const state = newCodeState(text, ext);
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line = state.doc.line(1);
    const range = foldable(state, line.from, line.to);
    return range && state.sliceDoc(range.from, range.to);
  };
  assert.equal(firstLineFold('{\n  "a": [1, 2],\n  "b": 2\n}', ".json"), '\n  "a": [1, 2],\n  "b": 2\n');
  assert.equal(firstLineFold("function f() {\n  return 1;\n}", ".js"), "\n  return 1;\n");
  assert.equal(firstLineFold("const f = (x: number) => {\n  return x;\n};", ".ts"), "\n  return x;\n");
  assert.ok(firstLineFold("<div>\n  <p>x</p>\n</div>", ".html").includes("<p>x</p>"));
  assert.ok(firstLineFold("def f(x):\n    y = 1\n    return y\n\nprint(1)", ".py").includes("return y"));
  assert.equal(firstLineFold("Title\n  item a\n  item b\nEnd", ".txt"), "\n  item a\n  item b");
  assert.equal(firstLineFold("a,b\n1,2", ".csv"), null);
});

test("line wrapping is part of each file's state and can be turned off and on", () => {
  let state = newCodeState("x", ".py", { wrap: true });
  assert.equal(wraps(state), true);
  state = state.update({ effects: setWrap(false) }).state;
  assert.equal(wraps(state), false);
  assert.equal(wraps(newCodeState("x", ".py", { wrap: false })), false);
});

test("the selected text of every selection, for the footer's count", () => {
  const state = newCodeState("alpha beta\ngamma", ".txt");
  const selected = state.update({ selection: { anchor: 6, head: 13 } }).state;
  assert.equal(selectedText(selected), "beta\nga");
  assert.equal(selectedText(state), "");
});
