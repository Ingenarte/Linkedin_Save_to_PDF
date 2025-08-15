// src/content/about.js
(function (ns) {
  // Local, self-contained utilities (no external deps)
  const Q = (sel, root = document) => root.querySelector(sel);
  const QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const T = (el) => ((el && el.textContent) || '').trim();
  const norm = (s) => (s ? s.replace(/\s+/g, ' ').trim() : s);

  // Prefer the node LinkedIn marks as presentable; they often duplicate with aria-hidden
  function pickVisibleText(nodes) {
    const arr = Array.from(nodes || []);
    const ariaHiddenTrue = arr.find(
      (n) => n.getAttribute && n.getAttribute('aria-hidden') === 'true'
    );
    return T(ariaHiddenTrue || arr[0] || null);
  }

  // Remove “see more/show more/mostrar más” artifacts (with/without ellipsis)
  function stripSeeMore(s) {
    if (!s) return s;
    return s
      .replace(/\u2026?\s*see more/gi, '')
      .replace(/\u2026?\s*show more/gi, '')
      .replace(/\u2026?\s*mostrar m[aá]s/gi, '')
      .replace(/\s*\.\.\.\s*$/, '')
      .trim();
  }

  // Remove sentence-level duplicates and collapse “texttext” pattern
  function dedupeSentences(s) {
    if (!s) return s;

    // Split on sentence boundaries (., !, ?) or newlines
    const rawParts = s
      .split(/(?<=[.!?])\s+|\n+/)
      .map((x) => norm(x))
      .filter(Boolean);

    const out = [];
    const seen = new Set();
    for (let part of rawParts) {
      // Collapse “texttext”
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

  function hasHeader(sec, re) {
    const h = sec.querySelector('h2, h3, header h2, header h3');
    return re.test((h && h.textContent) || '');
  }

  function findSection(re) {
    const sections = QA("section, main section, div[role='region']");
    return sections.find((sec) => hasHeader(sec, re));
  }

  ns.extractAbout = function extractAbout() {
    // 1) Locate the About section (avoid capturing the title node)
    const sec =
      findSection(/about/i) || Q('section[id*="about"], div[id*="about"]');

    if (!sec) return undefined;

    // 2) Likely content containers; prioritize inline-show-more-text
    const candidates = [
      sec.querySelector('.inline-show-more-text'),
      sec.querySelector('div.display-flex.full-width'),
      sec.querySelector('div:not(:has(h2,h3))'),
      sec.querySelector('p'),
    ].filter(Boolean);

    if (!candidates.length) return undefined;

    // 3) Extract visible text (avoid the duplicate accessibility copy)
    let raw = '';
    const node = candidates[0];

    // inline-show-more-text usually contains multiple spans
    const innerSpans = node ? node.querySelectorAll('span') : null;
    if (innerSpans && innerSpans.length) {
      raw = pickVisibleText(innerSpans);
    } else {
      raw = T(node);
    }

    // 4) Clean noise and duplicates
    let txt = norm(raw);
    txt = stripSeeMore(txt);
    txt = dedupeSentences(txt);

    // 5) Ensure the header “About” isn’t glued to the text
    txt = txt.replace(/^about\s*/i, '').trim();

    return txt || undefined;
  };
})(window.__LNP_NS__ || (window.__LNP_NS__ = {}));
