// What makes this app the Text Editor inside the shared shell (Edukors Common, docs/common-shell.md "App integration").
globalThis.EdukorsAppConfig = {
  name: 'Edukors Text Editor',
  version: 'v.26.11.02',            // the release date; package.json holds the same date as 26.11.2
  // Version of the terms of use below. The app asks once per version; change it when the terms change.
  termsVersion: '2026-11-02',
  // Documents are .etex packages (docs/document-package.md in Common). Export and import come with the editor.
  file: { extension: '.etex', exportFormats: [], importFormats: [] },
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
