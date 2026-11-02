// Images and shapes on the page: how they show (a node view with a resize handle), and how Insert adds them.
// Both are blocks between paragraphs, aligned left, center, or right, at most the page's text width.
import { NodeSelection } from "prosemirror-state";
import { schema, media } from "./schema.js";

export const CONTENT_WIDTH = 642; // the A4 text width at 96 dpi (170 mm), as in the PDF
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Selects the node at pos (after inserting or changing it, so the format bar shows its controls).
const selectAt = (tr, pos) => tr.setSelection(NodeSelection.create(tr.doc, pos));

export class MediaView {
  constructor(node, view, getPos) {
    this.node = node; this.view = view; this.getPos = getPos;
    this.dom = document.createElement("figure");
    this.dom.className = `doc-media doc-${node.type.name}`;
    this.box = document.createElement("span");
    this.box.className = "doc-media-box";
    this.handle = document.createElement("span");
    this.handle.className = "doc-media-handle";
    this.handle.setAttribute("aria-hidden", "true");
    this.box.append(this.handle);
    this.dom.append(this.box);
    this.handle.addEventListener("pointerdown", (event) => this.resize(event));
    this.render();
  }

  render(size) {
    const { attrs } = this.node;
    this.dom.dataset.align = attrs.align;
    if (this.node.type === schema.nodes.image) {
      let img = this.box.querySelector("img");
      if (!img) { img = document.createElement("img"); img.draggable = false; this.box.prepend(img); }
      const url = media.url(attrs.src);
      if (img.getAttribute("src") !== url) img.src = url;
      img.alt = attrs.alt;
      img.style.width = size ? `${size.w}px` : attrs.width ? `${attrs.width}px` : "";
    } else {
      this.box.querySelector("svg")?.remove();
      this.box.insertAdjacentHTML("afterbegin", EdukorsShapes.svg(attrs, size?.w ?? attrs.width, size?.h ?? attrs.height));
    }
  }

  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.render(); return true; }
  selectNode() { this.dom.classList.add("is-selected"); }
  deselectNode() { this.dom.classList.remove("is-selected"); }
  stopEvent(event) { return event.target === this.handle; }
  ignoreMutation() { return true; }

  // Dragging the handle resizes: pictures (and shapes that keep their proportions) keep their aspect; the change is one
  // undo step, made when the drag ends.
  resize(event) {
    event.preventDefault(); event.stopPropagation();
    const art = this.box.firstElementChild, rect = art.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, w: rect.width, h: rect.height };
    const isShape = this.node.type === schema.nodes.shape, keep = !isShape || this.node.attrs.keepRatio;
    // A centered block grows on both sides; a right-aligned one grows to the left (its handle is on the left).
    const factor = { center: 2, left: 1, right: -1 }[this.node.attrs.align];
    let size = { w: start.w, h: start.h };
    this.handle.setPointerCapture(event.pointerId);
    const move = (e) => {
      const w = clamp(start.w + (e.clientX - start.x) * factor, 16, CONTENT_WIDTH);
      size = { w: Math.round(w), h: Math.round(keep ? (w * start.h) / start.w : clamp(start.h + (e.clientY - start.y), 16, 2000)) };
      this.render(size);
    };
    const end = () => {
      this.handle.removeEventListener("pointermove", move);
      this.handle.removeEventListener("pointerup", end);
      this.handle.removeEventListener("pointercancel", end);
      const pos = this.getPos();
      if (pos === undefined || (size.w === Math.round(start.w) && size.h === Math.round(start.h))) { this.render(); return; }
      const attrs = { ...this.node.attrs, width: size.w, ...(isShape ? { height: size.h } : {}) };
      this.view.dispatch(selectAt(this.view.state.tr.setNodeMarkup(pos, null, attrs), pos));
    };
    this.handle.addEventListener("pointermove", move);
    this.handle.addEventListener("pointerup", end);
    this.handle.addEventListener("pointercancel", end);
  }
}

export const nodeViews = { image: (...args) => new MediaView(...args), shape: (...args) => new MediaView(...args) };

/** Inserts a block where the selection is and selects it. */
export function insertBlock(view, node) {
  const tr = view.state.tr.replaceSelectionWith(node);
  let at = null;
  tr.doc.descendants((child, pos) => { if (at === null && child === node) { at = pos; return false; } return at === null; });
  if (at !== null) selectAt(tr, at);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function insertShape(view, shapeType) {
  const square = EdukorsShapes.square(shapeType);
  insertBlock(view, schema.nodes.shape.create({ shapeType, width: square ? 140 : 220, height: square ? 140 : 130 }));
}

// The picture's own width, for pictures wider than the page.
const naturalWidth = (url) => new Promise((resolve) => {
  const probe = new Image();
  probe.onload = () => resolve(probe.naturalWidth || 0);
  probe.onerror = () => resolve(0);
  probe.src = url;
});

/** Asks for a picture file and inserts it; returns false when the file is not a picture the app can keep. */
export function insertImageFromFile(view, onRefused) {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/avif" });
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const key = media.put(file);
    if (!key) { onRefused?.(file.name); return; }
    const natural = await naturalWidth(media.url(key));
    insertBlock(view, schema.nodes.image.create({ src: key, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 500), width: natural > CONTENT_WIDTH ? CONTENT_WIDTH : null }));
  });
  input.click();
}
