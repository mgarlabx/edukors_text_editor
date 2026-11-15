// The code view: a plain-text file (code, data, notes) edited with CodeMirror over the whole document area, with line
// numbers, syntax colors, folding chevrons, find and replace, and line wrapping that can be turned off. Each open
// file keeps its own state (text, selection, undo history, folds); src/editor/index.js shows the active one in a
// single view. The colors come from CSS variables (src/editor/editor.css), so the view follows the light and dark
// themes.
import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, highlightSpecialChars,
  rectangularSelection, crosshairCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { foldGutter, codeFolding, foldKeymap, foldService, syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, StreamLanguage,
  indentUnit } from "@codemirror/language";
import { search, searchKeymap, openSearchPanel, closeSearchPanel, searchPanelOpen, highlightSelectionMatches } from "@codemirror/search";
import { tags, styleTags } from "@lezer/highlight";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { php } from "@codemirror/lang-php";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { joinText } from "./join.js";

export { undo, redo, undoDepth, redoDepth, openSearchPanel, closeSearchPanel, searchPanelOpen };

// Folding by indentation, for the files whose language has no syntax tree (plain text, shell, TOML, INI): a line
// folds the lines below it that are indented more.
const indentFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from), width = (text) => /^[ \t]*/.exec(text)[0].replace(/\t/g, "    ").length;
  if (!line.text.trim()) return null;
  const base = width(line.text);
  let last = null;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n);
    if (!next.text.trim()) continue;
    if (width(next.text) <= base) break;
    last = next;
  }
  return last ? { from: line.to, to: last.to } : null;
});

// JSON with its keys apart from its values: a key takes the "definition" color (blue), a string value the string color (green).
const jsonColored = () => {
  const support = json();
  support.language.parser = support.language.parser.configure({ props: [styleTags({ PropertyName: tags.definition(tags.propertyName) })] });
  return support;
};

// CSS with its custom properties (--name, var(--name)) and its pseudo-classes (:hover) in colors of their own.
const cssColored = () => {
  const support = css();
  support.language.parser = support.language.parser.configure({ props: [styleTags({ VariableName: tags.special(tags.variableName) })] });
  return support;
};

const LANGUAGES = {
  ".py": () => python(),
  ".sql": () => sql(),
  ".js": () => javascript(), ".mjs": () => javascript(), ".cjs": () => javascript(), ".jsx": () => javascript({ jsx: true }),
  ".ts": () => javascript({ typescript: true }), ".tsx": () => javascript({ typescript: true, jsx: true }),
  ".html": () => html(), ".htm": () => html(),
  ".css": () => cssColored(),
  ".php": () => php(), ".phtml": () => php(),
  ".json": () => jsonColored(),
  ".xml": () => xml(), ".svg": () => xml(),
  ".yaml": () => yaml(), ".yml": () => yaml(),
  ".sh": () => [StreamLanguage.define(shell), indentFold],
  ".toml": () => [StreamLanguage.define(toml), indentFold],
  ".ini": () => [StreamLanguage.define(properties), indentFold],
};
/** The language support for a file extension; plain text (and CSV, logs) folds by indentation and has no colors. */
export const languageFor = (ext) => (LANGUAGES[String(ext).toLowerCase()] || (() => indentFold))();

// Syntax colors: each kind of token takes a CSS variable that editor.css sets for the light and the dark theme.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.self], color: "var(--code-keyword)", fontWeight: "bold" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.docString, tags.attributeValue], color: "var(--code-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit, tags.color], color: "var(--code-number)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment, tags.meta], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.function(tags.definition(tags.variableName)), tags.macroName], color: "var(--code-function)" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.variableName), tags.standard(tags.tagName)], color: "var(--code-type)", fontWeight: "bold" },
  { tag: [tags.propertyName, tags.labelName], color: "var(--code-property)" },
  { tag: [tags.special(tags.variableName), tags.constant(tags.className)], color: "var(--code-function)" },
  { tag: tags.tagName, color: "var(--code-tag)", fontWeight: "bold" },
  { tag: tags.angleBracket, color: "var(--code-muted)" },
  { tag: tags.attributeName, color: "var(--code-property)" },
  { tag: [tags.character, tags.documentMeta], color: "var(--code-keyword)" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: "var(--code-definition)", fontWeight: "bold" },
  { tag: [tags.operator, tags.derefOperator, tags.escape, tags.processingInstruction], color: "var(--code-operator)" },
  { tag: tags.heading, color: "var(--code-keyword)", fontWeight: "bold" },
  { tag: tags.link, color: "var(--code-function)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.invalid, color: "var(--code-invalid)", textDecoration: "underline wavy" },
]);

// The words CodeMirror shows (the find panel, folding), in the interface languages this app has.
const PHRASES = {
  pt: {
    "Find": "Localizar", "Replace": "Substituir", "next": "próximo", "previous": "anterior", "all": "todos", "match case": "diferenciar maiúsculas",
    "regexp": "expressão regular", "by word": "palavra inteira", "replace": "substituir", "replace all": "substituir todos", "close": "fechar",
    "current match": "ocorrência atual", "replaced $ matches": "$ ocorrências substituídas", "replaced match on line $": "ocorrência substituída na linha $",
    "on line": "na linha", "Go to line": "Ir para a linha", "go": "ir", "Folded lines": "Linhas recolhidas", "Unfolded lines": "Linhas expandidas",
    "to": "até", "folded code": "código recolhido", "unfold": "expandir", "Fold line": "Recolher linha", "Unfold line": "Expandir linha",
    "Control character": "Caractere de controle", "Selection deleted": "Seleção apagada",
  },
  es: {
    "Find": "Buscar", "Replace": "Reemplazar", "next": "siguiente", "previous": "anterior", "all": "todos", "match case": "coincidir mayúsculas",
    "regexp": "expresión regular", "by word": "palabra completa", "replace": "reemplazar", "replace all": "reemplazar todos", "close": "cerrar",
    "current match": "coincidencia actual", "replaced $ matches": "$ coincidencias reemplazadas", "replaced match on line $": "coincidencia reemplazada en la línea $",
    "on line": "en la línea", "Go to line": "Ir a la línea", "go": "ir", "Folded lines": "Líneas plegadas", "Unfolded lines": "Líneas desplegadas",
    "to": "hasta", "folded code": "código plegado", "unfold": "desplegar", "Fold line": "Plegar línea", "Unfold line": "Desplegar línea",
    "Control character": "Carácter de control", "Selection deleted": "Selección eliminada",
  },
};
const phrasesFor = (lang) => EditorState.phrases.of(PHRASES[lang] || {});

// The folding chevrons: down when the block is open, right when it is folded.
const CHEVRON = (path) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const CHEVRON_DOWN = CHEVRON("m6 9 6 6 6-6"), CHEVRON_RIGHT = CHEVRON("m9 6 6 6-6 6");
function foldMarker(open) {
  const marker = document.createElement("span");
  marker.className = `code-fold ${open ? "is-open" : "is-folded"}`;
  marker.innerHTML = open ? CHEVRON_DOWN : CHEVRON_RIGHT;
  return marker;
}

/** Join lines in the code view: the lines the selection touches become one, with a single space between them. */
export function joinCodeLines(view) {
  const { state } = view;
  if (state.selection.ranges.every((range) => range.empty)) return false;
  const update = state.changeByRange((range) => {
    if (range.empty) return { range };
    const first = state.doc.lineAt(range.from);
    // A selection that ends at the very start of a line does not take that line.
    const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to);
    const text = state.sliceDoc(first.from, last.to), insert = joinText(text);
    if (insert === text) return { range };
    return { changes: { from: first.from, to: last.to, insert }, range: EditorSelection.range(first.from, first.from + insert.length) };
  });
  if (update.changes.empty) return true; // nothing to join: no change, no undo step
  view.dispatch(state.update(update, { scrollIntoView: true, userEvent: "input.join" }));
  return true;
}

const wrapping = new Compartment(), phrases = new Compartment();
const joinKeys = keymap.of([{ key: "Mod-Shift-j", run: joinCodeLines }]);

/** A new state for a file's text: its language from the extension, line wrapping on or off, labels in a language. */
export function newCodeState(text, ext, { wrap = true, lang = "en" } = {}) {
  return EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(), foldGutter({ markerDOM: foldMarker }), codeFolding(), highlightActiveLineGutter(), highlightSpecialChars(), history(),
      drawSelection(), dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), rectangularSelection(),
      crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }), syntaxHighlighting(highlight),
      EditorState.tabSize.of(4), indentUnit.of(/\t/.test(text) && !/^ {2,}\S/m.test(text) ? "\t" : "    "),
      joinKeys, keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      languageFor(ext),
      wrapping.of(wrap ? EditorView.lineWrapping : []),
      phrases.of(phrasesFor(lang)),
      EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    ],
  });
}

/** Whether a state wraps long lines. */
export const wraps = (state) => wrapping.get(state) === EditorView.lineWrapping;
/** The effects that turn line wrapping on or off, and that change the labels' language. */
export const setWrap = (on) => wrapping.reconfigure(on ? EditorView.lineWrapping : []);
export const setPhrases = (lang) => phrases.reconfigure(phrasesFor(lang));

/** The view, in parent; onUpdate(view, transactions) runs after every change of state (text or selection). */
export function createCodeView(parent, state, onUpdate) {
  return new EditorView({
    parent, state,
    dispatchTransactions(transactions, view) { view.update(transactions); onUpdate(view, transactions); },
  });
}

/** The selected text of a state (all its selections, one after the other). */
export const selectedText = (state) => state.selection.ranges.filter((range) => !range.empty).map((range) => state.sliceDoc(range.from, range.to)).join("\n");
