// The Text Editor's editing surface: ProseMirror on the page that Common's shell shows for the active document, the
// shared formatting bar (EdukorsFormat) above it, and the shell's Edit buttons. Bundled into dist/editor.js
// (tools/build.mjs) and loaded by Common's boot.js as one of the app's scripts; it exposes EdukorsTextEditor.
//
// Each open document keeps its own editor state (content, selection, undo history) in doc.editor; one view shows the
// active one. A document is modified while its content differs from what was last saved or opened.
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, deleteSelection, chainCommands, exitCode } from "prosemirror-commands";
import { history, undo, redo, undoDepth, redoDepth } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from "prosemirror-inputrules";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { schema, emptyDoc, docFromJSON, ALIGNS, DEFAULT_FONT, DEFAULT_SIZE, SIZE_RANGE } from "./schema.js";
import { exportDocument, importDocument, fromMarkdown, toMarkdown } from "./convert.js";
import { nodeViews, insertShape, insertImageFromFile } from "./media.js";
import { renderPageBreaks } from "./pages.js";
import * as ai from "./ai.js";
import { columnResizing, tableEditing, goToNextCell, isInTable, selectionCell, setCellAttr, addRowBefore, addRowAfter, addColumnBefore, addColumnAfter,
  deleteRow, deleteColumn, mergeCells, splitCell, toggleHeaderRow, deleteTable } from "prosemirror-tables";
import { pickTableSize, insertTable } from "./tables.js";
import { media } from "./schema.js";
import { searchPlugin, createFindBar, goToMatch, SEARCH_ICON } from "./search.js";
import { lineSpacingPlugin } from "./spacing.js";
import { newCodeState, createCodeView, wraps, setWrap, setPhrases, joinCodeLines, selectedText, undo as codeUndo, redo as codeRedo,
  undoDepth as codeUndoDepth, redoDepth as codeRedoDepth, openSearchPanel, closeSearchPanel, searchPanelOpen } from "./code.js";
import { decodeText, encodeText } from "./code-text.js";
import { joinLines } from "./join.js";
import { countText } from "./stats.js";

const { nodes, marks } = schema;
const mac = /Mac|iPhone|iPad/i.test(globalThis.navigator?.platform || "");
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const FONT_FAMILIES = ["Arial", "Calibri", "Cambria", "Georgia", "Helvetica", "Times New Roman", "Verdana", "Courier New"];

// ---------- Commands ----------
// A mark is shown as active when the whole selection has it (or, with no selection, the typing position).
const markActive = (state, type) => {
  const { $from, empty, ranges } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  let all = true, any = false;
  for (const range of ranges) state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => { if (node.isText) { any = true; if (!type.isInSet(node.marks)) all = false; } });
  return any && all;
};
const markAttr = (state, type, attr) => {
  const { empty, $from, ranges } = state.selection;
  if (empty) return type.isInSet(state.storedMarks || $from.marks())?.attrs[attr];
  let value; let mixed = false;
  for (const range of ranges) state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
    if (!node.isText) return;
    const found = type.isInSet(node.marks)?.attrs[attr];
    if (value === undefined) value = found ?? null; else if (value !== (found ?? null)) mixed = true;
  });
  return mixed ? undefined : value ?? undefined;
};
// Sets a mark with attributes on the selection (or for the next typing when the selection is empty); null removes it.
const setMark = (type, attrs) => (state, dispatch) => {
  const { empty, ranges } = state.selection;
  if (dispatch) {
    const tr = state.tr;
    if (empty) { tr.removeStoredMark(type); if (attrs) tr.addStoredMark(type.create(attrs)); }
    else for (const { $from, $to } of ranges) { tr.removeMark($from.pos, $to.pos, type); if (attrs) tr.addMark($from.pos, $to.pos, type.create(attrs)); }
    dispatch(tr.scrollIntoView());
  }
  return true;
};
const setAlign = (align) => (state, dispatch) => {
  const tr = state.tr;
  for (const { $from, $to } of state.selection.ranges) state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
    if (node.type === nodes.paragraph || node.type === nodes.heading) tr.setNodeMarkup(pos, null, { ...node.attrs, align: align === "left" ? null : align });
  });
  if (dispatch) dispatch(tr);
  return true;
};
const listType = (state) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const type = $from.node(d).type;
    if (type === nodes.bullet_list) return "bulleted";
    if (type === nodes.ordered_list) return "numbered";
  }
  return "none";
};
const inQuote = (state) => { const { $from } = state.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === nodes.blockquote) return true; return false; };
function blockStyle(state) {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to) && $from.parent.type !== $to.parent.type) return undefined;
  const parent = $from.parent;
  if (parent.type === nodes.heading) return `heading${parent.attrs.level}`;
  if (parent.type === nodes.code_block) return "code";
  return inQuote(state) ? "quote" : "paragraph";
}
function applyBlockStyle(view, style) {
  const run = (command) => command(view.state, view.dispatch);
  if (inQuote(view.state) && style !== "quote") run(lift);
  if (style === "quote") { if (!inQuote(view.state)) { run(setBlockType(nodes.paragraph)); run(wrapIn(nodes.blockquote)); } return; }
  if (style === "code") return void run(setBlockType(nodes.code_block));
  const heading = /^heading([1-3])$/.exec(style);
  run(heading ? setBlockType(nodes.heading, { level: Number(heading[1]) }) : setBlockType(nodes.paragraph));
}
function applyList(view, kind) {
  const current = listType(view.state);
  if (current !== "none") { while (listType(view.state) !== "none" && liftListItem(nodes.list_item)(view.state, view.dispatch)); }
  if (kind !== "none" && kind !== current) wrapInList(kind === "bulleted" ? nodes.bullet_list : nodes.ordered_list)(view.state, view.dispatch);
}
function applyLink(view, href) {
  const { state } = view;
  const { empty, from } = state.selection;
  if (!href) {
    // An empty selection inside a link removes that link from its paragraph.
    if (empty) {
      const $pos = state.doc.resolve(from), mark = marks.link.isInSet(state.storedMarks || $pos.marks());
      if (mark) view.dispatch(state.tr.removeMark($pos.start(), $pos.end(), mark));
    } else view.dispatch(state.tr.removeMark(state.selection.from, state.selection.to, marks.link));
    return;
  }
  if (empty) view.dispatch(state.tr.insertText(href, from).addMark(from, from + href.length, marks.link.create({ href })));
  else view.dispatch(state.tr.removeMark(state.selection.from, state.selection.to, marks.link).addMark(state.selection.from, state.selection.to, marks.link.create({ href })));
}

// ---------- Plugins ----------
function rules() {
  return inputRules({ rules: [
    ...smartQuotes, ellipsis, emDash,
    textblockTypeInputRule(/^(#{1,3})\s$/, nodes.heading, (match) => ({ level: match[1].length })),
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, nodes.ordered_list, (match) => ({ order: Number(match[1]) }), (match, node) => node.childCount + node.attrs.order === Number(match[1])),
    textblockTypeInputRule(/^```$/, nodes.code_block),
  ] });
}
function keys() {
  const map = {
    "Mod-z": undo, "Shift-Mod-z": redo, "Mod-b": toggleMark(marks.strong), "Mod-i": toggleMark(marks.em), "Mod-u": toggleMark(marks.underline),
    "Mod-Shift-x": toggleMark(marks.strike), "Mod-e": toggleMark(marks.code), "Mod-.": toggleMark(marks.sup), "Mod-,": toggleMark(marks.sub),
    "Shift-Enter": chainCommands(exitCode, (state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView()); return true; }),
    // In a table, Tab and Shift+Tab move between cells; in a list they change the level.
    Enter: splitListItem(nodes.list_item), Tab: chainCommands(goToNextCell(1), sinkListItem(nodes.list_item)), "Shift-Tab": chainCommands(goToNextCell(-1), liftListItem(nodes.list_item)),
    "Mod-Shift-j": joinLines,
    "Mod-Alt-0": setBlockType(nodes.paragraph), "Mod-Alt-1": setBlockType(nodes.heading, { level: 1 }), "Mod-Alt-2": setBlockType(nodes.heading, { level: 2 }), "Mod-Alt-3": setBlockType(nodes.heading, { level: 3 }),
  };
  if (!mac) map["Mod-y"] = redo;
  return [keymap(map), keymap(baseKeymap)];
}
const plugins = () => [columnResizing(), tableEditing(), rules(), ...keys(), history(), dropCursor(), gapCursor(), searchPlugin(), lineSpacingPlugin()];
const newState = (doc) => EditorState.create({ schema, doc, plugins: plugins() });

// ---------- The surface ----------
const t = (key) => { const L = globalThis.EdukorsLanguages; return (L[document.documentElement.lang] || L.en).messages[key] || L.en.messages[key]; };
let view = null, active = null, toolbar = null;
const format = {};
const page = () => document.getElementById("document-placeholder");
const editOf = (doc) => (doc.editor ??= { state: newState(doc.text ? docFromJSON(doc.text) : emptyDoc()), saved: null });
// This app's own labels (Common's translations hold the shared ones); other languages fall back to English.
const LABELS = {
  en: { wrap: "Wrap long lines", join: "Join lines into one paragraph", chars: ["character", "characters"], words: ["word", "words"] },
  pt: { wrap: "Quebrar linhas longas", join: "Unir linhas em um parágrafo", chars: ["caractere", "caracteres"], words: ["palavra", "palavras"] },
  es: { wrap: "Ajustar líneas largas", join: "Unir líneas en un párrafo", chars: ["carácter", "caracteres"], words: ["palabra", "palabras"] },
};
const lang = () => document.documentElement.lang;
const label = (key) => (LABELS[lang()] || LABELS.en)[key] ?? LABELS.en[key];

// ---------- Code view (src/editor/code.js) ----------
// A plain-text file (code, data, notes; src/editor/code-text.js lists the extensions) opens in the code view instead
// of the page: editor.code = { state (CodeMirror), savedDoc (the text as last opened or saved), bytes (the file's
// bytes then, written again while the text has not changed), ext, eol, bom, encoding }. Its ProseMirror state stays
// empty and is never shown.
const isCode = (doc) => !!doc?.editor?.code;
const codeOn = () => isCode(active);
let codeView = null, codeHost = null;
const codeJSON = (text) => ({ type: "doc", content: [text ? { type: "code_block", content: [{ type: "text", text }] } : { type: "code_block" }] });
// Long lines wrap by default; the choice is kept on this computer.
const WRAP_KEY = "edukors.text.wrap";
let wrapLines = (() => { try { return localStorage.getItem(WRAP_KEY) !== "false"; } catch { return true; } })();

function markModified(doc) {
  const editor = editOf(doc);
  const modified = editor.code ? !editor.code.state.doc.eq(editor.code.savedDoc) : !editor.state.doc.eq(editor.saved ?? emptyDoc());
  if (modified === !!doc.modified) return;
  doc.modified = modified;
  document.dispatchEvent(new CustomEvent("edukors:document-modified", { detail: { id: doc.id } }));
}

// What the selection is: a picture, a shape, or text. The format bar shows the groups for it.
const kindOf = (state) => (state.selection instanceof NodeSelection && (state.selection.node.type === nodes.image || state.selection.node.type === nodes.shape) ? state.selection.node.type.name : "text");
const GROUPS = { source: [], code: [], text: ["blockStyle", "text", "align", "lists", "link"], table: ["blockStyle", "text", "align", "lists", "link", "table"], image: ["align"], shape: ["shape", "align"] };
const TABLE_ACTIONS = { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, mergeCells, splitCell, toggleHeaderRow, deleteTable };
// The format bar's kind: a picture, a shape, text in a table (adds the table group), or text.
const barKind = (state) => { const kind = kindOf(state); return kind === "text" && isInTable(state) ? "table" : kind; };

function readFormat(state) {
  if (kindOf(state) !== "text") { Object.assign(format, state.selection.node.attrs); return; }
  Object.assign(format, {
    blockStyle: blockStyle(state),
    bold: markActive(state, marks.strong), italic: markActive(state, marks.em), underline: markActive(state, marks.underline), strike: markActive(state, marks.strike),
    script: markActive(state, marks.sub) ? "sub" : markActive(state, marks.sup) ? "super" : "none",
    fontSize: markAttr(state, marks.size, "size") ?? DEFAULT_SIZE,
    fontFamily: markAttr(state, marks.font, "family") ?? DEFAULT_FONT,
    color: markAttr(state, marks.color, "color") ?? "#000000",
    align: ALIGNS.includes(state.selection.$from.parent.attrs.align) ? state.selection.$from.parent.attrs.align : "left",
    list: listType(state),
    link: markAttr(state, marks.link, "href") || "",
    cellFill: isInTable(state) ? selectionCell(state)?.nodeAfter?.attrs.background || "transparent" : "transparent",
  });
}

function onFormat(property, value) {
  if (!view) return;
  const run = (command) => command(view.state, view.dispatch);
  // A picture or shape: its own attributes (a block is left, center, or right; justify means center).
  if (kindOf(view.state) !== "text") {
    const { node, from } = view.state.selection;
    if (!(property in node.attrs)) return;
    const next = property === "align" && value === "justify" ? "center" : value;
    const tr = view.state.tr.setNodeMarkup(from, null, { ...node.attrs, [property]: next });
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, from)));
    view.focus();
    return;
  }
  const toggle = { bold: marks.strong, italic: marks.em, underline: marks.underline, strike: marks.strike };
  if (toggle[property]) {
    const type = toggle[property];
    run(value ? setMark(type, {}) : setMark(type, null));
  } else if (property === "script") {
    run(setMark(marks.sub, null)); run(setMark(marks.sup, null));
    if (value === "sub" || value === "super") run(setMark(value === "sub" ? marks.sub : marks.sup, {}));
  } else if (property === "fontSize") run(setMark(marks.size, value === DEFAULT_SIZE ? null : { size: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, value)) }));
  else if (property === "fontFamily") run(setMark(marks.font, value === DEFAULT_FONT ? null : { family: value }));
  else if (property === "color") run(setMark(marks.color, value === "#000000" ? null : { color: value }));
  else if (property === "align") run(setAlign(value));
  else if (property === "list") applyList(view, value);
  else if (property === "blockStyle") applyBlockStyle(view, value);
  else if (property === "link") applyLink(view, value);
  else if (property === "tableAction") TABLE_ACTIONS[value]?.(view.state, view.dispatch);
  else if (property === "cellFill") run(setCellAttr("background", value === "transparent" ? null : value));
  view.focus();
}

// Document zoom is a view preference; it never changes editor state or exported font sizes.
const ZOOM_KEY = "edukors.text.zoom";
let textZoom = (() => { try { const n = Number(localStorage.getItem(ZOOM_KEY)); return n >= 50 && n <= 200 ? Math.round(n / 10) * 10 : 100; } catch { return 100; } })();
function zoomControls() {
  const label = document.createElement("output");
  label.className = "text-zoom-value";
  label.setAttribute("aria-live", "polite");
  const names = { en: ["Zoom out text", "Zoom in text"], pt: ["Diminuir zoom do texto", "Aumentar zoom do texto"], es: ["Reducir zoom del texto", "Ampliar zoom del texto"] };
  const buttons = [-10, 10].map((step, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "format-button icon";
    button.dataset.control = i ? "textZoomIn" : "textZoomOut";
    button.textContent = i ? "+" : "−";
    button.title = (names[document.documentElement.lang] || names.en)[i];
    button.setAttribute("aria-label", button.title);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      textZoom = Math.max(50, Math.min(200, textZoom + step));
      try { localStorage.setItem(ZOOM_KEY, String(textZoom)); } catch { /* session only */ }
      refresh();
      renderBubble();
    });
    return button;
  });
  function refresh() {
    applyZoom();
    label.textContent = `${textZoom}%`;
    buttons[0].disabled = textZoom <= 50;
    buttons[1].disabled = textZoom >= 200;
  }
  refresh();
  return [buttons[0], label, buttons[1]];
}
// The page is zoomed as a whole; the code view fills the document area, so only its text grows (--code-zoom).
function applyZoom() {
  const host = page();
  if (!host) return;
  host.style.zoom = codeOn() ? "" : String(textZoom / 100);
  host.style.setProperty("--code-zoom", String(textZoom / 100));
  codeView?.requestMeasure();
}

// Page breaks: shown by default; the choice is kept on this computer.
const BREAKS_KEY = "edukors.text.pageBreaks";
let showBreaks = (() => { try { return localStorage.getItem(BREAKS_KEY) !== "false"; } catch { return true; } })();
const BREAKS_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V4h9l3 3v2"/><path d="M6 15v5h12v-5"/><path d="M3 12h2.5M8 12h3M13.5 12h3M19 12h2"/></svg>';
function breaksButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "format-button icon";
  button.dataset.control = "pageBreaks";
  button.setAttribute("aria-pressed", String(showBreaks));
  button.setAttribute("aria-label", t("showPageBreaks"));
  button.innerHTML = `${BREAKS_ICON}<span class="tooltip" aria-hidden="true"></span>`;
  button.querySelector(".tooltip").textContent = t("showPageBreaks");
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    showBreaks = !showBreaks;
    try { localStorage.setItem(BREAKS_KEY, String(showBreaks)); } catch { /* kept for this session only */ }
    button.setAttribute("aria-pressed", String(showBreaks));
    renderBreaks();
  });
  return button;
}
const renderBreaks = () => { if (view) renderPageBreaks(page(), view.dom, showBreaks && !sourceOn() && !codeOn(), (n) => t("pageNumber").replace("{n}", n)); };

// Line wrapping in the code view (the icon of Common's graph-Wrap): applies to every open file.
const WRAP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h13.5a3 3 0 0 1 0 6H13M4 18h5"/><path d="m15 16-2 2 2 2"/></svg>';
function wrapButton() {
  const button = viewButton("wrap", WRAP_ICON, label("wrap"));
  button.setAttribute("aria-pressed", String(wrapLines));
  button.addEventListener("click", () => {
    wrapLines = !wrapLines;
    try { localStorage.setItem(WRAP_KEY, String(wrapLines)); } catch { /* kept for this session only */ }
    button.setAttribute("aria-pressed", String(wrapLines));
    if (codeView && codeOn()) codeView.dispatch({ effects: setWrap(wrapLines) });
  });
  return button;
}
// Join lines (Shift+Cmd+J, Shift+Ctrl+J): the selected lines become one paragraph, with single spaces between them.
const JOIN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7M3 12h7M3 18h7"/><path d="m10 6 4 6-4 6"/><path d="M14 12h7"/></svg>';
const JOIN_KEYS = mac ? "⇧⌘J" : "Shift+Ctrl+J";
function joinButton() {
  const button = viewButton("joinLines", JOIN_ICON, `${label("join")} (${JOIN_KEYS})`);
  button.setAttribute("aria-label", label("join"));
  button.setAttribute("aria-keyshortcuts", mac ? "Shift+Meta+J" : "Shift+Control+J");
  button.addEventListener("click", runJoin);
  return button;
}
const canJoin = () => (codeOn() ? !!codeView && codeView.state.selection.ranges.some((range) => !range.empty) : !!view && !sourceOn() && joinLines(view.state));
function runJoin() {
  if (codeOn() && codeView) { joinCodeLines(codeView); codeView.focus(); }
  else if (view && !sourceOn()) { joinLines(view.state, view.dispatch); view.focus(); }
}
// An icon button of the bar's last group that keeps the selection in the text when clicked.
function viewButton(control, icon, tooltip) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "format-button icon";
  button.dataset.control = control;
  button.setAttribute("aria-label", tooltip);
  button.innerHTML = `${icon}<span class="tooltip" aria-hidden="true"></span>`;
  button.querySelector(".tooltip").textContent = tooltip;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

// ---------- Markdown source ----------
// A document read from a Markdown file can be edited as its source. editor.markdown = { text, doc }: the Markdown text
// as last read, written, or edited, and the document it gives; while the document has not changed since, that exact
// text is what the source shows and what Save writes (Markdown is regenerated only after changes in the formatted
// view). editor.source holds the source being edited (null when the formatted view shows).
const isMarkdown = (doc) => !!doc && !!editOf(doc).markdown;
const sourceOn = () => !!active && editOf(active).source != null;
let sourceArea = null;
function sourceOf(doc) { const e = editOf(doc); return e.markdown && e.state.doc.eq(e.markdown.doc) ? e.markdown.text : toMarkdown(e.state.doc); }
// Applies a change to a document's state, shown or not (one undo step each).
function applyTr(doc, tr) {
  if (doc === active && view) view.dispatch(tr);
  else { editOf(doc).state = editOf(doc).state.apply(tr); markModified(doc); }
}
// Puts the source being edited into the document (one undo step when it changes something) and keeps it as the text.
function applySource(doc) {
  const e = editOf(doc);
  if (e.source == null) return;
  const text = e.source, parsed = fromMarkdown(text);
  if (!parsed.eq(e.state.doc)) applyTr(doc, e.state.tr.replaceWith(0, e.state.doc.content.size, parsed.content));
  e.markdown = { text, doc: editOf(doc).state.doc };
}
function grow() { if (sourceArea) { sourceArea.style.height = "auto"; sourceArea.style.height = `${sourceArea.scrollHeight}px`; } }
function renderSource() {
  const on = !!view && sourceOn();
  if (on && !sourceArea) {
    sourceArea = document.createElement("textarea");
    sourceArea.className = "markdown-source";
    sourceArea.spellcheck = false;
    sourceArea.addEventListener("input", () => {
      editOf(active).source = sourceArea.value;
      if (!active.modified) { active.modified = true; document.dispatchEvent(new CustomEvent("edukors:document-modified", { detail: { id: active.id } })); }
      grow();
    });
    for (const type of ["select", "keyup", "mouseup", "input"]) sourceArea.addEventListener(type, renderStats);
    page().append(sourceArea);
  }
  if (sourceArea) { sourceArea.hidden = !on; sourceArea.setAttribute("aria-label", t("markdownSource")); }
  if (view) view.dom.style.display = on || codeOn() ? "none" : "";
  if (on && sourceArea.value !== editOf(active).source) { sourceArea.value = editOf(active).source; sourceArea.scrollTop = 0; }
  if (on) grow();
}
function setSource(on) {
  if (!active) return;
  const e = editOf(active);
  if (on) { findBar.close({ focus: false }); e.source = sourceOf(active); }
  else { applySource(active); e.source = null; }
  renderSource(); renderToolbar(); renderEdit(); renderInsert(); renderBreaks(); renderStats();
  if (on) sourceArea.focus(); else view.focus();
}
const SOURCE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>';
function sourceButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "format-button icon";
  button.dataset.control = "markdownSource";
  button.setAttribute("aria-pressed", String(sourceOn()));
  button.setAttribute("aria-label", t("markdownSource"));
  button.innerHTML = `${SOURCE_ICON}<span class="tooltip" aria-hidden="true"></span>`;
  button.querySelector(".tooltip").textContent = t("markdownSource");
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => setSource(!sourceOn()));
  return button;
}

// ---------- Find and replace (src/editor/search.js) ----------
// The panel floats at the top right of the page. It searches the formatted text, so it closes in the Markdown source.
const findBar = createFindBar({
  t, view: () => (view && !sourceOn() && !codeOn() ? view : null),
  toast: (message) => EdukorsFileDialogs.toast({ t, message }),
  onChange() {
    document.querySelector('.context-toolbar [data-control="find"]')?.setAttribute("aria-pressed", String(findBar.isOpen));
    // A match scrolled to stays clear of the panel.
    view?.setProps({ scrollMargin: findBar.isOpen ? { top: findBar.element.firstChild.offsetHeight + 24, bottom: 24, left: 8, right: 8 } : 5 });
  },
});
function findButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "format-button icon";
  button.dataset.control = "find";
  button.setAttribute("aria-pressed", String(findBar.isOpen));
  button.setAttribute("aria-label", t("findReplace"));
  button.setAttribute("aria-keyshortcuts", mac ? "Meta+F" : "Control+F");
  button.innerHTML = `${SEARCH_ICON}<span class="tooltip" aria-hidden="true"></span>`;
  button.querySelector(".tooltip").textContent = `${t("findReplace")} (${mac ? "⌘F" : "Ctrl+F"})`;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    // The code view has its own find panel (CodeMirror's), at the top of the file.
    if (codeOn() && codeView) { if (searchPanelOpen(codeView.state)) closeSearchPanel(codeView); else openSearchPanel(codeView); return; }
    if (findBar.isOpen) findBar.close(); else findBar.open();
  });
  return button;
}
// Cmd+F (Ctrl+F) finds; Option+Cmd+F (Ctrl+H) also shows the replace field; Cmd+G and Shift+Cmd+G (F3 and Shift+F3)
// go to the next and previous match; Escape in the text closes the panel.
document.addEventListener("keydown", (event) => {
  if (!view || sourceOn() || document.querySelector("dialog[open]")) return;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const replace = mac ? mod && event.altKey && event.code === "KeyF" : mod && !event.altKey && event.code === "KeyH";
  if (codeOn()) {
    if (codeView && (replace || (mod && !event.altKey && !event.shiftKey && event.code === "KeyF"))) { event.preventDefault(); event.stopPropagation(); openSearchPanel(codeView); }
    return;
  }
  if (replace || (mod && !event.altKey && !event.shiftKey && event.code === "KeyF")) { event.preventDefault(); findBar.open({ replace }); return; }
  if (findBar.isOpen && ((mod && !event.altKey && event.code === "KeyG") || event.key === "F3")) {
    event.preventDefault();
    goToMatch({ step: event.shiftKey ? -1 : 1 })(view.state, view.dispatch);
    findBar.refresh();
    return;
  }
  if (findBar.isOpen && event.key === "Escape" && view.dom.contains(event.target)) { event.preventDefault(); findBar.close(); }
}, true);

// Print (main toolbar, after Export; Cmd+P or Ctrl+P): the same page as the PDF export (A4, 20 mm margins), through the
// system's print dialog.
const PRINT_LABELS = { en: "Print", pt: "Imprimir", es: "Imprimir" };
const PRINT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>`;
const printButton = (() => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.command = "print";
  button.className = "tool document-action";
  button.hidden = !document.querySelector('[data-command="export"]:not([hidden])');
  button.innerHTML = PRINT_ICON;
  const tooltip = document.createElement("span");
  tooltip.className = "tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  button.append(tooltip);
  const after = document.querySelector('#file-actions [data-command="export"]');
  if (after) after.after(button); else document.getElementById("file-actions")?.append(button);
  return button;
})();
function printLabels() {
  const label = PRINT_LABELS[document.documentElement.lang] || PRINT_LABELS.en;
  printButton.setAttribute("aria-label", `${label} (${mac ? "⌘P" : "Ctrl+P"})`);
  printButton.querySelector(".tooltip").textContent = label;
}
printLabels();
let printing = false;
// Electron ignores print() in a frame, so the page itself is printed: the exported page goes into a shadow root (its
// styles stay inside it), and print-only rules hide the rest of the window while the system's dialog is open.
const PRINT_SHELL_CSS = `@media screen{#text-print-root{display:none}}
@media print{@page{size:A4;margin:20mm}
html,body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;margin:0!important;padding:0!important;display:block!important}
body>*:not(#text-print-root){display:none!important}#text-print-root{display:block}}`;
async function printDocument() {
  if (!active || printing) return;
  printing = true;
  const root = document.createElement("div"), style = document.createElement("style");
  try {
    const { html } = await exportDocument(EdukorsTextEditor.toJSON(active), "pdf", EdukorsDocuments.nameOf(active));
    const page = new DOMParser().parseFromString(html, "text/html");
    const css = [...page.querySelectorAll("style")].map((node) => node.textContent).join("\n")
      .replace(/@page\{[^}]*\}/g, "").replace(/@media screen\{body\{[^}]*\}\}/g, "").replace(/(^|[\n}])body\{/g, "$1:host{display:block;");
    root.id = "text-print-root";
    root.setAttribute("aria-hidden", "true");
    const shadow = root.attachShadow({ mode: "open" });
    const pageStyle = document.createElement("style");
    pageStyle.textContent = css;
    shadow.append(pageStyle, ...page.body.childNodes);
    style.textContent = PRINT_SHELL_CSS;
    document.head.append(style);
    document.body.append(root);
    await Promise.all([...shadow.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
    window.print();
  } catch (error) {
    EdukorsFileDialogs.toast({ t, message: `${PRINT_LABELS[document.documentElement.lang] || PRINT_LABELS.en}: ${error.message}` });
  } finally {
    root.remove();
    style.remove();
    printing = false;
    view?.focus();
  }
}
printButton.addEventListener("click", printDocument);
document.addEventListener("keydown", (event) => {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey || event.shiftKey || event.code !== "KeyP" || !active || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  printDocument();
}, true);

let toolbarKind = null;
function renderToolbar() {
  const bar = document.getElementById("context-toolbar"), slot = document.getElementById("context-slot");
  if (!view) { slot.classList.remove("is-open", "is-settled"); slot.inert = true; toolbar = null; toolbarKind = null; bar.replaceChildren(); return; }
  const kind = codeOn() ? "code" : sourceOn() ? "source" : barKind(view.state), key = `${kind}${isMarkdown(active) ? ":md" : ""}`;
  readFormat(view.state);
  if (!toolbar || key !== toolbarKind) {
    bar.setAttribute("aria-label", t("contextToolbar"));
    // The shared groups render into their own holder; the view controls sit at the end of the bar: zoom, find, page
    // breaks (line wrapping in the code view), join lines, and the Markdown source switch.
    const groups = document.createElement("div");
    groups.className = "text-format-groups";
    const end = document.createElement("div");
    end.className = "format-group text-view-group";
    end.append(...zoomControls(), ...(kind === "source" ? [] : [findButton()]), kind === "code" ? wrapButton() : breaksButton(),
      ...(kind === "source" ? [] : [joinButton()]), ...(isMarkdown(active) ? [sourceButton()] : []));
    bar.replaceChildren(groups, end);
    toolbar = EdukorsFormat.render(groups, {
      groups: GROUPS[kind], state: format, t, onChange: onFormat,
      options: { fontSizes: FONT_SIZES, fontFamilies: FONT_FAMILIES, fontSizeRange: { ...SIZE_RANGE, step: 0.5 }, linkQr: false },
    });
    toolbarKind = key;
    slot.classList.add("is-open", "is-settled");
    slot.inert = false;
  } else toolbar.refresh();
  const join = bar.querySelector('[data-control="joinLines"]');
  if (join) join.disabled = !canJoin();
  if (codeOn() && codeView) bar.querySelector('[data-control="find"]')?.setAttribute("aria-pressed", String(searchPanelOpen(codeView.state)));
}

// ---------- Selection count (footer) ----------
// The characters and words of the selected text, in the status bar before the version; nothing without a selection.
const statsLabel = (() => {
  const bar = document.querySelector(".statusbar");
  if (!bar) return null;
  const span = document.createElement("span");
  span.className = "text-selection-stats";
  span.hidden = true;
  const version = bar.querySelector(".version");
  if (version) version.before(span); else bar.append(span);
  return span;
})();
let statsTimer = 0;
function selectionText() {
  if (!active) return "";
  if (codeOn()) return codeView ? selectedText(codeView.state) : "";
  if (sourceOn()) return sourceArea && !sourceArea.hidden ? sourceArea.value.slice(sourceArea.selectionStart, sourceArea.selectionEnd) : "";
  if (!view) return "";
  const { state } = view;
  return state.selection.ranges.filter((range) => range.$from.pos < range.$to.pos).map((range) => state.doc.textBetween(range.$from.pos, range.$to.pos, "\n", "\n")).join("\n");
}
// Counting a long selection takes a moment, so it waits until the selection stops changing.
function renderStats() {
  if (!statsLabel) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    const text = selectionText();
    if (!text) { statsLabel.hidden = true; statsLabel.textContent = ""; return; }
    const { chars, words } = countText(text), number = (n) => n.toLocaleString(lang() || undefined);
    const [char, chars_] = label("chars"), [word, words_] = label("words");
    statsLabel.textContent = `${number(chars)} ${chars === 1 ? char : chars_} · ${number(words)} ${words === 1 ? word : words_}`;
    statsLabel.hidden = false;
  }, 60);
}

// ---------- Links ----------
// The text is always editable, so a plain click places the cursor. With the cursor in a link, a bubble under it shows
// the address, which opens it; Cmd+click (Ctrl+click on Windows and Linux) opens a link at once. Links open in the
// system's browser or mail program (the desktop host allows only http, https, and mailto).
const openLink = (href) => window.open(href, "_blank", "noopener");
let bubble = null;
function linkAtSelection(state) {
  const { empty, $from } = state.selection;
  if (!empty) return null;
  const mark = marks.link.isInSet(state.storedMarks || $from.marks()) || ($from.nodeAfter && marks.link.isInSet($from.nodeAfter.marks));
  return mark ? mark.attrs.href : null;
}
function renderBubble() {
  const href = view && view.hasFocus() ? linkAtSelection(view.state) : null;
  if (!href) { bubble?.remove(); bubble = null; return; }
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = "link-bubble";
    bubble.setAttribute("role", "tooltip");
    bubble.addEventListener("mousedown", (event) => event.preventDefault()); // keep the cursor in the text
    document.body.append(bubble);
  }
  const link = document.createElement("a");
  link.href = href;
  link.textContent = href.replace(/^mailto:/, "");
  link.addEventListener("click", (event) => { event.preventDefault(); openLink(href); });
  const hint = document.createElement("span");
  hint.textContent = t("linkOpenHint").replace("{key}", mac ? "⌘" : "Ctrl");
  bubble.replaceChildren(link, hint);
  const at = view.coordsAtPos(view.state.selection.from);
  bubble.style.left = `${Math.max(8, Math.min(at.left - 12, innerWidth - bubble.offsetWidth - 8))}px`;
  bubble.style.top = `${at.bottom + 6}px`;
}

// The shell's Edit buttons: available when they can act; their clicks run here.
const EDIT = ["undo", "redo", "cut", "copy", "paste", "delete"];
const editButton = (key) => document.querySelector(`#edit-actions [data-command="${key}"]`);
function renderEdit() {
  const code = codeOn() && codeView ? codeView.state : null;
  const state = sourceOn() || code ? null : view?.state; // the source editor has its own undo and clipboard
  const selected = code && code.selection.ranges.some((range) => !range.empty);
  const available = code ? { undo: codeUndoDepth(code) > 0, redo: codeRedoDepth(code) > 0, cut: selected, copy: selected, paste: true, delete: selected }
    : state ? { undo: undoDepth(state) > 0, redo: redoDepth(state) > 0, cut: !state.selection.empty, copy: !state.selection.empty, paste: true, delete: !state.selection.empty } : {};
  for (const key of [...EDIT, "duplicate"]) {
    const button = editButton(key);
    if (!button) continue;
    if (available[key]) button.removeAttribute("aria-disabled"); else button.setAttribute("aria-disabled", "true");
  }
}
async function runEdit(key) {
  if (!view) return;
  if (codeOn() && codeView) {
    codeView.focus();
    if (key === "undo") codeUndo(codeView);
    else if (key === "redo") codeRedo(codeView);
    else if (key === "delete") codeView.dispatch({ ...codeView.state.replaceSelection(""), userEvent: "delete.selection", scrollIntoView: true });
    else if (key === "cut" || key === "copy") document.execCommand(key);
    else if (key === "paste") {
      try { const text = await navigator.clipboard.readText(); if (text) codeView.dispatch({ ...codeView.state.replaceSelection(text.replace(/\r\n?/g, "\n")), userEvent: "input.paste", scrollIntoView: true }); }
      catch { /* the clipboard could not be read: nothing to paste */ }
    }
    return;
  }
  view.focus();
  if (key === "undo") undo(view.state, view.dispatch);
  else if (key === "redo") redo(view.state, view.dispatch);
  else if (key === "delete") deleteSelection(view.state, view.dispatch);
  else if (key === "cut" || key === "copy") document.execCommand(key);
  else if (key === "paste") {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/html")) { view.pasteHTML(await (await item.getType("text/html")).text()); return; }
        if (item.types.includes("text/plain")) { view.pasteText(await (await item.getType("text/plain")).text()); return; }
      }
    } catch { /* the clipboard could not be read: nothing to paste */ }
  }
}
for (const key of EDIT) editButton(key)?.addEventListener("click", () => runEdit(key));

// Insert: a shape from Common's picker, under the button; a picture from a file.
const insertButton = (key) => document.querySelector(`#insert-actions [data-command="${key}"]`);
insertButton("insertTable")?.addEventListener("click", () => {
  if (!view || codeOn() || sourceOn()) return;
  const anchor = insertButton("insertTable").getBoundingClientRect(), target = view;
  pickTableSize({ x: anchor.left, y: anchor.bottom + 6, t, restoreFocus: view.dom, onPick: (rows, cols) => { if (view === target) insertTable(view, rows, cols); } });
});
insertButton("insertShape")?.addEventListener("click", () => {
  if (!view || codeOn() || sourceOn()) return;
  const anchor = insertButton("insertShape").getBoundingClientRect(), target = view;
  EdukorsShapes.pick({ x: anchor.left, y: anchor.bottom + 6, t, restoreFocus: view.dom, onPick: (type) => { if (view === target) insertShape(view, type); } });
});
insertButton("insertImage")?.addEventListener("click", () => {
  if (view && !codeOn() && !sourceOn()) insertImageFromFile(view, (name) => EdukorsFileDialogs.toast({ t, message: EdukorsFileDialogs.fill(t("importFailed"), { name, reason: t("importNotImage") }) }));
});
function renderInsert() {
  for (const key of ["insertTable", "insertShape", "insertImage"]) {
    const button = insertButton(key);
    if (button) { if (view && !sourceOn() && !codeOn()) button.removeAttribute("aria-disabled"); else button.setAttribute("aria-disabled", "true"); }
  }
}

// The formatting bar lies over the top of the document area (Common's contextual toolbar); the page scrolls below it,
// so nothing is hidden behind the bar, also when it wraps onto two rows.
const fitBelowBar = new ResizeObserver(() => {
  const body = document.querySelector(".document-body"), bar = document.getElementById("context-toolbar");
  if (body) body.style.marginTop = view ? `${bar.offsetHeight}px` : "";
});
fitBelowBar.observe(document.getElementById("context-toolbar"));

// The code view of the active file: made the first time a file shows, then given each file's state in turn (with the
// wrapping and the labels' language as they are now). The ProseMirror view is hidden meanwhile (renderSource).
function onCodeUpdate(cmView, transactions) {
  if (!codeOn()) return;
  editOf(active).code.state = cmView.state;
  if (transactions.some((tr) => tr.docChanged)) markModified(active);
  renderEdit(); renderToolbar(); renderStats();
}
function renderCode() {
  const code = active && editOf(active).code;
  if (code && !codeView) {
    codeHost = document.createElement("div");
    codeHost.className = "code-surface";
    page().append(codeHost);
    codeView = createCodeView(codeHost, code.state, onCodeUpdate);
  }
  if (!codeHost) return;
  codeHost.hidden = !code;
  if (!code) return;
  const effects = [];
  if (wraps(code.state) !== wrapLines) effects.push(setWrap(wrapLines));
  if (code.lang !== lang()) { effects.push(setPhrases(lang())); code.lang = lang(); }
  if (effects.length) code.state = code.state.update({ effects }).state;
  if (codeView.state !== code.state) {
    codeView.setState(code.state);
    if (code.scroll) codeView.dispatch({ effects: code.scroll });
  }
}

function show(doc) {
  const host = page();
  // Leaving a document shown as source: the source goes into it, and it shows formatted next time.
  if (active && active !== doc && sourceOn()) { applySource(active); editOf(active).source = null; }
  // Leaving a file in the code view: where it was scrolled to is kept for when it shows again.
  if (active && active !== doc && codeOn() && codeView) editOf(active).code.scroll = codeView.scrollSnapshot();
  if (!doc) {
    findBar.close({ focus: false });
    view?.destroy(); view = null; codeView?.destroy(); codeView = null; codeHost = null;
    active = null; renderToolbar(); renderEdit(); renderInsert(); renderBubble(); renderStats();
    renderPageBreaks(host, null, false);
    host.classList.remove("text-page", "code-page");
    host.style.zoom = "";
    host.replaceChildren();
    sourceArea = null;
    document.querySelector(".workspace")?.classList.remove("text-workspace", "code-workspace");
    document.querySelector(".document-body").style.marginTop = "";
    return;
  }
  const editor = editOf(doc);
  editor.saved ??= editor.state.doc;
  active = doc;
  host.classList.add("text-page");
  host.classList.toggle("code-page", !!editor.code);
  document.querySelector(".workspace")?.classList.add("text-workspace");
  document.querySelector(".workspace")?.classList.toggle("code-workspace", !!editor.code);
  if (editor.code) findBar.close({ focus: false });
  if (!view) {
    host.replaceChildren();
    sourceArea = null;
    view = new EditorView(host, {
      state: editor.state,
      nodeViews,
      handleClick(clicked, pos, event) {
        if (!(mac ? event.metaKey : event.ctrlKey)) return false;
        const $pos = clicked.state.doc.resolve(pos), mark = marks.link.isInSet($pos.marks()) || ($pos.nodeAfter && marks.link.isInSet($pos.nodeAfter.marks));
        if (!mark) return false;
        openLink(mark.attrs.href);
        return true;
      },
      handleDOMEvents: { blur: () => { setTimeout(renderBubble, 0); return false; }, focus: () => { setTimeout(renderBubble, 0); return false; } },
      attributes: { spellcheck: "true", "aria-label": t("fmtText") || "Text", role: "textbox", "aria-multiline": "true" },
      dispatchTransaction(tr) {
        const state = view.state.apply(tr);
        view.updateState(state);
        editOf(active).state = state;
        if (tr.docChanged) markModified(active);
        renderToolbar(); renderEdit(); renderBubble(); renderStats();
        if (tr.docChanged) renderBreaks();
        findBar.refresh();
      },
    });
    host.before(findBar.element);
    // Pictures that finish loading, and wrapping text, change the height: the page-break marks follow.
    new ResizeObserver(() => renderBreaks()).observe(view.dom);
  } else view.updateState(editor.state);
  renderCode(); renderSource(); renderToolbar(); renderEdit(); renderInsert(); renderBreaks(); renderStats(); applyZoom();
  findBar.sync();
  document.querySelector(".document-body").style.marginTop = `${document.getElementById("context-toolbar").offsetHeight}px`;
}

document.addEventListener("edukors:documents-changed", (event) => show(event.detail.active || null));
document.addEventListener("scroll", () => renderBubble(), true);
addEventListener("resize", () => renderBubble());
// After a save, the saved content is the baseline for "modified".
// A file saved in its own format: the text and bytes written are the new baseline (exportFor keeps them).
document.addEventListener("edukors:document-saved", (event) => {
  const doc = event.detail.doc, code = editOf(doc).code;
  if (code) {
    if (code.written && doc.originFormat) { code.savedDoc = code.written.doc; code.bytes = code.written.bytes; }
    else code.savedDoc = code.state.doc;
    code.written = null;
  } else editOf(doc).saved = editOf(doc).state.doc;
  markModified(doc);
});
document.addEventListener("edukors:preferences-changed", () => { toolbar = null; renderCode(); renderToolbar(); renderStats(); findBar.labels(); printLabels(); });
// Clicking the empty part of the page below the text puts the cursor at the end. When the document ends with a table,
// a picture, or a shape, an empty paragraph is added after it first, so there is always a place to keep writing.
document.addEventListener("mousedown", (event) => {
  if (!view || codeOn() || sourceOn() || event.target !== page()) return;
  event.preventDefault();
  const { doc } = view.state, tr = view.state.tr;
  if (!doc.lastChild.isTextblock) tr.insert(doc.content.size, nodes.paragraph.create());
  view.dispatch(tr.setSelection(TextSelection.atEnd(tr.doc)).scrollIntoView());
  view.focus();
});

globalThis.EdukorsTextEditor = Object.freeze({
  schema,
  /** The content to save: the document's current state as JSON. */
  toJSON: (doc) => {
    if (doc.editor?.code) return codeJSON(doc.editor.code.state.doc.toString()); // a file in the code view: one code block
    if (doc.editor?.source != null) applySource(doc);
    return doc.editor ? doc.editor.state.doc.toJSON() : doc.text ?? emptyDoc().toJSON();
  },
  /**
   * Export (and saving back into a Markdown or plain-text file): a document still matching its Markdown text writes
   * that text as is. A file in the code view saves (format "code") its text with its encoding and line ending, or the
   * bytes it was read from while the text has not changed; it exports as one code block.
   */
  async exportFor(doc, format, title) {
    const code = doc.editor?.code;
    if (code) {
      const text = code.state.doc.toString();
      if (format === "code") {
        const bytes = code.bytes && code.state.doc.eq(code.savedDoc) ? code.bytes : encodeText(text, code);
        code.written = { doc: code.state.doc, bytes };
        return { data: bytes };
      }
      if (format === "txt") return { data: text };
      return exportDocument(codeJSON(text), format, title);
    }
    const json = EdukorsTextEditor.toJSON(doc), e = editOf(doc);
    if (format === "md" && e.markdown && e.state.doc.eq(e.markdown.doc)) return { data: e.markdown.text };
    const out = await exportDocument(json, format, title);
    if (format === "md" && e.markdown) e.markdown = { text: out.data, doc: e.state.doc };
    return out;
  },
  /** Checks a file's content and returns it as JSON again; throws when it is not valid. */
  check: (json) => docFromJSON(json).toJSON(),
  empty: () => emptyDoc().toJSON(),
  /** Gives a document opened or imported content; the next time it shows, it starts from it, with no undo history. */
  adopt(doc, json, { markdown } = {}) {
    doc.text = json; doc.editor = null;
    const e = editOf(doc);
    e.saved = e.state.doc;
    if (typeof markdown === "string") e.markdown = { text: markdown, doc: e.state.doc };
  },
  /** A file's bytes as text (src/editor/code-text.js): { text, eol, bom, encoding }. */
  decodeCode: decodeText,
  /**
   * Gives a document a plain-text file's content, shown in the code view: { text, ext, eol, bom, encoding, bytes? }
   * (bytes: the file as read, written back while the text has not changed).
   */
  adoptCode(doc, { text, ext, eol = "\n", bom = false, encoding = "utf-8", bytes = null }) {
    const state = newCodeState(text, ext, { wrap: wrapLines, lang: lang() });
    doc.text = codeJSON(text);
    doc.editor = { state: newState(emptyDoc()), saved: null, code: { state, savedDoc: state.doc, bytes, ext, eol, bom, encoding, lang: lang() } };
  },
  /** How a file in the code view is written ({ ext, eol, bom, encoding }), or null for a formatted document. */
  codeInfo: (doc) => { const code = doc.editor?.code; return code ? { ext: code.ext, eol: code.eol, bom: code.bom, encoding: code.encoding } : null; },
  isCode,
  /** Selects the whole active document (the menu's Select All outside a text field). */
  selectAll() {
    if (codeOn() && codeView) { codeView.focus(); codeView.dispatch({ selection: { anchor: 0, head: codeView.state.doc.length } }); return; }
    if (view) { view.focus(); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, view.state.doc.content.size))); } },
  /** Export and Import (src/editor/convert.js): exportDocument(json, format, title), importDocument(format, bytes). */
  exportDocument, importDocument,
  /**
   * The AI assistant's operations (src/editor/ai.js), on the document its conversation belongs to, active or not:
   * read(doc) and change(doc, name, args) → result; each change is one undo step of that document.
   */
  ai: {
    // A file in the code view reads as one code block; the assistant does not change it.
    read: (doc) => ai.readDocument(isCode(doc) ? newState(docFromJSON(EdukorsTextEditor.toJSON(doc))) : editOf(doc).state),
    change(doc, name, args) {
      if (isCode(doc)) throw new Error("This is a code or plain-text file: the assistant can read it but not change it.");
      const operation = { insert_content: ai.insertContent, replace_blocks: ai.replaceBlocks, set_block_style: ai.setBlockStyle, format_text: ai.formatText,
        replace_text: ai.replaceText, insert_shape: ai.insertShape, insert_image: ai.insertImage }[name];
      if (!operation) throw new Error(`Unknown change "${name}".`);
      // A source being edited goes into the document first; afterwards the source shows the result.
      if (editOf(doc).source != null) applySource(doc);
      const { tr, result } = operation(editOf(doc).state, args);
      applyTr(doc, tr);
      if (editOf(doc).source != null) { editOf(doc).source = sourceOf(doc); if (doc === active) renderSource(); }
      return result;
    },
  },
  /** The pictures of all open documents (key → { blob, url }); document.js saves and opens them as package parts. */
  media,
  get view() { return view; },
});
