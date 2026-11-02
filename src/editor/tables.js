// Inserting a table: a grid under the Insert table button where the person picks the size (rows × columns, the first
// row a header row). Mouse: hover and click. Keyboard: arrows change the size, Enter inserts, Escape closes.
import { TextSelection } from "prosemirror-state";
import { schema } from "./schema.js";

const { nodes } = schema;
const MAX = 8;
let open = null;

export function createTable(rows, cols) {
  const cell = (type) => type.create(null, nodes.paragraph.create());
  return nodes.table.create(null, Array.from({ length: rows }, (_, r) =>
    nodes.table_row.create(null, Array.from({ length: cols }, () => cell(r === 0 ? nodes.table_header : nodes.table_cell)))));
}

export function insertTable(view, rows, cols) {
  const table = createTable(rows, cols), tr = view.state.tr.replaceSelectionWith(table);
  let at = null;
  tr.doc.descendants((node, pos) => { if (at === null && node === table) { at = pos; return false; } return at === null; });
  if (at !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))); // the cursor in the first cell
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function closePicker() { open?.close(); }

/** Opens the size grid at x, y; onPick(rows, cols). */
export function pickTableSize({ x, y, t, onPick, restoreFocus }) {
  closePicker();
  const panel = document.createElement("div");
  panel.className = "table-picker";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t("insertTable"));
  const grid = document.createElement("div");
  grid.className = "table-picker-grid";
  const label = document.createElement("p");
  label.className = "table-picker-size";
  label.setAttribute("aria-live", "polite");
  let size = { rows: 3, cols: 3 };
  const cells = [];
  for (let r = 1; r <= MAX; r++) for (let c = 1; c <= MAX; c++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.tabIndex = -1;
    cell.dataset.rows = r; cell.dataset.cols = c;
    cell.setAttribute("aria-label", t("tableSize").replace("{rows}", r).replace("{cols}", c));
    cell.addEventListener("mouseenter", () => show({ rows: r, cols: c }));
    cell.addEventListener("click", () => choose());
    cells.push(cell);
  }
  grid.append(...cells);
  panel.append(grid, label);
  function show(next) {
    size = next;
    for (const cell of cells) cell.classList.toggle("is-on", cell.dataset.rows <= size.rows && cell.dataset.cols <= size.cols);
    label.textContent = t("tableSize").replace("{rows}", size.rows).replace("{cols}", size.cols);
    cells[(size.rows - 1) * MAX + size.cols - 1].focus({ preventScroll: true });
  }
  function choose() { const { rows, cols } = size; close(); onPick(rows, cols); }
  function close(restore = false) {
    if (open?.panel !== panel) return;
    open = null;
    panel.remove();
    document.removeEventListener("pointerdown", outside, true);
    if (restore) restoreFocus?.focus();
  }
  const outside = (event) => { if (!panel.contains(event.target)) close(); };
  panel.addEventListener("keydown", (event) => {
    const step = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[event.key];
    if (step) { event.preventDefault(); show({ rows: Math.min(MAX, Math.max(1, size.rows + step[0])), cols: Math.min(MAX, Math.max(1, size.cols + step[1])) }); }
    else if (event.key === "Enter") { event.preventDefault(); choose(); }
    else if (event.key === "Escape") { event.preventDefault(); close(true); }
  });
  document.body.append(panel);
  panel.style.left = `${Math.max(4, Math.min(x, innerWidth - panel.offsetWidth - 4))}px`;
  panel.style.top = `${Math.max(4, Math.min(y, innerHeight - panel.offsetHeight - 4))}px`;
  document.addEventListener("pointerdown", outside, true);
  open = { panel, close };
  show(size);
}
