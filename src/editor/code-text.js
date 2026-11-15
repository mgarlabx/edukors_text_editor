// Plain-text files (code, data, notes) as they are on disk: which extensions open as code, and how their bytes become
// text and back. A file keeps its encoding, its byte order mark, and its line ending, so opening and saving it without
// changes writes the same bytes (src/editor/index.js also writes the bytes read while the text is unchanged).
//
// Text is decoded as UTF-8; a file with a UTF-16 byte order mark as UTF-16; a file that is not valid UTF-8 as
// Windows-1252 (what Excel and older Windows programs write). Inside the editor every line ends with "\n"; the line
// ending most used in the file ("\r\n" or "\n") is put back when it is saved.

// The extensions opened in the code view. app-config.js (file.importFormats) and desktop/main.mjs (openExtensions,
// saveExtensions) list the same ones; tests/code.test.mjs checks that they agree.
export const CODE_EXTENSIONS = [
  ".txt", ".log", ".csv", ".tsv",
  ".py", ".php", ".phtml", ".sql", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".html", ".htm", ".css", ".json", ".xml", ".svg", ".yaml", ".yml",
  ".sh", ".toml", ".ini",
];

const CP1252 = (() => {
  try { return new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 256 }, (_, i) => i)); } catch { return null; }
})();
let cp1252Bytes = null;

/** A file's bytes as text: { text (lines end with "\n"), eol ("\n" | "\r\n"), bom, encoding }. */
export function decodeText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let encoding = "utf-8", bom = false, start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { bom = true; start = 3; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = "utf-16le"; bom = true; start = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = "utf-16be"; bom = true; start = 2; }
  const body = bytes.subarray(start);
  let text;
  if (encoding === "utf-8") {
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body); }
    catch { if (!CP1252) throw new Error("The file is not UTF-8 text."); encoding = "windows-1252"; text = new TextDecoder("windows-1252").decode(body); }
  } else text = new TextDecoder(encoding, { ignoreBOM: true }).decode(body);
  const crlf = text.split("\r\n").length - 1, lf = text.split("\n").length - 1 - crlf;
  return { text: text.replace(/\r\n?/g, "\n"), eol: crlf > lf ? "\r\n" : "\n", bom, encoding };
}

/**
 * Text as a file's bytes, with its line ending, byte order mark, and encoding. A character Windows-1252 cannot hold
 * (an emoji, say) makes the file UTF-8 instead, so nothing typed is lost.
 */
export function encodeText(text, { eol = "\n", bom = false, encoding = "utf-8" } = {}) {
  const body = eol === "\n" ? text : text.replace(/\n/g, eol);
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    const head = bom ? 2 : 0, out = new Uint8Array(head + body.length * 2), le = encoding === "utf-16le";
    if (bom) { out[0] = le ? 0xff : 0xfe; out[1] = le ? 0xfe : 0xff; }
    for (let i = 0; i < body.length; i++) {
      const unit = body.charCodeAt(i), at = head + i * 2;
      out[at] = le ? unit & 0xff : unit >> 8;
      out[at + 1] = le ? unit >> 8 : unit & 0xff;
    }
    return out;
  }
  if (encoding === "windows-1252" && CP1252) {
    if (!cp1252Bytes) { cp1252Bytes = new Map(); for (let i = 255; i >= 0; i--) cp1252Bytes.set(CP1252[i], i); }
    const out = new Uint8Array(body.length);
    let ok = true;
    for (let i = 0; i < body.length && ok; i++) { const byte = cp1252Bytes.get(body[i]); if (byte === undefined) ok = false; else out[i] = byte; }
    if (ok) return out;
  }
  const utf8 = new TextEncoder().encode(body);
  if (!bom || encoding !== "utf-8") return utf8;
  const out = new Uint8Array(utf8.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(utf8, 3);
  return out;
}
