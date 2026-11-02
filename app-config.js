// What makes this app the Text Editor inside the shared shell (Edukors Common, docs/common-shell.md "App integration").
globalThis.EdukorsAppConfig = {
  name: 'Edukors Text Editor',
  version: 'v.26.11.02',            // the release date; package.json holds the same date as 26.11.2
  // Version of the terms of use below. The app asks once per version; change it when the terms change.
  termsVersion: '2026-11-02',
  // Insert group of the main toolbar: tables, shapes (Common's catalog), and pictures.
  insert: ['table', 'shape', 'image'],
  // Documents are .etex packages (docs/document-package.md in Common). Export offers these formats in this order (the
  // first is preselected); import reads the same ones, and a PDF gives its text only. The desktop host accepts only the
  // extensions desktop/main.mjs lists.
  file: {
    extension: '.etex',
    exportFormats: ['html', 'pdf', 'md', 'txt', 'docx'],
    importFormats: [
      { id: 'docx', extensions: ['.docx'] },
      { id: 'html', extensions: ['.html', '.htm'] },
      { id: 'md', extensions: ['.md', '.markdown'] },
      { id: 'text', extensions: ['.txt'] },
      { id: 'pdf', extensions: ['.pdf'] }
    ]
  },
  help: {
    quickGuide: {
      en: `# Quick guide

**Placeholder.** The Edukors Text Editor is being built: documents can be created, saved, and opened, and the AI assistant is available; text editing comes next.`
    },
    termsOfUse: {
      en: `# Terms of use

**Placeholder text.** The Edukors Text Editor's terms of use will be written before its first public release.`
    }
  }
};
