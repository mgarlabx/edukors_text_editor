// Page breaks shown on the continuous page: where each A4 page of the PDF ends. The page uses the PDF's measures
// (A4, 20 mm margins; text area 170 × 257 mm), so the marks fall where the PDF breaks, give or take the one line that
// the PDF moves to the next page instead of cutting it.
const MM = 96 / 25.4;
export const PAGE_MARGIN = 20 * MM;      // 75.6 px
export const PAGE_TEXT_HEIGHT = 257 * MM; // 971.3 px

/** Draws (or removes) the marks inside the page; the page grows to whole pages while they show. */
export function renderPageBreaks(host, content, on, label) {
  let layer = host.querySelector(":scope > .page-breaks");
  if (!on) { layer?.remove(); host.style.minHeight = ""; return; }
  if (!layer) { layer = document.createElement("div"); layer.className = "page-breaks"; layer.setAttribute("aria-hidden", "true"); host.append(layer); }
  const pages = Math.max(1, Math.ceil((content.offsetHeight + 1) / PAGE_TEXT_HEIGHT));
  host.style.minHeight = `${PAGE_MARGIN * 2 + pages * PAGE_TEXT_HEIGHT}px`;
  const marks = [];
  for (let n = 1; n < pages; n++) {
    const mark = document.createElement("div");
    mark.className = "page-break";
    mark.style.top = `${PAGE_MARGIN + n * PAGE_TEXT_HEIGHT}px`;
    mark.dataset.label = label(n + 1);
    marks.push(mark);
  }
  layer.replaceChildren(...marks);
}
