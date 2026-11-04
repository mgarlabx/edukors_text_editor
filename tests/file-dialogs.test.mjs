import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Minimal DOM harness for the shared dialog's actual click/commit behavior.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false; }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  async fire(type) { for (const handler of this.listeners[type] || []) await handler({ target: this }); }
  querySelectorAll() { return []; }
  insertAdjacentHTML() {}
  focus() {}
  select() {}
  showModal() {}
  close() { this.fire("close"); }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
}
const source = await readFile(new URL("../node_modules/edukors-common-ux/src/files/file-dialogs.js", import.meta.url), "utf8");
function openSave(commit) {
  const body = new Element("body");
  const context = { document: { body, createElement: tag => new Element(tag) }, EdukorsIcons: { svg: () => "" } };
  runInNewContext(source, context);
  const result = context.EdukorsFileDialogs.save({ t: key => key, name: "Aula", folder: "/docs", extension: ".etex", commit });
  const dialog = body.children[0];
  const footer = dialog.children.at(-1);
  return { result, buttons: footer.children, visible: () => footer.children.filter(button => !button.hidden).map(button => button.textContent) };
}

test("existing save offers Cancel and Replace; replacement requires an explicit second click", async () => {
  const calls = [];
  const save = openSave(async options => { calls.push(options); return options.replace ? {} : { exists: true }; });
  await save.buttons.find(button => button.textContent === "save").fire("click");
  assert.deepEqual(save.visible(), ["cancel", "replaceFile"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].replace, false);
  await save.buttons.find(button => button.textContent === "replaceFile").fire("click");
  assert.equal(calls[1].replace, true);
  assert.equal((await save.result).name, "Aula");
});

test("cancel after a save conflict leaves the existing file untouched", async () => {
  const calls = [];
  const save = openSave(async options => { calls.push(options); return { exists: true }; });
  await save.buttons.find(button => button.textContent === "save").fire("click");
  await save.buttons.find(button => button.textContent === "cancel").fire("click");
  assert.equal(await save.result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].replace, false);
});
