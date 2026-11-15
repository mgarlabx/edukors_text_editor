// The Text Editor's main process: the shared Electron host of Edukors Common with this app's settings.
// Run with npm start (or electron . [--shared | --data-dir <dir>] [--verbose]).
import { fileURLToPath } from "node:url";
import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";

// Plain-text files (code, data, notes), opened in the code view: the same list as app-config.js (file.importFormats,
// "code") and src/editor/code-text.js (CODE_EXTENSIONS).
const CODE_EXTENSIONS = [".txt", ".log", ".csv", ".tsv", ".py", ".php", ".phtml", ".sql", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm", ".css", ".json", ".xml", ".svg", ".yaml", ".yml", ".sh", ".toml", ".ini"];

startDesktopApp({
  appId: "text",
  name: "Edukors Text Editor",
  root: fileURLToPath(new URL("..", import.meta.url)),
  documentExtensions: [".etex"],
  // Open and Recent also accept these (opened as they are, without creating an .etex)…
  openExtensions: [".docx", ".md", ".pdf", ...CODE_EXTENSIONS],
  // …and saves these back into the file they were opened from (app-config.js, file.saveOriginal).
  saveExtensions: [".md", ...CODE_EXTENSIONS],
  exportFormats: ["pdf", "txt", "md"],
});
