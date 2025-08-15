// languages.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractLanguages = function extractLanguages() {
    const { findSection, Q, QA, pickVisibleText, norm } = ns;
    const sec =
      findSection(/languages|idiomas/i) ||
      Q('section[id*="languages"]') ||
      Q('section[aria-label*="language" i]');
    if (!sec) return undefined;

    const out = [];
    const rows = QA('li, article', sec);
    for (const r of rows) {
      const language =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      const proficiency = norm(
        pickVisibleText(
          r.querySelectorAll('span.t-14.t-normal, span.t-12, .t-black--light')
        )
      );
      if (language)
        out.push({ language: ns.dedupeText(language), proficiency });
    }
    return out.length ? out : undefined;
  };
})();
