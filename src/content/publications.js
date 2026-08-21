(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractPublications = function extractPublications() {
    const { findSection, Q, QA, pickVisibleText, norm, T, dedupeText } = ns;
    const isAdNoise =
      typeof ns.isLinkedInAdOrPreferenceText === 'function'
        ? ns.isLinkedInAdOrPreferenceText
        : () => false;
    const cleanItems =
      typeof ns.withoutLinkedInAdPreferenceItems === 'function'
        ? ns.withoutLinkedInAdPreferenceItems
        : (items) => items;
    const rootResolver = ns.getSectionRoot || findSection;
    const sec =
      rootResolver({
        key: 'publications',
        heading: /publications|publicaciones/i,
      }) ||
      Q('section[id*="publications"]') ||
      Q('section[aria-label*="publication" i]');
    if (!sec) return undefined;

    const out = [];

    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        if (!spans.length || spans.some(isAdNoise)) continue;
        let title = dedupeText(spans[0]);
        if (!title || /^show publication/i.test(title) || isAdNoise(title) || /nothing to see for now|when you add new publications|show up here/i.test(title))
          continue;
        let source, date, description;
        for (let i = 1; i < spans.length; i++) {
          const s = spans[i];
          if (/^show publication/i.test(s) || isAdNoise(s)) continue;
          const dotMatch = s.match(
            /^(.+?)\s*[·•]\s*([A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}|[A-Za-z]{3,}\s+\d{4}|\d{4})$/,
          );
          if (dotMatch && !source) {
            source = dotMatch[1].trim();
            date = dotMatch[2].trim();
            continue;
          }
          const dOnly = s.match(/^(?:[A-Za-z]{3,}\s+\d{1,2},?\s*)?\d{4}$/);
          if (dOnly && !date) {
            date = s;
            continue;
          }
          if (!source) {
            source = s;
            continue;
          }
          if (!description && s.length > 30) description = s;
        }
        if (
          !isAdNoise(source) &&
          !isAdNoise(date) &&
          !isAdNoise(description)
        )
          out.push({ title, source, date, description });
      }
      if (out.length) {
        const clean = cleanItems(out);
        if (clean.length) return clean;
      }
    }

    const rows = QA('li, article', sec);
    for (const r of rows) {
      let title =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      if (/show publication/i.test(title || '')) title = undefined;

      const source =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]'),
          ),
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
                'p, div.inline-show-more-text, .pv-shared-text-with-see-more',
              ),
            ),
          ),
        ) || undefined;

      if (
        title &&
        !isAdNoise(title) &&
        !isAdNoise(source) &&
        !isAdNoise(date) &&
        !isAdNoise(description)
      )
        out.push({ title: dedupeText(title), source, date, description });
    }
    const clean = cleanItems(out);
    return clean.length ? clean : undefined;
  };
})();
