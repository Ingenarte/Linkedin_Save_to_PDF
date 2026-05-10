// education.js
(function () {
  const ns = window.__LNP_NS__ || (window.__LNP_NS__ = {});

  /**
   * LinkedIn 2026 SDUI: education rows are often `entity-collection-item-*`
   * blocks with consecutive <p> (school, degree, optional date range).
   * Same pattern on main profile Education card and on /details/education/.
   */
  function collectEducationEntityCollectionRoots(sec) {
    if (!sec) return [];
    const raw = [
      ...sec.querySelectorAll('[componentkey^="entity-collection-item"]'),
      ...sec.querySelectorAll('[componentkey*="entity-collection-item"]'),
    ];
    const withPs = raw.filter((el) => el.querySelectorAll('p').length >= 2);
    return withPs.filter(
      (el) => !withPs.some((other) => other !== el && other.contains(el)),
    );
  }

  /**
   * Some 2026 layouts list schools only as <a href*="/school/"> with no
   * entity-collection-item wrapper. Walk up from each unique school link
   * to a subtree with ≥2 <p> lines (school, degree, optional dates).
   */
  function extractEducationFromSchoolAnchors(sections, normFn, isAd) {
    if (!sections || !sections.length) return [];
    const seenPath = new Set();
    const out = [];
    const schoolPath = (href) => {
      try {
        const u = new URL(href, 'https://www.linkedin.com');
        return u.pathname.replace(/\/+$/, '').toLowerCase();
      } catch {
        return (href || '').toLowerCase();
      }
    };
    for (const sec of sections) {
      if (!sec) continue;
      const anchors = sec.querySelectorAll('a[href*="/school/"]');
      for (const a of anchors) {
        const rawHref = a.getAttribute('href') || '';
        const pathKey = schoolPath(rawHref);
        if (!pathKey || seenPath.has(pathKey)) continue;
        seenPath.add(pathKey);
        let row =
          a.closest('[componentkey*="entity-collection-item"]') || null;
        if (!row || !sec.contains(row)) {
          let el = a.parentElement;
          for (let d = 0; d < 14 && el && el !== sec; d++) {
            const nP = el.querySelectorAll('p').length;
            if (nP >= 2) {
              row = el;
              break;
            }
            el = el.parentElement;
          }
        }
        if (!row) row = a.closest('li') || a.parentElement;
        if (!row) continue;
        const ps = [...row.querySelectorAll('p')]
          .map((p) => normFn(p.textContent || ''))
          .filter(Boolean)
          .filter((t) => !/^show all\b/i.test(t));
        let school = normFn(a.textContent || '');
        let degree;
        let startDate;
        let endDate;
        if (ps.length >= 2) {
          school = ps[0];
          degree = ps[1];
          let dates = '';
          if (ps[2] && /\d{4}\s*[–-]|\bPresent\b/i.test(ps[2]))
            dates = ps[2];
          const m = dates.match(/(\d{4})\s*[–-]\s*(\d{4}|Present)/i);
          if (m) {
            startDate = m[1];
            endDate = m[2];
          }
        } else if (typeof ns.collectTextSpans === 'function') {
          const spans = ns.collectTextSpans(row);
          if (spans.length) {
            const parsed = ns.parseRowSpans(spans);
            school = parsed.title || school;
            degree = parsed.secondary;
            startDate = parsed.startDate;
            endDate = parsed.endDate;
          }
        }
        const item = { school, degree, startDate, endDate };
        if (item.school && !isAd(item)) out.push(item);
      }
    }
    return out;
  }

  function extractEducationEntityCollectionItems(sec, normFn, isAd) {
    if (!sec) return [];
    const nodes = collectEducationEntityCollectionRoots(sec);
    const seen = new Set();
    const out = [];
    for (const node of nodes) {
      const ps = [...node.querySelectorAll('p')]
        .map((p) => normFn(p.textContent || ''))
        .filter(Boolean)
        .filter((t) => !/^show all\b/i.test(t));
      if (ps.length < 1) continue;
      const school = ps[0];
      let degree;
      let dates = '';
      if (ps.length === 1) {
        degree = undefined;
      } else if (ps.length === 2) {
        if (/\d{4}\s*[–-]|\bPresent\b/i.test(ps[1])) {
          dates = ps[1];
          degree = undefined;
        } else {
          degree = ps[1];
        }
      } else {
        degree = ps[1];
        if (ps[2] && /\d{4}\s*[–-]|\bPresent\b/i.test(ps[2])) dates = ps[2];
      }
      const m = dates.match(/(\d{4})\s*[–-]\s*(\d{4}|Present)/i);
      const item = {
        school,
        degree,
        startDate: m ? m[1] : undefined,
        endDate: m ? m[2] : undefined,
      };
      const key = `${school}|${degree || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (school && !isAd(item)) out.push(item);
    }
    return out;
  }

  ns.extractEducation = function extractEducation() {
    const { getSectionRoot, findSection, QA, Q, T, norm } = ns;
    const rootResolver = getSectionRoot || findSection;
    let sec = rootResolver({
      key: 'education',
      heading: /education|educaci[oó]n|formaci[oó]n/i,
    });
    if (
      !sec &&
      ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === 'education'
    ) {
      sec =
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        undefined;
    }
    if (!sec) return undefined;

    function isLikelyLinkedInAdEducation(item) {
      const blob = `${item.school || ''} ${item.degree || ''}`.toLowerCase();
      if (!blob.trim()) return false;
      return (
        /why am i seeing this ad|manage your ad preferences|don't want to see this ad|sponsored\b|recommendation transparency|ad choices/.test(
          blob,
        ) || /^more profiles for you$/i.test((item.school || '').trim())
      );
    }

    const fromGeneric = [];
    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        if (!spans.length) continue;
        const parsed = ns.parseRowSpans(spans);
        const school = parsed.title;
        const degree = parsed.secondary;
        const item = {
          school,
          degree,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
        };
        if (item.school && !isLikelyLinkedInAdEducation(item))
          fromGeneric.push(item);
      }
    }

    const fromEntitiesSingle = extractEducationEntityCollectionItems(
      sec,
      norm,
      isLikelyLinkedInAdEducation,
    );
    let fromEntitiesMerged = [];
    if (typeof ns.listEducationSectionRootsInMain === 'function') {
      const seenM = new Set();
      for (const s of ns.listEducationSectionRootsInMain()) {
        for (const item of extractEducationEntityCollectionItems(
          s,
          norm,
          isLikelyLinkedInAdEducation,
        )) {
          const k = `${item.school}|${item.degree}`.toLowerCase();
          if (seenM.has(k)) continue;
          seenM.add(k);
          fromEntitiesMerged.push(item);
        }
      }
    }
    const fromEntities =
      fromEntitiesMerged.length >= fromEntitiesSingle.length
        ? fromEntitiesMerged
        : fromEntitiesSingle;

    const eduSections =
      typeof ns.listEducationSectionRootsInMain === 'function'
        ? ns.listEducationSectionRootsInMain()
        : [sec];
    const fromSchoolAnchors = extractEducationFromSchoolAnchors(
      eduSections,
      norm,
      isLikelyLinkedInAdEducation,
    );

    const ranked = [
      { list: fromSchoolAnchors, prio: 4 },
      { list: fromEntities, prio: 3 },
      { list: fromGeneric, prio: 2 },
    ].filter((x) => x.list && x.list.length);
    ranked.sort(
      (a, b) => b.list.length - a.list.length || b.prio - a.prio,
    );
    let items = ranked.length ? ranked[0].list : [];

    // Legacy fallback (pre-2026 DOM, jsdom test fixtures).
    if (items.length === 0) {
      const rows = QA('li, article', sec);
      for (const r of rows) {
        const school = norm(T(Q('h3', r)) || T(Q('a span', r)));
        const degree = norm(T(Q('span.t-14.t-normal', r)));
        const meta = norm(T(Q('span.t-14.t-normal.t-black--light', r))) || '';
        const m = meta.match(/(\d{4}).*?(Present|\d{4})/i);
        if (school) {
          const row = { school, degree, startDate: m?.[1], endDate: m?.[2] };
          if (!isLikelyLinkedInAdEducation(row)) items.push(row);
        }
      }
    }

    return items.length ? items : undefined;
  };
})();
