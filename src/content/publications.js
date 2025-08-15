// publications.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractPublications = function extractPublications() {
    const { findSection, Q, QA, pickVisibleText, norm, T, dedupeText } = ns;
    const sec =
      findSection(/publications|publicaciones/i) ||
      Q('section[id*="publications"]') ||
      Q('section[aria-label*="publication" i]');
    if (!sec) return undefined;

    const out = [];
    const rows = QA('li, article', sec);
    for (const r of rows) {
      let title =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      if (/show publication/i.test(title || '')) title = undefined;

      const source =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));

      const dateText =
        norm(T(r.querySelector('span.t-14.t-normal.t-black--light'))) ||
        norm(T(r));
      const mDate =
        (dateText && dateText.match(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/)) ||
        (dateText && dateText.match(/[A-Za-z]{3,}\s+\d{4}|\b\d{4}\b/));
      const date = mDate ? norm(mDate[0]) : undefined;

      const description =
        dedupeText(
          norm(
            T(
              r.querySelector(
                'p, div.inline-show-more-text, .pv-shared-text-with-see-more'
              )
            )
          )
        ) || undefined;

      if (title)
        out.push({ title: dedupeText(title), source, date, description });
    }
    return out.length ? out : undefined;
  };
})();
