// What a document may contain (src/editor/schema.js), and how HTML from elsewhere is read into it.
import test from "node:test";
import assert from "node:assert/strict";
import { docFromJSON, emptyDoc, safeHref, cssColorToHex } from "../src/editor/schema.js";

const para = (marks) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks }] }] });
const refused = (json) => assert.throws(() => docFromJSON(json));

test("valid content is kept", () => {
  const json = { type: "doc", content: [
    { type: "heading", attrs: { level: 3, align: "justify" }, content: [{ type: "text", text: "T" }] },
    { type: "bullet_list", content: [{ type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "mailto:a@b.org" } }, { type: "size", attrs: { size: 14.5 } }, { type: "font", attrs: { family: "Georgia" } }] }] }] }] },
    { type: "blockquote", content: [{ type: "paragraph" }] }, { type: "code_block", content: [{ type: "text", text: "x = 1" }] }, { type: "horizontal_rule" },
  ] };
  assert.equal(docFromJSON(json).childCount, 5);
  assert.equal(emptyDoc().childCount, 1);
});

test("hostile or invalid content is refused", () => {
  refused(para([{ type: "link", attrs: { href: "javascript:alert(1)" } }]));
  refused(para([{ type: "color", attrs: { color: "red; background: url(x)" } }]));
  refused(para([{ type: "font", attrs: { family: "x</style><script>" } }]));
  refused(para([{ type: "size", attrs: { size: 0 } }]));
  refused({ type: "doc", content: [{ type: "heading", attrs: { level: 4 } }] });
  refused({ type: "doc", content: [{ type: "paragraph", attrs: { align: "middle" } }] });
  refused({ type: "doc", content: [{ type: "image", attrs: { src: "x" } }] });
  refused({ type: "doc", content: [{ type: "text", text: "loose" }] });
  refused(null);
});

test("links and colors from elsewhere are normalized", () => {
  assert.equal(safeHref("https://edukors.org"), "https://edukors.org/");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("file:///etc/hosts"), null);
  assert.equal(cssColorToHex("rgb(255, 0, 10)"), "#ff000a");
  assert.equal(cssColorToHex("#ABC"), "#aabbcc");
  assert.equal(cssColorToHex("red"), null);
});
