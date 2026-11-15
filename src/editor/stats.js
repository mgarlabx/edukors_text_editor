// The footer's count of the selected text: characters (as people see them, so an accented letter or an emoji is one;
// line breaks are not counted) and words (in any language, by the browser's word segmenter).
const graphemes = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const words = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/** { chars, words } of a text. */
export function countText(text) {
  const flat = text.replace(/\r?\n/g, "");
  let chars = 0, count = 0;
  if (graphemes) for (const _ of graphemes.segment(flat)) chars++;
  else chars = [...flat].length;
  if (words) { for (const part of words.segment(text)) if (part.isWordLike) count++; }
  else count = (text.match(/[\p{L}\p{N}_]+/gu) || []).length;
  return { chars, words: count };
}
