// src/content/about.js
//
// Extracts the About section text. The 2026 LinkedIn DOM renders the
// expandable "... more" indicator as a positioned <button> overlay with
// `data-testid="expandable-text-button"`; the FULL text is always
// already in the DOM. So we just need to walk the section text while
// excluding any control nodes, then strip locale-specific "see more"
// trailers as a defense in depth.
//
// Legacy DOM is also supported via `inline-show-more-text` containers.

(function () {
  const ns = (window.__LNP_NS__ = window.__LNP_NS__ || {});

  // Sentence-level dedupe to collapse "TextText" patterns LinkedIn
  // sometimes ships in screen-reader copies.
  function dedupeSentences(s) {
    if (!s) return s;
    const norm = ns.norm;
    const rawParts = s
      .split(/(?<=[.!?])\s+|\n+/)
      .map((x) => norm(x))
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (let part of rawParts) {
      if (part.length % 2 === 0) {
        const half = part.slice(0, part.length / 2);
        if (half && part === half + half) part = half;
      }
      const key = part.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(part);
      }
    }
    return out.join(' ');
  }

  ns.extractAbout = function extractAbout() {
    const sec = ns.getSectionRoot
      ? ns.getSectionRoot('about')
      : ns.findSection && ns.findSection(/about/i);

    if (!sec) return undefined;

    // Preferred path: visible text minus controls. Works on 2026 SDUI
    // where the section has an aria-hidden truncation button overlaid
    // on top of the actual text.
    let txt = ns.sectionVisibleText ? ns.sectionVisibleText(sec) : '';

    // Legacy path: inline-show-more-text wrapper carries both the
    // visible span and an aria-hidden mirror; pickVisibleText handles
    // both shapes. Only consulted when the SDUI walk came up empty.
    if (!txt) {
      const node =
        sec.querySelector('.inline-show-more-text') ||
        sec.querySelector('div.display-flex.full-width') ||
        sec.querySelector('p');
      if (node) {
        const innerSpans = node.querySelectorAll('span');
        if (innerSpans && innerSpans.length) {
          txt = ns.pickVisibleText(innerSpans);
        } else {
          txt = ns.T(node);
        }
      }
    }

    txt = ns.norm(txt);
    txt = ns.stripSeeMore ? ns.stripSeeMore(txt) : txt;

    // Strip the leading section header so it does not leak into the
    // body text ("AboutI hold a degree..." -> "I hold a degree...").
    txt = txt.replace(/^about\s*/i, '');
    txt = txt.replace(/^acerca de\s*/i, '');
    txt = txt.replace(/^sobre\s*/i, '');

    txt = dedupeSentences(txt);

    return txt || undefined;
  };
})();
