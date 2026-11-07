// Store screenshots: the editor on the system this runs on (the Microsoft Store wants Windows), in pt, en and es, with a
// sample handout (tools/store-sample.mjs). The assistant uses Common's fake provider; no real account is used.
// Run after npm run build. Output: test-results/store-screenshots/<lang>/*.png (1920 × 1080).
// Same flow as the Slides Editor's scripts/store-screenshots.mjs.
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { sampleFile, searchWord, writeSample } from "./store-sample.mjs";

const require = createRequire(import.meta.url), [width, height] = [1920, 1080];
const out = path.resolve("test-results/store-screenshots");
const { createAiRuntime } = await import("edukors-common-ux/src/ai/runtime/index.js");
const { createFakeProvider } = await import("edukors-common-ux/src/ai/runtime/testing/index.js");
const account = { pt: "Minha conta", en: "My account", es: "Mi cuenta" };
const mac = process.platform === "darwin";
// Hidden windows paint on the Mac (and nobody wants them popping up there), but not on Windows or Linux.
const visible = !mac;
await fs.rm(out, { recursive: true, force: true });

async function launch(data, file) {
  const env = { ...process.env, EDUKORS_ACCEPT_TERMS: "1", EDUKORS_NO_UPDATES: "1", EDUKORS_HIDDEN: visible ? "" : "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require("electron"), args: [".", "--data-dir", data, ...(file ? [file] : [])], env, timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForLoadState("load");
  return { app, page };
}
const quit = (app) => app.evaluate(({ app }) => app.exit(0)).catch(() => {});

for (const lang of ["pt", "en", "es"]) {
  const root = path.join(out, lang), data = path.join(root, "appdata");
  await fs.mkdir(data, { recursive: true });
  // An account of the fake provider, signed in: the assistant shows it as the one in use.
  const ai = createAiRuntime({ appId: "text", dataDir: data, providers: [createFakeProvider()] });
  const acc = await ai.createAccount({ providerId: "fake", label: account[lang] });
  await ai.connectAccount(acc.id);
  await ai.dispose();
  const file = path.join(root, "docs", sampleFile(lang));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeSample(file, lang, acc.id);

  // First start: the interface language and the assistant panel, kept in the page's storage (in data/electron).
  {
    const { app, page } = await launch(data);
    await page.evaluate((lang) => {
      localStorage.setItem("edukors.common.preferences", JSON.stringify({ appearance: "light", language: lang, fontSize: 100 }));
      localStorage.setItem("edukors.common.panel-open.assistant", "1");
    }, lang);
    await quit(app);
  }

  const { app, page } = await launch(data, file);
  try {
    // Windows keeps a window inside its work area (no taskbar, no frame): full screen gives the whole 1920×1080 display.
    await app.evaluate(({ BrowserWindow }, [w, h, full]) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (full) win.setFullScreen(true); else { win.setContentSize(w, h); win.center(); }
    }, [width, height, visible]);
    await page.locator(".ProseMirror table").waitFor({ timeout: 30000 });
    // The fake provider's model name ("Fake …") is left out of the pictures.
    await page.addStyleTag({ content: ".ai-composer-right > :nth-child(2) { visibility: hidden; }" });
    await page.waitForTimeout(1500);
    const shot = async (name) => {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(root, name) });
      console.log(`${lang}/${name}: ${(await page.evaluate(() => [innerWidth, innerHeight])).join("×")}`);
    };

    // 1. The assistant beside the handout it wrote, with the conversation (restored from the file into the history).
    await page.locator(".ai-header-actions button").first().click();
    await page.locator(".ai-history-open").first().click();
    await page.locator(".ai-thread").getByText(account[lang], { exact: false }).count();
    await page.locator(".ProseMirror h1").first().click();
    await shot("01-assistant.png");

    // 2. The page alone: the assistant closed, the cursor in the title.
    await page.locator("[data-command='assistant']").click();
    await page.locator(".ProseMirror h1").first().click();
    await shot("02-editor.png");

    // 3. Find and replace, with its matches highlighted and counted.
    await page.locator(".ProseMirror p").nth(1).click();
    await page.keyboard.press(mac ? "Meta+Alt+f" : "Control+h");
    await page.locator(".find-input").first().fill(searchWord[lang]);
    await page.locator(".find-input").first().focus();
    await shot("03-find.png");
    await page.keyboard.press("Escape");

    // 4. Insert shape: Common's catalog, opened under its button.
    await page.locator(".ProseMirror p").last().click();
    await page.locator('#insert-actions [data-command="insertShape"]').click();
    await page.mouse.move(1500, 700);
    await page.waitForTimeout(800);
    await shot("04-insert-shape.png");
    await page.keyboard.press("Escape");

    // 5. Insert table: the size grid, with 3 × 4 picked.
    await page.locator(".ProseMirror p").last().click();
    await page.locator('#insert-actions [data-command="insertTable"]').click();
    const cells = page.locator(".table-picker-grid > *");
    await cells.first().waitFor();
    const columns = await page.evaluate(() => getComputedStyle(document.querySelector(".table-picker-grid")).gridTemplateColumns.split(" ").length);
    await cells.nth(2 * columns + 3).hover();
    await shot("05-insert-table.png");
    await page.keyboard.press("Escape");
  } finally {
    await quit(app);
  }
}
console.log("Store screenshots in", out);
