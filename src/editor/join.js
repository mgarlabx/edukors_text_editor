// Join lines: the selected lines become one paragraph, each line after the next with a single space between them.
// In the formatted view a line is a paragraph (or heading, or code block) or a part of one between line breaks
// (Shift+Enter); the formatting of the text is kept. In the code view a line is a line of the file.
import { TextSelection } from "prosemirror-state";

/** The lines of a text as one line: the space around each line break becomes a single space; empty lines go away. */
export function joinText(text) {
  const lead = /^[ \t]*/.exec(text)[0];
  return lead + text.split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
}

// The inline content of a text block cut into lines at its line breaks (and, in a code block, at its "\n").
function linesOf(block, schema) {
  const lines = [[]];
  block.content.forEach((node) => {
    if (node.type === schema.nodes.hard_break) lines.push([]);
    else if (node.isText && node.text.includes("\n")) node.text.split("\n").forEach((part, i) => { if (i) lines.push([]); if (part) lines.at(-1).push(node.type.schema.text(part, node.marks)); });
    else lines.at(-1).push(node);
  });
  return lines;
}
// A line without the spaces at its ends (text nodes that become empty are left out).
function trimLine(line) {
  const out = [...line];
  const edge = (i, pattern) => { const node = out[i]; if (!node?.isText) return false; const text = node.text.replace(pattern, ""); if (text) out[i] = node.type.schema.text(text, node.marks); else out.splice(i, 1); return !text; };
  while (out.length && edge(0, /^\s+/));
  while (out.length && edge(out.length - 1, /\s+$/));
  return out;
}

/**
 * ProseMirror command: the text blocks the selection touches become one block of the first one's kind (a code block
 * stays a code block only when every line was code), in one undo step. Not available with an empty selection.
 */
export function joinLines(state, dispatch) {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  const schema = state.schema, blocks = [];
  state.doc.nodesBetween(from, to, (node, pos) => { if (node.isTextblock) { blocks.push({ node, pos }); return false; } return true; });
  if (!blocks.length) return false;
  const lines = blocks.flatMap(({ node }) => linesOf(node, schema)).map(trimLine).filter((line) => line.length);
  if (blocks.length === 1 && lines.length < 2 && !blocks[0].node.textContent.match(/^\s|\s$/)) return false;
  if (!dispatch) return true;
  const content = [];
  lines.forEach((line, i) => { if (i) content.push(schema.text(" ")); content.push(...line); });
  const first = blocks[0].node, last = blocks.at(-1);
  const allCode = blocks.every(({ node }) => node.type === schema.nodes.code_block);
  let joined;
  try {
    joined = first.type === schema.nodes.code_block && !allCode ? null
      : first.type.createChecked(first.attrs, first.type === schema.nodes.code_block ? content.filter((node) => node.isText).map((node) => node.mark([])) : content);
  } catch { joined = null; }
  joined ??= schema.nodes.paragraph.createChecked(null, content);
  const start = blocks[0].pos, tr = state.tr;
  tr.replaceWith(start, start + first.nodeSize, joined);
  if (blocks.length > 1) tr.delete(tr.mapping.map(start + first.nodeSize), tr.mapping.map(last.pos + last.node.nodeSize));
  const end = start + 1 + joined.content.size;
  dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 1, Math.min(end, tr.doc.content.size))).scrollIntoView());
  return true;
}
