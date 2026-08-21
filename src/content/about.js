(function () {
  const ns = (window.__LNP_NS__ = window.__LNP_NS__ || {});

  function cleanAboutText(text) {
    if (!text) return '';
    let txt = text.trim();

    txt = txt.replace(/(?:\n|^)\s*(?:Top skills|Principales aptitudes|Habilidades principales|Öne çıkan yetenekler)[\s\S]*$/i, '');
    txt = txt.replace(/(?:\.{2,}|…)\s*(?:see\s*more|ver\s*m[aá]s|show\s*more|more|daha\s*fazla)\s*$/i, '');
    txt = txt.replace(/\s+(?:see\s*more|ver\s*m[aá]s|show\s*more|more|daha\s*fazla)\s*$/i, '');
    txt = txt.replace(/^(?:about|summary|acerca de|sobre|resumen|samenvatting)\s*[\n\r:]*\s*/i, '');

    const paragraphs = txt
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => {
        return p
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n');
      })
      .filter(Boolean);

    let result = paragraphs.join('\n\n');

    result = result.replace(
      /(Top skills|Principales aptitudes|Habilidades principales)(?=[A-Za-zÀ-ÿ])/gi,
      '$1 ',
    );

    result = result.replace(/(?:\.{2,}|…)\s*(?:more|m[aá]s|daha\s*fazla)?\s*$/i, '').trim();

    return result;
  }

  ns.extractAbout = function extractAbout() {
    const sec = ns.getSectionRoot
      ? ns.getSectionRoot('about')
      : ns.findSection && ns.findSection(/about/i);

    if (!sec) return undefined;

    let txt = '';
    const node =
      sec.querySelector('.inline-show-more-text') ||
      sec.querySelector('[class*="inline-show-more-text"]') ||
      sec.querySelector('div.display-flex.full-width') ||
      sec.querySelector('.pv-shared-text-with-see-more');

    if (node) {
      txt = node.innerText || node.textContent || '';
    } else {
      const ps = Array.from(sec.querySelectorAll('p, span[aria-hidden="true"]'))
        .filter((el) => !el.closest('button, nav, h2, h1'));
      if (ps.length) {
        txt = ps.map((p) => p.innerText || p.textContent || '').join('\n\n');
      } else if (ns.sectionVisibleText) {
        txt = ns.sectionVisibleText(sec);
      }
    }

    const clean = cleanAboutText(txt);
    return clean || undefined;
  };
})();
