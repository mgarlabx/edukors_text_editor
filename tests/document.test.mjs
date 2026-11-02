// The .etex file: what Save writes, Open reads back, and what Open refuses. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import "edukors-common-ux/src/package/package.js";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";
import { docFromJSON, emptyDoc, media } from "../src/editor/schema.js";

// The page's globals the document script uses, without a browser (the editor's model, not its view).
globalThis.EdukorsAppConfig = { version: "v.26.11.02" };
globalThis.EdukorsAiAssistant = { conversationsOf: () => [], restoreConversations: (doc, list) => { doc.restored = list; } };
globalThis.EdukorsTextEditor = {
  toJSON: (doc) => doc.text ?? emptyDoc().toJSON(),
  check: (json) => docFromJSON(json).toJSON(),
  adopt: (doc, json) => { doc.text = json; },
  media,
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

test("pictures are saved as package parts and read back; a part that is not a picture is left out", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
  const key = media.put(new Blob([png], { type: "image/png" }));
  const text = { type: "doc", content: [
    { type: "image", attrs: { src: key, alt: "Folha", width: 320, align: "left" } },
    { type: "image", attrs: { src: key, alt: "", width: null, align: "center" } },
    { type: "shape", attrs: { shapeType: "star", width: 120, height: 120 } },
    { type: "paragraph" },
  ] };
  const { bytes } = await D.toBytes({ id: 3, text });
  const pkg = await P.read(bytes);
  assert.deepEqual(pkg.parts.filter((p) => p.name.startsWith("text/media/")).map((p) => p.name), ["text/media/image1.png"]); // one part for one picture
  assert.deepEqual(pkg.json("text/document.json").doc.content.slice(0, 2).map((n) => n.attrs.src), ["rIdImg1", "rIdImg1"]);
  const doc = { id: 4 };
  D.adopt(doc, await D.fromBytes(bytes));
  const [a, b, shape] = doc.text.content;
  assert.equal(a.attrs.src, b.attrs.src);
  assert.notEqual(a.attrs.src, key);
  assert.deepEqual(new Uint8Array(await media.get(a.attrs.src).blob.arrayBuffer()), png);
  assert.deepEqual([a.attrs.alt, a.attrs.width, a.attrs.align, shape.attrs.shapeType], ["Folha", 320, "left", "star"]);

  // A relationship to a part that is not a picture, and one to nothing: those pictures are left out.
  const hostile = await P.write({ app: { name: "text" }, main: { name: "text/document.json", contentType: P.contentType("text", "document"),
    content: { format: "edukors.text.document", version: 1, doc: { type: "doc", content: [{ type: "image", attrs: { src: "rIdImg1" } }, { type: "image", attrs: { src: "rIdNope" } }, { type: "paragraph" }] } },
    relationships: [{ id: "rIdImg1", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", target: "media/page.html" }] },
    parts: [{ name: "text/media/page.html", contentType: "text/html", content: "<script>alert(1)</script>" }] });
  const opened = await D.fromBytes(hostile);
  assert.deepEqual(opened.text.content.map((n) => n.type), ["paragraph"]);
});
