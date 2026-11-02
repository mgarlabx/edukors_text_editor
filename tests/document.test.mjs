// The .etex file: what Save writes, Open reads back, and what Open refuses. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import "edukors-common-ux/src/package/package.js";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";

// The page's globals the document script uses, without a browser.
globalThis.EdukorsAppConfig = { version: "v.26.11.02" };
globalThis.EdukorsAiAssistant = { conversationsOf: () => [], restoreConversations: (doc, list) => { doc.restored = list; } };
await import("../document.js");
const D = globalThis.EdukorsAppDocument, P = globalThis.EdukorsPackage;

test("save and open: an .etex package laid out like a DOCX", async () => {
  const { bytes } = await D.toBytes({ id: 1 }, { name: "Lesson" });
  const pkg = await P.read(bytes);
  assert.equal(pkg.main.name, "text/document.json");
  assert.equal(pkg.main.contentType, "application/vnd.edukors.text.document+json");
  assert.deepEqual(pkg.json("text/document.json"), { format: "edukors.text.document", version: 1, blocks: [] });
  assert.equal(pkg.properties.title, "Lesson");
  assert.deepEqual(pkg.app, { name: "Edukors text", version: "v.26.11.02" });
  const doc = { id: 2 };
  D.adopt(doc, await D.fromBytes(bytes));
  assert.deepEqual(doc.text, { format: "edukors.text.document", version: 1, blocks: [] });
  assert.deepEqual(doc.restored, []);
});

test("open refuses other files", async () => {
  await assert.rejects(D.fromBytes(new Uint8Array([1, 2, 3])));
  const other = await P.write({ app: { name: "common" }, main: { name: "common/document.json", contentType: P.contentType("common", "document"), content: {} } });
  await assert.rejects(D.fromBytes(other), /another EDUKORS app/);
  const newer = await P.write({ app: { name: "text" }, main: { name: "text/document.json", contentType: P.contentType("text", "document"), content: { format: "edukors.text.document", version: 99 } } });
  await assert.rejects(D.fromBytes(newer), /newer version/);
});
