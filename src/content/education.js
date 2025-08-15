// education.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractEducation = function extractEducation() {
    const { findSection, QA, Q, T, norm } = ns;
    const sec = findSection(/education/i);
    if (!sec) return undefined;
    const items = [];
    const rows = QA('li, article', sec);
    for (const r of rows) {
      const school = norm(T(Q('h3', r)) || T(Q('a span', r)));
      const degree = norm(T(Q('span.t-14.t-normal', r)));
      const meta = norm(T(Q('span.t-14.t-normal.t-black--light', r))) || '';
      const m = meta.match(/(\d{4}).*?(Present|\d{4})/i);
      const startDate = m?.[1];
      const endDate = m?.[2];
      if (school) items.push({ school, degree, startDate, endDate });
    }
    return items.length ? items : undefined;
  };
})();
