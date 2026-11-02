// The Text Editor's document: how it becomes a file and back (EdukorsAppDocument, used by Common's shell for Save, Open,
// and Recent). A document is an Edukors package (.etex) laid out like a DOCX (docs/document-package.md in Common):
//
//   text/document.json                          main part: { format: "edukors.text.document", version: 1, blocks }
//   text/ai/conversations/<id>.json             the document's AI conversations
//
// The editor is not built yet: a document is an empty list of blocks, and the page shows an empty sheet.
globalThis.EdukorsTextDocument = (() => {
  const APP = 'text';
  const MAIN = `${APP}/document.json`;
  const FORMAT = 'edukors.text.document';
  const VERSION = 1;
  const empty = () => ({ format: FORMAT, version: VERSION, blocks: [] });

  async function toBytes(doc, { name = '' } = {}) {
    const conversations = EdukorsAiConversations.toPackage(APP, EdukorsAiAssistant.conversationsOf(doc));
    const bytes = await EdukorsPackage.write({
      app: { name: APP, version: EdukorsAppConfig.version },
      main: { name: MAIN, contentType: EdukorsPackage.contentType(APP, 'document'), content: doc.text || empty(), relationships: conversations.relationships },
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
    // No block kind exists yet, so nothing from `blocks` is kept; the editor will check each block it knows.
    return { text: empty(), conversations: EdukorsAiConversations.fromPackage(pkg) };
  }

  function adopt(doc, content) {
    doc.text = content.text;
    EdukorsAiAssistant.restoreConversations(doc, content.conversations || []);
  }

  globalThis.EdukorsAppDocument = Object.freeze({ toBytes, fromBytes, adopt });
  return Object.freeze({ APP, MAIN, FORMAT, VERSION, empty, toBytes, fromBytes });
})();
