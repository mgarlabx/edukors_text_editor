// Bundles the editor (src/editor, ProseMirror) into dist/editor.js, which Common's boot.js loads as one of the app's
// scripts, and its styles into dist/editor.css. Run by npm start, npm test, and npm run package.
import { build } from "esbuild";
import { customizeCommon } from "./customize-common.mjs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await customizeCommon();
await mkdir(`${root}dist`, { recursive: true });
await build({ entryPoints: [`${root}src/editor/index.js`], bundle: true, format: "iife", target: "chrome140", outfile: `${root}dist/editor.js`, minify: true, sourcemap: "linked", legalComments: "eof", logLevel: "warning" });
const css = await Promise.all([
  "node_modules/prosemirror-view/style/prosemirror.css", "node_modules/prosemirror-gapcursor/style/gapcursor.css", "node_modules/prosemirror-tables/style/tables.css", "src/editor/editor.css",
].map((file) => readFile(`${root}${file}`, "utf8")));
await writeFile(`${root}dist/editor.css`, css.join("\n"));
// pdf.js is loaded only when a PDF is imported (src/editor/convert.js), from these two files.
await mkdir(`${root}dist/pdfjs`, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) await copyFile(`${root}node_modules/pdfjs-dist/build/${file}`, `${root}dist/pdfjs/${file}`);
console.log("dist/editor.js, dist/editor.css");
