// certifications.js
(function () {
  const ns = window.__LNP_NS__ || (window.__LNP_NS__ = {});
  ns.extractCertifications = function extractCertifications() {
    const { findSection, Q, QA, T, norm, pickVisibleText, dedupeText } = ns;
    const rootResolver = ns.getSectionRoot || findSection;
    let sec =
      (ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === 'certifications' &&
      typeof ns.getDetailsComponentkeyRoot === 'function'
        ? ns.getDetailsComponentkeyRoot('certifications')
        : null) ||
      rootResolver({
        key: 'certifications',
        heading:
          /licenses? *&* *certifications?|certifications?|licencias y certificaciones|certificados?/i,
      }) ||
      Q('section[id*="licenses"], section[id*="certifications"]') ||
      Q('section[aria-label*="certification" i]');
    if (
      !sec &&
      ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === 'certifications'
    ) {
      sec =
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        undefined;
    }
    if (!sec) return undefined;

    const items = [];

    function isLikelyLinkedInAdCertification(item) {
      const blob = `${item.name || ''} ${item.issuer || ''} ${item.credentialId || ''}`.toLowerCase();
      if (!blob.trim()) return false;
      if (
        typeof ns.isLinkedInAdOrPreferenceText === 'function' &&
        ns.isLinkedInAdOrPreferenceText(blob)
      )
        return true;
      return (
        /why am i seeing this ad|seeing this ad|manage your ad preferences|don't want to see this ad|sponsored\b|recommendation transparency|ad choices/.test(
          blob,
        ) || /^more profiles for you$/i.test((item.name || '').trim())
      );
    }

    function isLikelyAdRowElement(rowEl) {
      const t = (rowEl.innerText || rowEl.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!t) return false;
      if (
        typeof ns.isLinkedInAdOrPreferenceText === 'function' &&
        ns.isLinkedInAdOrPreferenceText(t)
      )
        return true;
      return /why am i seeing this ad|seeing this ad|manage your ad preferences|don't want to see this ad|recommendation transparency|ad choices/.test(
        t,
      );
    }

    // 2026 SDUI: each cert is a <div> row. Span layout is:
    //   [name, issuer, "Issued <Mon Year>", "Credential ID ..."?, ...]
    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        if (isLikelyAdRowElement(r)) continue;
        const spans = ns.collectTextSpans(r);
        if (!spans.length) continue;
        const parsed = ns.parseRowSpans(spans);
        const name = parsed.title && dedupeText(parsed.title);
        if (!name) continue;
        const item = {
          name,
          issuer: parsed.secondary || undefined,
          issued: parsed.issued,
        };
        if (parsed.credentialId) item.credentialId = parsed.credentialId;
        if (!isLikelyLinkedInAdCertification(item)) items.push(item);
      }
      if (items.length) {
        const onCertDetails =
          ns.isDetailsPage?.() && ns.currentDetailsKind?.() === 'certifications';
        if (onCertDetails) {
          const alt = tryCompanyLogoCertRows();
          if (alt.length > items.length) {
            items.length = 0;
            for (const it of alt) items.push(it);
          }
        }
        if (items.length) return items;
      }
    }

    // LinkedIn 2026+ /details/certifications/: title is often a <p> (not h2),
    // rows are div stacks separated by <hr role="presentation">, each row
    // starts with a /company/<id>/ logo link. collectGenericRows() does not
    // model that shape; resolve rows from company anchors + "Issued" text.
    function tryCompanyLogoCertRows() {
      const mainEl =
        document.querySelector('main') || document.querySelector('[role="main"]');
      const hay = mainEl || sec;
      const titleRe =
        /licen[sc]es?\s*&\s*certifications?|^certifications$|licencias y certificaciones|certificados?/i;
      const titleCandidates = [...hay.querySelectorAll('p')].filter((p) => {
        const t = norm(p.textContent || '');
        if (t.length < 4 || t.length > 120) return false;
        return titleRe.test(t);
      });
      const titleP =
        titleCandidates.find((p) => p.closest('.scaffold-finite-scroll__content')) ||
        titleCandidates.find((p) => p.closest('[class*="scaffold"]')) ||
        titleCandidates[0] ||
        null;
      const listRoot =
        (titleP &&
          (titleP.closest('.scaffold-finite-scroll__content') ||
            titleP.closest('[class*="finite-scroll__content"]') ||
            titleP.closest('[class*="scaffold"]'))) ||
        titleP?.closest('main') ||
        sec;
      const hrefPointsToCompany = (rawHref) => {
        if (!rawHref) return false;
        let probe = String(rawHref).trim();
        try {
          const u = new URL(probe, 'https://www.linkedin.com');
          if (u.pathname === '/safety/go' || u.pathname === '/safety/go/') {
            const inner = u.searchParams.get('url');
            if (inner) probe = decodeURIComponent(inner);
            else return false;
          } else probe = u.pathname + (u.search || '');
        } catch {
          probe = probe.split('#')[0].split('?')[0];
        }
        return /\/company\/[^/?#]+\/?$/i.test(probe);
      };
      const gatherAnchors = (root) =>
        [...root.querySelectorAll('a[href]')].filter((a) => {
          if (!hrefPointsToCompany(a.getAttribute('href') || '')) return false;
          if (titleP) {
            const pos = titleP.compareDocumentPosition(a);
            if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
          }
          return true;
        });
      let anchors = gatherAnchors(listRoot);
      if (!anchors.length && mainEl && listRoot !== mainEl)
        anchors = gatherAnchors(mainEl);
      const out = [];
      const seen = new Set();
      for (const a of anchors) {
        let row = a;
        let best = null;
        for (let d = 0; d < 22 && row && row !== listRoot; d++) {
          const raw = (row.innerText || row.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
          if (
            (/\bissued\b/i.test(raw) ||
              /\bexpedid[oa]\b/i.test(raw) ||
              /\bemitid[oa]\b/i.test(raw)) &&
            raw.length < 4000
          ) {
            best = row;
            break;
          }
          row = row.parentElement;
        }
        if (!best || isLikelyAdRowElement(best)) continue;
        let spans = ns.collectTextSpans(best).filter(
          (x) =>
            x &&
            !/^show credential$/i.test(x.trim()) &&
            !/^view badge$/i.test(x.trim()),
        );
        if (!spans.length) continue;
        const parsed = ns.parseRowSpans(spans);
        let name = parsed.title && dedupeText(parsed.title);
        if (!name || /^show credential$/i.test(name)) {
          const alt = spans.find(
            (s) =>
              s.length > 1 &&
              !/^show credential$/i.test(s) &&
              !/^issued\b/i.test(s) &&
              !/^credential\s+id\b/i.test(s) &&
              !/^\d+$/.test(s),
          );
          name = alt ? dedupeText(alt) : '';
        }
        if (!name) continue;
        const k = `${name}|${parsed.credentialId || ''}`.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const item = {
          name,
          issuer: parsed.secondary || undefined,
          issued: parsed.issued,
        };
        if (parsed.credentialId) item.credentialId = parsed.credentialId;
        if (!isLikelyLinkedInAdCertification(item)) out.push(item);
      }
      return out;
    }

    if (!items.length) {
      for (const it of tryCompanyLogoCertRows()) items.push(it);
      if (items.length) return items;
    }

    // Legacy fallback (pre-2026 DOM / fixtures / LI rows without artdeco).
    const rows = QA('li.artdeco-list__item, li, article', sec);
    for (const r of rows) {
      if (isLikelyAdRowElement(r)) continue;
      let name =
        norm(
          pickVisibleText(
            r.querySelectorAll('.t-bold span[aria-hidden="true"]'),
          ),
        ) ||
        norm(
          pickVisibleText(
            r.querySelectorAll(
              '.t-bold span, .t-bold, [class*="t-bold"] span[aria-hidden="true"]',
            ),
          ),
        ) ||
        norm(pickVisibleText(r.querySelectorAll('h3, h3 span, a span')));
      const issuer =
        norm(
          pickVisibleText(
            r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
      const issuedRaw =
        norm(
          T(
            r.querySelector(
              '.t-14.t-normal.t-black--light .pvs-entity__caption-wrapper',
            ),
          ),
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
      if (name) {
        const row = { name, issuer: issuer || undefined, issued };
        if (!isLikelyLinkedInAdCertification(row)) items.push(row);
      }
    }
    return items.length ? items : undefined;
  };
})();
