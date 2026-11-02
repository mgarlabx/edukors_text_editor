// Find and replace: matches of the text in the document (inside each paragraph, heading, list item, quote, code block,
// and table cell; a match never spans two of them), highlighted by a ProseMirror plugin, with commands to move between
// them and to replace one or all (Replace all is one undo step). The panel that drives them floats at the top right of
// the page (createFindBar); index.js opens it with Cmd+F (Ctrl+F), or with the replace field with Option+Cmd+F (Ctrl+H).
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const searchKey = new PluginKey("search");

const WORD = "[\\p{L}\\p{N}_]";
/** The pattern for a search { query, caseSensitive, wholeWord }: the query as plain text (no regular expressions). */
export function searchPattern({ query, caseSensitive = false, wholeWord = false } = {}) {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(wholeWord ? `(?<!${WORD})${escaped}(?!${WORD})` : escaped, caseSensitive ? "gu" : "giu");
}

/** The matches of a search in a document, in order: [{ from, to }] (document positions). */
export function findMatches(doc, search) {
  const pattern = searchPattern(search), matches = [];
  if (!pattern) return matches;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Each inline node that is not text (a line break) counts as one character no query can contain, so an index in
    // this string is the offset in the block.
    let text = "";
    node.forEach((child) => { text += child.isText ? child.text : "￼".repeat(child.nodeSize); });
    for (const match of text.matchAll(pattern)) if (match[0]) matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length });
    return false;
  });
  return matches;
}

// The first match at or after a position (the first one when none is after it); -1 without matches.
const nearest = (matches, pos) => (matches.length ? Math.max(0, matches.findIndex((m) => m.to > pos)) : -1);

function decorate(doc, matches, current) {
  if (!matches.length) return DecorationSet.empty;
  return DecorationSet.create(doc, matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? "search-match is-current" : "search-match" })));
}

/**
 * The plugin keeps, per document, the search it shows ({ query, caseSensitive, wholeWord } or null), its matches, the
 * current one, and their highlights. Transactions set them with setMeta(searchKey, { search }) or { current }; a change
 * to the document finds the matches again.
 */
export function searchPlugin() {
  return new Plugin({
    key: searchKey,
    state: {
      init: () => ({ search: null, matches: [], current: -1, decorations: DecorationSet.empty }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(searchKey);
        if (meta && "search" in meta || (tr.docChanged && value.search)) {
          const search = meta && "search" in meta ? meta.search : value.search;
          const matches = search ? findMatches(state.doc, search) : [];
          const current = meta?.current != null && meta.current < matches.length ? meta.current : nearest(matches, state.selection.from);
          return { search, matches, current, decorations: decorate(state.doc, matches, current) };
        }
        if (meta?.current != null && meta.current !== value.current) return { ...value, current: meta.current, decorations: decorate(state.doc, value.matches, meta.current) };
        return value;
      },
    },
    props: { decorations: (state) => searchKey.getState(state)?.decorations },
  });
}

export const searchState = (state) => searchKey.getState(state) ?? { search: null, matches: [], current: -1 };

/** Shows a search in a document (null clears it). */
export const setSearch = (search) => (state, dispatch) => {
  if (dispatch) dispatch(state.tr.setMeta(searchKey, { search }));
  return true;
};

/** Selects a match and scrolls to it: the one at `index`, or, with `step` (1 or -1), the next or previous one. */
export const goToMatch = ({ index, step = 0 } = {}) => (state, dispatch) => {
  const { matches, current } = searchState(state);
  if (!matches.length) return false;
  const n = matches.length;
  const i = index ?? (current < 0 ? (step < 0 ? n - 1 : 0) : (current + step + n) % n);
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, matches[i].from, matches[i].to)).setMeta(searchKey, { current: i }).scrollIntoView());
  return true;
};

// Replaces one match; the replacement keeps the formatting of the text it replaces.
const replaceIn = (tr, { from, to }, text) => (text ? tr.insertText(text, from, to) : tr.delete(from, to));

/** Replaces the current match, then the next one becomes current. */
export const replaceMatch = (text) => (state, dispatch) => {
  const { matches, current } = searchState(state);
  const match = matches[current];
  if (!match) return false;
  if (dispatch) {
    const tr = replaceIn(state.tr, match, text);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, match.from + text.length)).scrollIntoView());
  }
  return true;
};

/** Replaces every match, in one step; returns how many (0 when there are none). */
export function replaceAll(state, dispatch, text) {
  const { matches } = searchState(state);
  if (!matches.length) return 0;
  if (dispatch) {
    const tr = state.tr;
    for (const match of [...matches].reverse()) replaceIn(tr, match, text);
    dispatch(tr.scrollIntoView());
  }
  return matches.length;
}

// ---------- The panel ----------
const ICONS = {
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  expand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg>',
};
export const SEARCH_ICON = ICONS.search;

/**
 * The find and replace panel. options: t (messages), view() (the editor view shown, or null), toast(message), and
 * onChange() (called when it opens or closes). Returns { open({ replace }), close(), refresh(), isOpen, element }.
 * The search (text and options) is the same for every document; each document shows its own matches.
 */
export function createFindBar({ t, view, toast, onChange = () => {} }) {
  let search = null; // what the panel searches for while open; a new object on each change
  let opened = false, replacing = false, caseSensitive = false, wholeWord = false;

  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const button = (control, icon, label) => {
    const b = el("button", { type: "button", className: "format-button icon find-button" });
    b.dataset.control = control;
    b.innerHTML = `${icon}<span class="tooltip" aria-hidden="true"></span>`;
    b.addEventListener("mousedown", (event) => event.preventDefault()); // the focus stays in the field
    b.dataset.label = label;
    return b;
  };
  const textButton = (control, label) => {
    const b = el("button", { type: "button", className: "small-button find-text-button" });
    b.dataset.control = control; b.dataset.label = label;
    b.addEventListener("mousedown", (event) => event.preventDefault());
    return b;
  };

  const dock = el("div", { className: "find-dock" });
  const panel = el("div", { className: "find-panel" });
  panel.setAttribute("role", "search");
  const toggle = button("toggleReplace", ICONS.expand, "findToggleReplace");
  const input = el("input", { type: "text", className: "find-input", spellcheck: false, autocomplete: "off" });
  const count = el("span", { className: "find-count" });
  count.setAttribute("aria-live", "polite");
  const prev = button("previous", ICONS.up, "findPrevious"), next = button("next", ICONS.down, "findNext");
  const matchCase = button("matchCase", '<span class="find-option" aria-hidden="true">Aa</span>', "findMatchCase");
  const word = button("wholeWord", '<span class="find-option find-word" aria-hidden="true">ab</span>', "findWholeWord");
  const close = button("close", ICONS.close, "close");
  const replaceInput = el("input", { type: "text", className: "find-input", spellcheck: false, autocomplete: "off" });
  const replaceOne = textButton("replace", "replaceOne"), replaceEvery = textButton("replaceAll", "replaceAll");
  const findRow = el("div", { className: "find-row" }), replaceRow = el("div", { className: "find-row find-replace-row" });
  findRow.append(toggle, input, count, prev, next, matchCase, word, close);
  replaceRow.append(replaceInput, replaceOne, replaceEvery);
  panel.append(findRow, replaceRow);
  dock.append(panel);
  replaceInput.id = "find-replace-input";
  toggle.setAttribute("aria-controls", "find-replace-input");

  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  function labels() {
    panel.setAttribute("aria-label", t("findReplace"));
    input.placeholder = t("findPlaceholder"); input.setAttribute("aria-label", t("findPlaceholder"));
    replaceInput.placeholder = t("replacePlaceholder"); replaceInput.setAttribute("aria-label", t("replacePlaceholder"));
    for (const b of [toggle, prev, next, matchCase, word, close]) { b.setAttribute("aria-label", t(b.dataset.label)); b.querySelector(".tooltip").textContent = t(b.dataset.label); }
    for (const b of [replaceOne, replaceEvery]) b.textContent = t(b.dataset.label);
  }

  // The current view shows the panel's search (or none while the panel is closed).
  function apply() {
    const v = view();
    if (!v) return;
    const wanted = opened ? search : null;
    if (searchState(v.state).search !== wanted) setSearch(wanted)(v.state, v.dispatch);
  }
  function refresh() {
    if (!opened) return;
    apply();
    const v = view();
    const { matches, current } = v ? searchState(v.state) : { matches: [], current: -1 };
    count.textContent = !input.value ? "" : matches.length ? fill(t("findCount"), { n: current + 1, total: matches.length }) : t("findNone");
    panel.classList.toggle("has-none", !!input.value && !matches.length);
    const none = !matches.length;
    for (const b of [prev, next, replaceOne, replaceEvery]) { if (none) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
    toggle.setAttribute("aria-expanded", String(replacing));
    toggle.classList.toggle("is-expanded", replacing);
    replaceRow.hidden = !replacing;
    matchCase.setAttribute("aria-pressed", String(caseSensitive));
    word.setAttribute("aria-pressed", String(wholeWord));
  }
  function update() {
    search = input.value ? { query: input.value, caseSensitive, wholeWord } : null;
    refresh();
  }
  const run = (command) => { const v = view(); if (v) command(v.state, v.dispatch); refresh(); };
  const move = (step) => run(goToMatch({ step }));

  function open({ replace = false } = {}) {
    const v = view();
    if (!v) return;
    labels();
    // A short selection on one line becomes the text to find.
    const { from, to, empty } = v.state.selection;
    const selected = empty ? "" : v.state.doc.textBetween(from, to, "\n");
    if (selected && selected.length <= 200 && !selected.includes("\n")) input.value = selected;
    if (replace) replacing = true;
    if (!opened) { opened = true; dock.hidden = false; onChange(); }
    update();
    (replace && input.value ? replaceInput : input).focus();
    (replace && input.value ? replaceInput : input).select();
  }
  function hide({ focus = true } = {}) {
    if (!opened) return;
    opened = false; dock.hidden = true;
    apply();
    onChange();
    if (focus) view()?.focus();
  }

  input.addEventListener("input", () => { update(); const v = view(); if (v && searchState(v.state).matches.length) move(0); });
  for (const field of [input, replaceInput]) field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); hide(); return; }
    if (event.key === "Enter" && field === input) { event.preventDefault(); move(event.shiftKey ? -1 : 1); return; }
    if (event.key === "Enter" && field === replaceInput) { event.preventDefault(); if (event.metaKey || event.ctrlKey) replaceEvery.click(); else replaceOne.click(); }
  });
  toggle.addEventListener("click", () => { replacing = !replacing; refresh(); (replacing ? replaceInput : input).focus(); });
  prev.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  matchCase.addEventListener("click", () => { caseSensitive = !caseSensitive; update(); });
  word.addEventListener("click", () => { wholeWord = !wholeWord; update(); });
  close.addEventListener("click", () => hide());
  replaceOne.addEventListener("click", () => {
    if (replaceOne.getAttribute("aria-disabled") === "true") return;
    run(replaceMatch(replaceInput.value));
    move(0);
  });
  replaceEvery.addEventListener("click", () => {
    const v = view();
    if (!v || replaceEvery.getAttribute("aria-disabled") === "true") return;
    const n = replaceAll(v.state, v.dispatch, replaceInput.value);
    refresh();
    if (n) toast(fill(t("replacedCount"), { count: n }));
  });
  dock.hidden = true;

  return {
    element: dock, open, close: hide, refresh,
    /** After the view shows another document: it shows the panel's search, or none while the panel is closed. */
    sync: () => { apply(); refresh(); },
    labels: () => { labels(); refresh(); },
    get isOpen() { return opened; },
  };
}
