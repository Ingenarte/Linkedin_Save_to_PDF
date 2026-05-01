// honors.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractHonorsAwards = function extractHonorsAwards() {
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
        key: 'honors',
        heading: /honors|awards|logros|distinciones|premios/i,
      }) ||
      Q('section[id*="honors"], section[id*="awards"]') ||
      Q('section[aria-label*="honor" i], section[aria-label*="award" i]');
    if (!sec) return undefined;

    const out = [];

    // 2026 SDUI: spans = [title, issuer?, "MMM YYYY"?, "Associated with X"?, ...].
    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        if (!spans.length || spans.some(isAdNoise)) continue;
        // Skip rows that are pure metadata fragments like
        // "Associated with X" (these are sub-spans of a previous row
        // wrongly captured as their own row).
        if (/^associated with\b/i.test(spans[0])) continue;
        const title = dedupeText(spans[0]);
        if (isAdNoise(title)) continue;
        // Find date span if any.
        let date, issuer;
        for (let i = 1; i < spans.length; i++) {
          const s = spans[i];
          if (!date) {
            const m = s.match(/^(?:[A-Za-z]{3,}\s+)?\d{4}$/);
            if (m) {
              date = s;
              continue;
            }
          }
          if (
            !issuer &&
            s.length < 80 &&
            !/^(associated with|\d+ skill)/i.test(s) &&
            !isAdNoise(s)
          ) {
            issuer = s;
          }
        }
        if (title && !isAdNoise(issuer) && !isAdNoise(date))
          out.push({ title, issuer, date });
      }
      if (out.length) {
        const clean = cleanItems(out);
        if (clean.length) return clean;
      }
    }

    const rows = QA('li, article', sec);
    for (const r of rows) {
      const title =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      const issuer =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
      const meta =
        norm(T(r.querySelector('span.t-14.t-normal.t-black--light'))) || '';
      const m = meta.match(/[A-Za-z]{3,}\s+\d{4}|\b\d{4}\b/);
      const date = m ? norm(m[0]) : undefined;

      if (
        title &&
        !isAdNoise(title) &&
        !isAdNoise(issuer) &&
        !isAdNoise(date)
      )
        out.push({ title: dedupeText(title), issuer, date });
    }
    const clean = cleanItems(out);
    return clean.length ? clean : undefined;
  };
})();
