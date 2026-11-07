// Keep this app's overwrite prompt to Cancel / Replace. Apply after dependency installation,
// before the shared shell is loaded or packaged, including CI builds with the latest Common.
import { readFile, writeFile } from "node:fs/promises";

export async function customizeCommon() {
  const file = new URL("../node_modules/edukors-common-ux/src/files/file-dialogs.js", import.meta.url);
  const source = await readFile(file, "utf8");
  const before = "footer.append(cancel, back, go, replace);";
  const after = "footer.append(cancel, go, replace); // Text Editor: Cancel or Replace on conflict.";
  // Common does this itself since 2026-11-04 (c1e7783); the patch is only for older locked versions.
  if (source.includes(after) || source.includes("footer.append(cancel, go, replace);")) return;
  if (!source.includes(before)) throw new Error("Common's save dialog changed; review the overwrite prompt customization.");
  await writeFile(file, source.replace(before, after));
}
