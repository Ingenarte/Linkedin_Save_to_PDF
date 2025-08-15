// honors.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractHonorsAwards = function extractHonorsAwards() {
    const { findSection, Q, QA, pickVisibleText, norm, T, dedupeText } = ns;

    const sec =
      findSection(/honors|awards|logros|distinciones/i) ||
      Q('section[id*="honors"], section[id*="awards"]') ||
      Q('section[aria-label*="honor" i], section[aria-label*="award" i]');
    if (!sec) return undefined;

    const out = [];
    const rows = QA('li, article', sec);
    for (const r of rows) {
      const title =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      const issuer =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
      const meta =
        norm(T(r.querySelector('span.t-14.t-normal.t-black--light'))) || '';
      const m = meta.match(/[A-Za-z]{3,}\s+\d{4}|\b\d{4}\b/);
      const date = m ? norm(m[0]) : undefined;

      if (title) out.push({ title: dedupeText(title), issuer, date });
    }
    return out.length ? out : undefined;
  };
})();
