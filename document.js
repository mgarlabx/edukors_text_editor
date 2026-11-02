// The Text Editor's document: how it becomes a file and back (EdukorsAppDocument, used by Common's shell for Save, Open,
// and Recent). A document is an Edukors package (.etex) laid out like a DOCX (docs/document-package.md in Common):
//
//   text/document.json                          main part: { format: "edukors.text.document", version: 1, doc }
//   text/ai/conversations/<id>.json             the document's AI conversations
//
// `doc` is the editor's content as ProseMirror JSON (src/editor/schema.js); reading checks every node, mark, and
// attribute against that schema (EdukorsTextEditor.check).
globalThis.EdukorsTextDocument = (() => {
  const APP = 'text';
  const MAIN = `${APP}/document.json`;
  const FORMAT = 'edukors.text.document';
  const VERSION = 1;

  async function toBytes(doc, { name = '' } = {}) {
    const conversations = EdukorsAiConversations.toPackage(APP, EdukorsAiAssistant.conversationsOf(doc));
    const bytes = await EdukorsPackage.write({
      app: { name: APP, version: EdukorsAppConfig.version },
      main: { name: MAIN, contentType: EdukorsPackage.contentType(APP, 'document'), content: { format: FORMAT, version: VERSION, doc: EdukorsTextEditor.toJSON(doc) }, relationships: conversations.relationships },
      parts: conversations.parts,
      properties: { title: name || undefined }
    });
    return { bytes };
  }

  // A file is untrusted: check that it is a Text Editor document this version understands.
  async function fromBytes(bytes) {
    let pkg;
    try { pkg = await EdukorsPackage.read(bytes); } catch (error) { throw new Error(error?.message || 'This is not a valid document file.'); }
    if (pkg.main.name !== MAIN || pkg.main.contentType !== EdukorsPackage.contentType(APP, 'document')) throw new Error('This document belongs to another EDUKORS app.');
    const raw = pkg.json(MAIN);
    if (raw?.format !== FORMAT) throw new Error('This is not a Text Editor document.');
    if (!Number.isInteger(raw.version) || raw.version > VERSION) throw new Error('This document was made by a newer version of the app.');
    let text;
    try { text = EdukorsTextEditor.check(raw.doc); } catch (error) { throw new Error(`The document's content is damaged (${error.message})`); }
    return { text, conversations: EdukorsAiConversations.fromPackage(pkg) };
  }

  function adopt(doc, content) {
    EdukorsTextEditor.adopt(doc, content.text);
    EdukorsAiAssistant.restoreConversations(doc, content.conversations || []);
  }

  // Export: HTML, PDF, Markdown, plain text, DOCX. Import: the same formats except that a PDF gives its text only.
  const exportFile = ({ doc, format, title }) => EdukorsTextEditor.exportDocument(EdukorsTextEditor.toJSON(doc), format, title);
  async function importFile({ format, bytes }) {
    return { text: await EdukorsTextEditor.importDocument(format, bytes), conversations: [] };
  }

  globalThis.EdukorsAppDocument = Object.freeze({ toBytes, fromBytes, adopt, exportFile, importFile, selectAll: () => EdukorsTextEditor.selectAll() });
  return Object.freeze({ APP, MAIN, FORMAT, VERSION, toBytes, fromBytes });
})();
