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

  function cleanAboutText(text) {
    if (!text) return '';
    let txt = text.trim();

    txt = txt.replace(
      /(?:\n|^)\s*(?:Top skills|Principales aptitudes|Habilidades principales|Öne çıkan yetenekler)[\s\S]*$/i,
      '',
    );
    txt = ns.stripSeeMore ? ns.stripSeeMore(txt) : txt;
    txt = txt.replace(
      /(?:\.{2,}|…)\s*(?:see\s*more|ver\s*m[aá]s|show\s*more|more|daha\s*fazla)\s*$/i,
      '',
    );
    txt = txt.replace(
      /\s+(?:see\s*more|ver\s*m[aá]s|show\s*more|more|daha\s*fazla)\s*$/i,
      '',
    );
    txt = txt.replace(
      /^(?:about|summary|acerca de|sobre|resumen|samenvatting)\s*[\n\r:]*\s*/i,
      '',
    );

    // 2026 SDUI often concatenates sentences without a space after `.`
    // ("tecnología.He trabajado"). Repair before sentence split/dedupe.
    txt = txt
      .replace(/([.!?])([A-ZÁÉÍÓÚÜÑ¿¡])/g, '$1 $2')
      .replace(/([a-záéíóúüñ])•/gi, '$1 •')
      .replace(/([:;,])•/g, '$1 •');

    const paragraphs = txt
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => {
        const joined = p
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n');
        return dedupeSentences(joined);
      })
      .filter(Boolean);

    let result = paragraphs.join('\n\n');

    result = result.replace(
      /(Top skills|Principales aptitudes|Habilidades principales)(?=[A-Za-zÀ-ÿ])/gi,
      '$1 ',
    );

    result = result
      .replace(/(?:\.{2,}|…)\s*(?:more|m[aá]s|daha\s*fazla)?\s*$/i, '')
      .trim();

    return result;
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
        sec.querySelector('[class*="inline-show-more-text"]') ||
        sec.querySelector('div.display-flex.full-width') ||
        sec.querySelector('.pv-shared-text-with-see-more') ||
        sec.querySelector('p');
      if (node) {
        const innerSpans = node.querySelectorAll('span');
        if (innerSpans && innerSpans.length && ns.pickVisibleText) {
          txt = ns.pickVisibleText(innerSpans);
        } else {
          txt = ns.T ? ns.T(node) : node.textContent || '';
        }
      }
    }

    const clean = cleanAboutText(txt);
    return clean || undefined;
  };
})();
