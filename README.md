# Edukors Text Editor

A text editor for Edukors, built on [Edukors Common](https://github.com/mgarlabx/edukors_common_ux), the shared base of the Edukors apps. Documents are `.etex` packages laid out like DOCX files, so they can be converted to and from Word.

**Status:** the editor works. A document is a continuous page with the measures of the PDF's A4 page (20 mm margins); dashed marks with the page number show where each PDF page ends (the switch at the end of the formatting bar hides them; the choice is kept on the computer). A mark can be one line early: the PDF moves a line that does not fit to the next page.

- **Editing** (ProseMirror): paragraphs, headings 1–3, quotes, code blocks, bulleted and numbered lists (Tab and Shift+Tab change the level), horizontal rules (from imported documents), bold, italic, underline, strikethrough, subscript and superscript, inline code, links, font, size (points), color, and alignment. The formatting bar is Common's (`blockStyle`, `text`, `align`, `lists`, `link`). Links: with the cursor in a link, a bubble shows its address (click it to open); Cmd+click (Ctrl+click on Windows and Linux) opens a link at once, in the system's browser. Markdown-style shortcuts while typing: `# ` to `### `, `- `, `1. `, `> `, ```` ``` ````. Undo and redo per document; the Edit buttons (Undo, Redo, Cut, Copy, Paste, Delete) and the macOS menu act on the editor; pasting from other programs keeps what a document can hold.
- **Shapes and pictures** (Insert group of the main toolbar): a shape from Common's ten (`EdukorsShapes`), or a picture file (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF; up to 50 MB). Both are blocks between paragraphs, aligned left, center, or right; selected, they show a resize handle (pictures keep their proportions; shapes when Keep proportions is on), and the bar shows alignment and, for shapes, line width, style, and color, fill, shadow, keep proportions, and opacity.
- **Save and Open** `.etex` (Common's package, laid out like DOCX), Recent, and the unsaved-changes dot.
- **Export:** HTML (a self-contained page, pictures inline, shapes as SVG), PDF (A4, 2 cm margins), Markdown, plain text (both without pictures and shapes), DOCX (Word's heading, quote, code, and link styles; lists numbered as in Word; pictures, and shapes drawn as pictures).
- **Import:** DOCX (headings, paragraphs, lists, bold, italic, underline, strikethrough, sub- and superscript, links, quotes and code written with the "Quote" and "Code" styles, pictures), HTML (with pictures inside the file as data: URLs, and this app's shapes), Markdown, plain text, and PDF (the text only, in paragraphs). Imported content is read through the document schema: scripts, styles, event attributes, unsafe or relative links, and unknown elements are dropped. Not imported: pictures on the web (not fetched), tables (their cells become paragraphs), and, from DOCX, colors, sizes, fonts, and alignment (pictures come centered).
- **AI assistant** (`assistant.js`, operations in `src/editor/ai.js`): reads the document as numbered blocks with their Markdown, and changes it with tools: `insert_content` and `replace_blocks` (Markdown), `set_block_style` (paragraph, headings, quote, code; alignment), `format_text` (bold, italic, underline, strikethrough, code, color, size, font, link on exact text or whole blocks), `replace_text`, `insert_shape`, `insert_image` (a file in the document's folder or an attachment, a web address, or SVG). Each change is one undo step of the conversation's document and, in Review mode, waits for approval.
- Not built yet: tables, text inside shapes, text wrapping around pictures, spelling options, page setup.

## Run

```sh
npm install                          # Edukors Common comes from GitHub (main); .npmrc allows that one git dependency
node node_modules/electron/install.js   # once, if npm skipped Electron's download (npm 12 blocks install scripts)
npm start                            # builds dist/ (tools/build.mjs), then opens the app; or: npm run build && npx electron . [--shared | --data-dir <dir>]
npm test                             # builds, then runs tests/ (schema, file, Markdown, text, DOCX, AI operations)
```

Unpackaged, the AI accounts live in a development registry apart from the other Edukors apps, with a fake service for testing (`--shared` uses the real shared accounts; `--data-dir` another folder). To work on Common at the same time, link the sibling folder: `npm link ../edukors_common_ux`.

## What this app supplies

Everything else comes from Common (see its `docs/common-shell.md`, "App integration"):

| File | Role |
| --- | --- |
| `index.html` | loads `app-config.js`, then Common's `src/shell/boot.js` with this app's scripts |
| `app-config.js` | name, version (`v.YY.MM.DD`), terms version, `.etex`, export and import formats, help texts |
| `src/editor/` | the editor, bundled by esbuild into `dist/editor.js` and `dist/editor.css` (`tools/build.mjs`): `schema.js` (what a document may contain, every attribute validated), `index.js` (the editing surface, formatting bar, Edit and Insert buttons), `media.js` (pictures and shapes on the page), `pages.js` (page-break marks), `ai.js` (the assistant's operations), `convert.js` (export and import), `editor.css` (the page) |
| `document.js` | `EdukorsAppDocument`: the `.etex` package (`text/document.json` with the editor's content, pictures in `text/media/`, AI conversations), checked strictly when opened; export and import through the editor |
| `assistant.js` | the AI assistant's instructions and tools (their argument types; `src/editor/ai.js` does the changes) |
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
