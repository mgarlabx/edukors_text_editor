# Distribution: signing, notarization, installers and the Microsoft Store

The Text Editor is distributed as the Slides and Graph Editors are (see their `docs/distribution.md` and workflows):
installers built by [electron-builder](https://www.electron.build) (`electron-builder.yml`) on GitHub Actions when a
version tag is pushed (`.github/workflows/release.yml`); locally, `npm run package` builds this system's installers
into `release/`.

| System | Installers | Signed by |
| --- | --- | --- |
| macOS (universal) | `.dmg` and `.zip` | Developer ID, notarized by Apple |
| Windows 10/11 (x64) | NSIS `-setup.exe`, per user; MSIX (`.appx`) for the Store | the Store signs the MSIX; the `.exe` is unsigned |
| Linux (x64) | AppImage and `.deb` | (nothing to sign) |

Identities: bundle identifier `org.edukors.text` (macOS), MSIX identity `mgarlabx.EdukorsTextEditor` with application
id `EdukorsTextEditor` (Store), `.deb` package `edukors-text-editor`. File association: `.etex`
(`application/vnd.edukors.text+zip`).

## macOS

The Apple Developer account is the same as the other editors' (individual, **Mauricio Garcia**, Team ID
`GRVGLXMK3S`): certificate *Developer ID Application: Mauricio Garcia (GRVGLXMK3S)*, valid until 2027-11-12, and the
App Store Connect API key (Key ID `A9CQQ9PA49`). The `.p12` and the `.p8` are in the password manager.

electron-builder signs the app with the hardened runtime and `build/entitlements.mac.plist`, and notarizes it when
`APPLE_API_KEY` (the `.p8`'s path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set. `build/after-pack.cjs` takes
out of `Info.plist` the camera, microphone and Bluetooth descriptions Electron declares (the app uses none).
`tools/package.mjs` assembles the app outside Dropbox, whose extended attributes break code signing.

### On GitHub Actions

Secrets of the repository's **`release` environment** (the names the Slides Editor uses):

| Secret | Content |
|---|---|
| `MAC_CERT_P12` | the `.p12` in base64 (`base64 -i certificate.p12`) |
| `MAC_CERT_PASSWORD` | the `.p12` password |
| `APPLE_API_KEY` | the `.p8` in base64 (`base64 -i AuthKey_A9CQQ9PA49.p8`) |
| `APPLE_API_KEY_ID` | `A9CQQ9PA49` |
| `APPLE_API_ISSUER` | the Issuer ID (App Store Connect → **Users and Access → Integrations → Team Keys**) |

Without `MAC_CERT_P12`, the Mac build is signed ad hoc, and Gatekeeper warns. The workflow checks the universal
executable, the signature, the stapled notarization and Gatekeeper's verdict on every signed build.

## Windows and the Microsoft Store

The NSIS installer installs per user, without asking for an administrator. It is not signed: SmartScreen warns
"Windows protected your PC" (**More info → Run anyway**). The signed way onto Windows is the Microsoft Store.

The MSIX (electron-builder's `appx` target) is signed by the Store once it passes certification; its updates come
through the Store.

- Identity from Partner Center (**Product management → Product identity**): publisher
  `CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46`, display name `mgarlabx` (the account's, as for the other editors); name
  `mgarlabx.EdukorsTextEditor` (**check it** against what Partner Center shows once the app is reserved).
- Tiles in `build/appx/`, made from `build/icon.svg`.
- Full-trust desktop app (`runFullTrust`, a restricted capability to justify in **Submission options**). Three
  languages (pt-BR, en-US, es-ES), each with its Store listing. The privacy policy is given as text in Partner Center
  (**Properties**). In **Properties → Product declarations**, *"This product incorporates generative AI features…"*
  must be checked (policy 11.16).
- Screenshots: **Actions → Store screenshots → Run workflow** takes them on Windows at 1920 × 1080, in the three
  languages, from a sample handout (`tools/store-screenshots.mjs`, `tools/store-sample.mjs`); they are in the run's
  `store-screenshots` artifact. Locally, `npm run build && node tools/store-screenshots.mjs` makes the same pictures on
  this system, in `test-results/store-screenshots/`.

The release workflow sends each final version to the Store (the **store** job, `.github/workflows/store.yml`), with the
Microsoft Store Developer CLI: a new submission with the run's **store-msix** package, the listings unchanged. It
needs `PRODUCT_ID` (the Store ID) in `store.yml` and four repository secrets, the same values as in the other editors
(the Entra application **GitHub Actions - Edukors Store**, tenant `Solvertank.onmicrosoft.com`, role **Manager
(Windows)**): `PARTNER_CENTER_TENANT_ID`, `PARTNER_CENTER_CLIENT_ID`, `PARTNER_CENTER_SELLER_ID` and
`PARTNER_CENTER_CLIENT_SECRET`. With the repository variable `STORE_AUTO_SUBMIT` set to `true`, the package is
submitted for certification at once; otherwise it is left as a draft. **The first submission is made by hand** in
Partner Center (listings, screenshots, age rating, pricing, properties): the CLI only replaces the package of an app
that already has a submission.

## Linux

An **AppImage** (one file, runs without installing) and a **.deb**, which installs the app, the menu entry and the
`.etex` type. x64 only; there is nothing to sign.

## Releasing a version

Versions are release dates: `package.json` 26.11.7 is `v.26.11.07` in `app-config.js`; keep both the same.

1. Set the version in `package.json` and `app-config.js` (and the lockfile: `npm install --package-lock-only`),
   commit, and push.
2. `git tag v26.11.7 && git push origin v26.11.7`. The Release workflow checks the tag against `package.json`, runs the
   tests against the latest Common, builds and notarizes, and publishes the release with all the installers, their
   fixed-name copies (`tools/public-installers.mjs`) and `SHA256SUMS.txt` (with build provenance); then it sends the
   MSIX to the Store. A tag `vX.Y.Z-rc.N` makes a pre-release, without the Store.

### Download links

These always download the latest published version:

- Mac: `https://github.com/mgarlabx/edukors_text_editor/releases/latest/download/Edukors-Text-Editor-mac.dmg`
- Windows, installer: `https://github.com/mgarlabx/edukors_text_editor/releases/latest/download/Edukors-Text-Editor-windows.exe`
- Linux, AppImage: `https://github.com/mgarlabx/edukors_text_editor/releases/latest/download/Edukors-Text-Editor-linux.AppImage`
- Linux, Debian/Ubuntu: `https://github.com/mgarlabx/edukors_text_editor/releases/latest/download/Edukors-Text-Editor-linux.deb`
- Windows, Microsoft Store: `https://apps.microsoft.com/detail/9N0QJKJJTJN6` (Store ID 9N0QJKJJTJN6; the page works once the first submission is approved)
