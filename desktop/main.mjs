// The Text Editor's main process: the shared Electron host of Edukors Common with this app's settings.
// Run with npm start (or electron . [--shared | --data-dir <dir>] [--verbose]).
import { fileURLToPath } from "node:url";
import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";

startDesktopApp({
  appId: "text",
  name: "Edukors Text Editor",
  root: fileURLToPath(new URL("..", import.meta.url)),
  documentExtensions: [".etex"],
  // Open and Recent also accept these (opened as they are, without creating an .etex)…
  openExtensions: [".docx", ".md", ".markdown", ".txt", ".pdf", ".html", ".htm"],
  // …and saves these back into the file they were opened from (app-config.js, file.saveOriginal).
  saveExtensions: [".docx", ".md", ".markdown", ".txt", ".html", ".htm"],
  exportFormats: ["html", "pdf", "md", "txt", "docx"],
});
