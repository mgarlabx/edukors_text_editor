// Line spacing that follows the text. Every line of a paragraph is at least as tall as the paragraph's own font size
// (the browser's "strut"), and a font size is a mark (a span) inside it, so text made smaller kept the spacing of the
// paragraph's default size. This plugin only changes what is shown, never the document or its exports: when the
// smallest text of a paragraph or heading is smaller than the block's default size, the block is shown at that size,
// and its text that has no size of its own is shown at the default size, as before.
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { schema, DEFAULT_SIZE } from "./schema.js";

// The blocks' default sizes in points (editor.css): the page's 12 pt, and headings of levels 1–3.
const HEADING_SIZE = { 1: 24, 2: 18, 3: 14 };

function decorate(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const base = node.type === schema.nodes.heading ? HEADING_SIZE[node.attrs.level] : DEFAULT_SIZE;
    const runs = [];
    node.forEach((child, offset) => {
      if (child.isText) runs.push({ from: pos + 1 + offset, to: pos + 1 + offset + child.nodeSize, size: schema.marks.size.isInSet(child.marks)?.attrs.size ?? null });
    });
    const smallest = Math.min(...runs.map((run) => run.size ?? base));
    if (!(smallest < base)) return false;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `font-size: ${smallest}pt` }));
    for (const run of runs) if (run.size === null) decorations.push(Decoration.inline(run.from, run.to, { style: `font-size: ${base}pt` }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const lineSpacingPlugin = () => new Plugin({
  state: {
    init: (config, state) => decorate(state.doc),
    apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set),
  },
  props: { decorations(state) { return this.getState(state); } },
});
