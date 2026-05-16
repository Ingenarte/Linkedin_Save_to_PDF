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
    const out = [];
    // De-dupe by the FULL entry (school + degree + dates), never by school
    // alone: one school can hold several degrees (e.g. BSc + MSc, 1st + 2nd
    // level diploma). The old seenPath dedup dropped every extra degree.
    const seenKey = new Set();
    // 2026 LinkedIn SDUI puts each line in span[aria-hidden="true"]; older /
    // jsdom layouts use <p>. Read both. visually-hidden mirror spans are not
    // [aria-hidden="true"], so this avoids the duplicated a11y text.
    const lineText = (el) =>
      [...el.querySelectorAll('span[aria-hidden="true"], p')]
        .map((n) => normFn(n.textContent || ''))
        .filter(Boolean)
        .filter((t) => !/^show all\b/i.test(t));
    const dedupeConsecutive = (arr) => {
      const r = [];
      for (const t of arr) if (r[r.length - 1] !== t) r.push(t);
      return r;
    };
    const DATE_RE =
      /(\d{4})\s*.*?[–\-]\s*.*?(\d{4}|present|presente|actualidad|en cours)/i;
    for (const sec of sections) {
      if (!sec) continue;
      const anchors = [...sec.querySelectorAll('a[href*="/school/"]')];
      for (const a of anchors) {
        // Tightest ancestor that still wraps exactly THIS single school
        // anchor — climbing one level further would pull in the next
        // education entry's anchor, merging two degrees into one row.
        let container = a.parentElement;
        let el = a.parentElement;
        for (let d = 0; d < 16 && el && el !== sec; d++) {
          const here = el.querySelectorAll('a[href*="/school/"]').length;
          if (here > 1) break;
          if (here === 1 && lineText(el).length >= 2) container = el;
          el = el.parentElement;
        }
        if (!container) continue;
        const lines = dedupeConsecutive(lineText(container)).filter(
          (t) => !/^grade\s*:/i.test(t),
        );
        const school = lines[0] || normFn(a.textContent || '');
        let degree = lines[1];
        let startDate;
        let endDate;
        for (let i = 1; i < lines.length; i++) {
          const m = lines[i].match(DATE_RE);
          if (m) {
            startDate = m[1];
            endDate = /\d{4}/.test(m[2]) ? m[2] : 'Present';
            if (degree === lines[i]) degree = undefined;
            break;
          }
        }
        const item = { school, degree, startDate, endDate };
        if (!item.school || isAd(item)) continue;
        const key =
          `${school}|${degree || ''}|${startDate || ''}|${endDate || ''}`.toLowerCase();
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        out.push(item);
      }
    }
    return out;
  }

  /**
   * 2026 /details/education/ layout: entries are sibling block <div>s inside one
   * list container (separated by <hr>). Some entries (e.g. a high school with no
   * LinkedIn page) have NO a[href*="/school/"], so the anchor walker misses them.
   * Walk the list container's children directly to capture every entry.
   */
  function extractEducationFromDetailsList(sec, normFn, isAd) {
    if (!sec) return [];
    const anchors = [...sec.querySelectorAll('a[href*="/school/"]')];
    if (anchors.length < 2) return [];
    // Lowest common ancestor of all school anchors == the entries' list parent.
    let list = anchors[0].parentElement;
    for (const a of anchors) {
      while (list && !list.contains(a)) list = list.parentElement;
    }
    if (!list) return [];
    // Tighten: if a single element child still holds every anchor, descend.
    for (let guard = 0; guard < 6; guard++) {
      const child = [...list.children].find(
        (c) =>
          c.nodeType === 1 &&
          c.querySelectorAll('a[href*="/school/"]').length === anchors.length,
      );
      if (!child) break;
      list = child;
    }
    const DATE_RE =
      /(\d{4})\s*.*?[–\-]\s*.*?(\d{4}|present|presente|actualidad|en cours)/i;
    const lineText = (el) => {
      let ls = [...el.querySelectorAll('span[aria-hidden="true"], p')]
        .map((n) => normFn(n.textContent || ''))
        .filter(Boolean);
      if (ls.length < 2) {
        ls = (el.innerText || '')
          .split('\n')
          .map((s) => normFn(s))
          .filter(Boolean);
      }
      return ls.filter(
        (t) => !/^show all\b/i.test(t) && !/^grade\s*:/i.test(t),
      );
    };
    const dedupe = (arr) => {
      const r = [];
      for (const t of arr) if (r[r.length - 1] !== t) r.push(t);
      return r;
    };
    const out = [];
    const seen = new Set();
    for (const child of [...list.children]) {
      if (child.nodeType !== 1 || child.tagName === 'HR') continue;
      if (!(child.textContent || '').trim()) continue;
      const lines = dedupe(lineText(child));
      if (lines.length < 2 || !lines.some((l) => DATE_RE.test(l))) continue;
      const school = lines[0];
      let degree = lines[1];
      let startDate;
      let endDate;
      for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(DATE_RE);
        if (m) {
          startDate = m[1];
          endDate = /\d{4}/.test(m[2]) ? m[2] : 'Present';
          if (degree === lines[i]) degree = undefined;
          break;
        }
      }
      const item = { school, degree, startDate, endDate };
      if (!item.school || isAd(item)) continue;
      const key =
        `${school}|${degree || ''}|${startDate || ''}|${endDate || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
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

    // On /details/education/ LinkedIn may not add componentkey to sections,
    // so listEducationSectionRootsInMain() returns []. Fall back to sec (main)
    // so extractEducationFromSchoolAnchors still iterates a[href*="/school/"].
    const _eduRoots =
      typeof ns.listEducationSectionRootsInMain === 'function'
        ? ns.listEducationSectionRootsInMain()
        : [];
    const eduSections = _eduRoots.length > 0 ? _eduRoots : [sec];
    const fromSchoolAnchors = extractEducationFromSchoolAnchors(
      eduSections,
      norm,
      isLikelyLinkedInAdEducation,
    );

    const fromDetailsList = extractEducationFromDetailsList(
      sec,
      norm,
      isLikelyLinkedInAdEducation,
    );

    const ranked = [
      { list: fromDetailsList, prio: 5 },
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
