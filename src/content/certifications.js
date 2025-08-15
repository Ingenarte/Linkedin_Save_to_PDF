// certifications.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractCertifications = function extractCertifications() {
    const { findSection, Q, QA, T, norm, pickVisibleText, dedupeText } = ns;
    const sec =
      findSection(/licenses? *&* *certifications?/i) ||
      Q('section[id*="licenses"], section[id*="certifications"]') ||
      Q('section[aria-label*="certification" i]');
    if (!sec) return undefined;

    const items = [];
    const rows = QA('li.artdeco-list__item, li, article', sec);
    for (const r of rows) {
      let name =
        norm(
          pickVisibleText(
            r.querySelectorAll('.t-bold span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('h3, a span')));
      const issuer =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
          )
        ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
      const issuedRaw =
        norm(
          T(
            r.querySelector(
              '.t-14.t-normal.t-black--light .pvs-entity__caption-wrapper'
            )
          )
        ) ||
        norm(T(r.querySelector('.t-14.t-normal.t-black--light'))) ||
        norm(T(r));

      let issued;
      if (issuedRaw) {
        const m =
          issuedRaw.match(/(?:Issued|Expedid[oa])\s+([A-Za-z]{3,}\s+\d{4})/i) ||
          issuedRaw.match(/\b([A-Za-z]{3,}\s+\d{4})\b/);
        issued = m ? norm(m[1]) : undefined;
      }

      if (name) name = dedupeText(name);
      if (name) items.push({ name, issuer: issuer || undefined, issued });
    }
    return items.length ? items : undefined;
  };
})();
