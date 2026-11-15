// The Text Editor's document: how it becomes a file and back (EdukorsAppDocument, used by Common's shell for Save, Open,
// and Recent). A document is an Edukors package (.etex) laid out like a DOCX (docs/document-package.md in Common):
//
//   text/document.json                          main part: { format: "edukors.text.document", version: 1, doc }
//   text/media/image1.png, …                    pictures, each reached by a relationship from the main part (as in DOCX)
//   text/ai/conversations/<id>.json             the document's AI conversations
//
// `doc` is the editor's content as ProseMirror JSON (src/editor/schema.js); reading checks every node, mark, and
// attribute against that schema (EdukorsTextEditor.check). In the file, a picture's `src` is its relationship id; in
// the editor, the key of the picture in EdukorsTextEditor.media.
//
// A plain-text file (code, data, notes) opens as it is and is saved back into its file (format "code"). Saved as an
// .etex (or kept as a draft), it is one code block, and the main part also has `code`: { ext, eol, bom, encoding },
// so it opens in the code view again.
globalThis.EdukorsTextDocument = (() => {
  const APP = 'text';
  const MAIN = `${APP}/document.json`;
  const FORMAT = 'edukors.text.document';
  const VERSION = 1;
  const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif' };
  const MAX_PICTURE = 50 * 2 ** 20;

  // Calls fn on every node of a JSON document; fn returns false to drop the node.
  function walk(node, fn) {
    if (Array.isArray(node.content)) node.content = node.content.filter(child => fn(child) !== false && (walk(child, fn), true));
    return node;
  }

  async function toBytes(doc, { name = '' } = {}) {
    const conversations = EdukorsAiConversations.toPackage(APP, EdukorsAiAssistant.conversationsOf(doc));
    // Each distinct picture becomes one part; the document names it by relationship id.
    const json = structuredClone(EdukorsTextEditor.toJSON(doc)), ids = new Map(), parts = [], relationships = [];
    const code = EdukorsTextEditor.codeInfo?.(doc) || null;
    const pictures = [];
    walk(json, node => {
      if (node.type !== 'image') return true;
      const entry = EdukorsTextEditor.media.get(node.attrs.src);
      if (!entry) return false; // a picture that is no longer there is left out
      if (!ids.has(node.attrs.src)) {
        const id = `rIdImg${ids.size + 1}`, file = `media/image${ids.size + 1}.${EXTENSION[entry.blob.type] || 'img'}`;
        ids.set(node.attrs.src, id);
        pictures.push({ id, file, blob: entry.blob });
      }
      node.attrs.src = ids.get(node.attrs.src);
      return true;
    });
    for (const { id, file, blob } of pictures) {
      parts.push({ name: `${APP}/${file}`, contentType: blob.type, content: new Uint8Array(await blob.arrayBuffer()) });
      relationships.push({ id, type: REL_IMAGE, target: file });
    }
    const bytes = await EdukorsPackage.write({
      app: { name: APP, version: EdukorsAppConfig.version },
      main: { name: MAIN, contentType: EdukorsPackage.contentType(APP, 'document'), content: { format: FORMAT, version: VERSION, doc: json, ...(code ? { code } : {}) }, relationships: [...relationships, ...conversations.relationships] },
      parts: [...parts, ...conversations.parts],
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
    // Pictures: only image parts reached from the main part, at most 50 MB each, become pictures in the editor.
    const keys = new Map();
    for (const rel of pkg.relationships(MAIN)) {
      if (rel.type !== REL_IMAGE || rel.external) continue;
      const part = pkg.parts.find(item => item.name === rel.target), data = pkg.bytes(rel.target);
      if (!part?.contentType.startsWith('image/') || data.length > MAX_PICTURE) continue;
      const key = EdukorsTextEditor.media.put(new Blob([data], { type: part.contentType }));
      if (key) keys.set(rel.id, key);
    }
    let text;
    try {
      if (!raw.doc || typeof raw.doc !== 'object') throw new Error('no content');
      // A picture whose part is missing or not a picture is left out.
      walk(raw.doc, node => node?.type !== 'image' || (keys.has(node.attrs?.src) && ((node.attrs.src = keys.get(node.attrs.src)), true)));
      text = EdukorsTextEditor.check(raw.doc);
    } catch (error) { throw new Error(`The document's content is damaged (${error.message})`); }
    const conversations = EdukorsAiConversations.fromPackage(pkg);
    const code = codeOf(raw.code, text);
    return code ? { code, conversations } : { text, conversations };
  }

  // A code file kept in a package: its settings, checked, and the text of its code block; null for anything else.
  const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'];
  function codeOf(info, json) {
    if (!info || typeof info !== 'object') return null;
    const { ext, eol, bom, encoding } = info;
    if (typeof ext !== 'string' || !/^\.[a-z0-9]{1,10}$/i.test(ext) || !['\n', '\r\n'].includes(eol) || typeof bom !== 'boolean' || !ENCODINGS.includes(encoding)) return null;
    const blocks = json.content || [];
    if (blocks.length !== 1 || blocks[0].type !== 'code_block') return null;
    return { text: (blocks[0].content || []).map(node => node.text || '').join(''), ext: ext.toLowerCase(), eol, bom, encoding };
  }

  function adopt(doc, content) {
    if (content.code) EdukorsTextEditor.adoptCode(doc, content.code);
    else EdukorsTextEditor.adopt(doc, content.text, { markdown: content.markdown });
    EdukorsAiAssistant.restoreConversations(doc, content.conversations || []);
  }

  // Export: PDF (A4), Markdown, and plain text; Print uses the same page as the PDF. Open also reads DOCX and PDF (text only). A Markdown file keeps its exact text, so it can be edited as source and saved as written.
  // A plain-text file (format "code") opens in the code view and is saved back with the same encoding and line ending.
  const exportFile = ({ doc, format, title }) => EdukorsTextEditor.exportFor(doc, format, title);
  async function importFile({ format, bytes, extension }) {
    if (format === 'code') {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return { code: { ...EdukorsTextEditor.decodeCode(data), ext: String(extension || '.txt').toLowerCase(), bytes: data }, conversations: [] };
    }
    const markdown = format === 'md' ? new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '') : undefined;
    return { text: await EdukorsTextEditor.importDocument(format, bytes), conversations: [], markdown };
  }

  globalThis.EdukorsAppDocument = Object.freeze({ toBytes, fromBytes, adopt, exportFile, importFile, selectAll: () => EdukorsTextEditor.selectAll() });
  return Object.freeze({ APP, MAIN, FORMAT, VERSION, toBytes, fromBytes });
})();
