// The Text Editor's main process: the shared Electron host of Edukors Common with this app's settings.
// Run with npm start (or electron . [--shared | --data-dir <dir>] [--verbose]).
import { fileURLToPath } from "node:url";
import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";

startDesktopApp({
  appId: "text",
  name: "Edukors Text Editor",
  root: fileURLToPath(new URL("..", import.meta.url)),
  documentExtensions: [".etex"],
  importExtensions: [".docx", ".html", ".htm", ".md", ".markdown", ".txt", ".pdf"],
  exportFormats: ["html", "pdf", "md", "txt", "docx"],
});
