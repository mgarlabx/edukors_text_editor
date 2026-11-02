# Edukors Text Editor

A text editor for Edukors, built on [Edukors Common](https://github.com/mgarlabx/edukors_common_ux), the shared base of the Edukors apps. Documents are `.etex` packages laid out like DOCX files, so they can be converted to and from Word.

**Status:** the editor works. A document is a continuous page the width of an A4 sheet; page breaks appear in PDF and DOCX.

- **Editing** (ProseMirror): paragraphs, headings 1–3, quotes, code blocks, bulleted and numbered lists (Tab and Shift+Tab change the level), horizontal rules (from imported documents), bold, italic, underline, strikethrough, subscript and superscript, inline code, links, font, size (points), color, and alignment. The formatting bar is Common's (`blockStyle`, `text`, `align`, `lists`, `link`). Markdown-style shortcuts while typing: `# ` to `### `, `- `, `1. `, `> `, ```` ``` ````. Undo and redo per document; the Edit buttons (Undo, Redo, Cut, Copy, Paste, Delete) and the macOS menu act on the editor; pasting from other programs keeps what a document can hold.
- **Save and Open** `.etex` (Common's package, laid out like DOCX), Recent, and the unsaved-changes dot.
- **Export:** HTML (a self-contained page), PDF (A4, 2 cm margins), Markdown, plain text, DOCX (Word's heading, quote, code, and link styles; lists numbered as in Word).
- **Import:** DOCX (headings, paragraphs, lists, bold, italic, underline, strikethrough, sub- and superscript, links, quotes and code written with the "Quote" and "Code" styles), HTML, Markdown, plain text, and PDF (the text only, in paragraphs). Imported content is read through the document schema: scripts, styles, event attributes, unsafe or relative links, and unknown elements are dropped. Not imported yet: images (left out), tables (their cells become paragraphs), and, from DOCX, colors, sizes, fonts, and alignment.
- Not built yet: images, tables, AI editing tools, spelling options, page setup.

## Run

```sh
npm install                          # Edukors Common comes from GitHub (main); .npmrc allows that one git dependency
node node_modules/electron/install.js   # once, if npm skipped Electron's download (npm 12 blocks install scripts)
npm start                            # builds dist/ (tools/build.mjs), then opens the app; or: npm run build && npx electron . [--shared | --data-dir <dir>]
npm test                             # builds, then runs tests/ (schema, file, Markdown, text, DOCX)
```

Unpackaged, the AI accounts live in a development registry apart from the other Edukors apps, with a fake service for testing (`--shared` uses the real shared accounts; `--data-dir` another folder). To work on Common at the same time, link the sibling folder: `npm link ../edukors_common_ux`.

## What this app supplies

Everything else comes from Common (see its `docs/common-shell.md`, "App integration"):

| File | Role |
| --- | --- |
| `index.html` | loads `app-config.js`, then Common's `src/shell/boot.js` with this app's scripts |
| `app-config.js` | name, version (`v.YY.MM.DD`), terms version, `.etex`, export and import formats, help texts |
| `src/editor/` | the editor, bundled by esbuild into `dist/editor.js` and `dist/editor.css` (`tools/build.mjs`): `schema.js` (what a document may contain, every attribute validated), `index.js` (the editing surface, formatting bar, Edit buttons), `convert.js` (export and import), `editor.css` (the page) |
| `document.js` | `EdukorsAppDocument`: the `.etex` package (`text/document.json` with the editor's content, AI conversations), checked strictly when opened; export and import through the editor |
| `assistant.js` | what the AI assistant may do (no editing tools yet) |
| `desktop/main.mjs` | `startDesktopApp` from Common with this app's id, name, and extension |
| `electron-builder.yml`, `build/` | installers, icon (`build/icon.svg`; `npm run icons` renders the PNGs), macOS entitlements |

## Releases

Versions are release dates: `package.json` 26.11.2 is `v.26.11.02` in `app-config.js`; keep both the same.

1. Set the version in `package.json` and `app-config.js`, commit, and push.
2. `git tag v26.11.2 && git push origin v26.11.2`.
3. `.github/workflows/release.yml` installs the **latest Edukors Common** (its `main`), runs the tests, builds a DMG (macOS, universal, signed and notarized), an AppImage (Linux), and an MSIX (Windows, kept as a workflow artifact for the Microsoft Store), and publishes the DMG and AppImage in a GitHub release. The app checks that repository's releases for updates (`"edukors": { "updates": … }` in `package.json`).

Signing secrets, in the repository's `release` environment: `MAC_CERT_P12` (base64 Developer ID Application certificate), `MAC_CERT_PASSWORD`, `APPLE_API_KEY` (base64 `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. Without them, macOS builds are signed ad hoc. The MSIX identity in `electron-builder.yml` is a placeholder until the app is reserved in Partner Center.

`npm run package` builds this system's installer locally into `release/`.

## License

MIT
