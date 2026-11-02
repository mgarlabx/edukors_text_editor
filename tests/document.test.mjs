// The .etex file: what Save writes, Open reads back, and what Open refuses. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import "edukors-common-ux/src/package/package.js";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";
import { docFromJSON, emptyDoc } from "../src/editor/schema.js";

// The page's globals the document script uses, without a browser (the editor's model, not its view).
globalThis.EdukorsAppConfig = { version: "v.26.11.02" };
globalThis.EdukorsAiAssistant = { conversationsOf: () => [], restoreConversations: (doc, list) => { doc.restored = list; } };
globalThis.EdukorsTextEditor = {
  toJSON: (doc) => doc.text ?? emptyDoc().toJSON(),
  check: (json) => docFromJSON(json).toJSON(),
  adopt: (doc, json) => { doc.text = json; },
};
await import("../document.js");
const D = globalThis.EdukorsAppDocument, P = globalThis.EdukorsPackage;
const sample = { type: "doc", content: [
  { type: "heading", attrs: { level: 1, align: "center" }, content: [{ type: "text", text: "Fotossíntese" }] },
  { type: "paragraph", attrs: { align: null }, content: [{ type: "text", text: "luz", marks: [{ type: "strong" }, { type: "color", attrs: { color: "#c00000" } }] }] },
] };
const main = (doc) => P.write({ app: { name: "text" }, main: { name: "text/document.json", contentType: P.contentType("text", "document"), content: { format: "edukors.text.document", version: 1, doc } } });

test("save and open keep the content, in a package laid out like a DOCX", async () => {
  const { bytes } = await D.toBytes({ id: 1, text: sample }, { name: "Aula" });
  const pkg = await P.read(bytes);
  assert.equal(pkg.main.name, "text/document.json");
  assert.equal(pkg.main.contentType, "application/vnd.edukors.text.document+json");
  assert.equal(pkg.json("text/document.json").format, "edukors.text.document");
  assert.equal(pkg.properties.title, "Aula");
  const doc = { id: 2 };
  D.adopt(doc, await D.fromBytes(bytes));
  assert.deepEqual(doc.text, docFromJSON(sample).toJSON());
  assert.deepEqual(doc.restored, []);
});

test("open refuses other files and damaged content", async () => {
  await assert.rejects(D.fromBytes(new Uint8Array([1, 2, 3])));
  const other = await P.write({ app: { name: "common" }, main: { name: "common/document.json", contentType: P.contentType("common", "document"), content: {} } });
  await assert.rejects(D.fromBytes(other), /another EDUKORS app/);
  const newer = await P.write({ app: { name: "text" }, main: { name: "text/document.json", contentType: P.contentType("text", "document"), content: { format: "edukors.text.document", version: 99 } } });
  await assert.rejects(D.fromBytes(newer), /newer version/);
  const link = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
  await assert.rejects(D.fromBytes(await main(link)), /damaged/);
  await assert.rejects(D.fromBytes(await main({ type: "doc", content: [{ type: "script" }] })), /damaged/);
  await assert.rejects(D.fromBytes(await main(undefined)), /damaged/);
});
