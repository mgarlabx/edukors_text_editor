# Edukors Text Editor

A text editor for Edukors, built on [Edukors Common](https://github.com/mgarlabx/edukors_common_ux), the shared base of the Edukors apps. Documents are `.etex` packages laid out like DOCX files, so they can be converted to and from Word.

**Status:** skeleton. The app runs with everything Common provides (window and title bar, toolbar, document tabs, Save, Open, Recent, Show in folder, Settings, Help, terms of use, the AI assistant, the macOS menu, update checks) and saves and opens empty `.etex` documents. The text editor itself comes next.

## Run

```sh
npm install                          # Edukors Common comes from GitHub (main); .npmrc allows that one git dependency
node node_modules/electron/install.js   # once, if npm skipped Electron's download (npm 12 blocks install scripts)
npm start                            # or: npx electron . [--shared | --data-dir <dir>] [--verbose]
npm test
```

Unpackaged, the AI accounts live in a development registry apart from the other Edukors apps, with a fake service for testing (`--shared` uses the real shared accounts; `--data-dir` another folder). To work on Common at the same time, link the sibling folder: `npm link ../edukors_common_ux`.

## What this app supplies

Everything else comes from Common (see its `docs/common-shell.md`, "App integration"):

| File | Role |
| --- | --- |
| `index.html` | loads `app-config.js`, then Common's `src/shell/boot.js` with this app's scripts |
| `app-config.js` | name, version (`v.YY.MM.DD`), terms version, `.etex`, help texts |
| `document.js` | `EdukorsAppDocument`: the `.etex` package (`text/document.json`, AI conversations), checked strictly when opened |
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
