// skills.js
(function (ns) {
  const {
    QA,
    T,
    norm,
    findSection,
  } = ns;

  function isNoiseSkillLabel(s) {
    const t = norm(s);
    if (!t || t.length < 2) return true;
    if (t.length > 140) return true;
    if (
      typeof ns.isLinkedInAdOrPreferenceText === 'function' &&
      ns.isLinkedInAdOrPreferenceText(t)
    )
      return true;
    const low = t.toLowerCase();
    if (
      /^(skills|all|endorse|show all|see more|message|follow|connect|show more)$/i.test(
        t,
      )
    )
      return true;
    if (
      /^(industry knowledge|interpersonal skills|aptitudes|habilidades)$/i.test(
        t,
      )
    )
      return true;
    if (/^\d+\s+endorsements?$/i.test(t)) return true;
    if (/^endorsed by\b/i.test(t)) return true;
    if (/^and \+\d+ skills?$/i.test(t)) return true;
    if (/^more profiles for you$/i.test(t)) return true;
    if (/^ad options$|^don’t want to see this$/i.test(t)) return true;
    if (/\b·\s*\d+(st|nd|rd|th)\b/i.test(t) && /follow|message|connect/i.test(t))
      return true;
    return false;
  }

  function skillLabelFromAnchor(a) {
    const h3 = a.querySelector('h3');
    if (h3) {
      const v = norm(T(h3));
      if (v) return v;
    }
    const ar = a.querySelector('span[aria-hidden="true"]');
    if (ar) {
      const v = norm(T(ar));
      if (v) return v;
    }
    const bold = a.querySelector(
      '.t-bold, span.t-bold, strong, [class*="break-words"]',
    );
    if (bold) {
      const v = norm(T(bold));
      if (v) return v;
    }
    const lines = norm(a.innerText || '')
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    return lines[0] || '';
  }

  function shouldSkipSkillHref(href) {
    const h = (href || '').split('?')[0];
    if (!h) return true;
    if (/show all|search\/|jobs\/|learning\//i.test(h)) return true;
    if (/\/skills\/(people|endorsement|endorse)\b/i.test(h)) return true;
    return false;
  }

  ns.extractSkills = function extractSkills() {
    const rootResolver = ns.getSectionRoot || findSection;
    const sec =
      rootResolver({
        key: 'skills',
        heading: /skills|aptitudes|habilidades|compet[eê]ncias/i,
      }) || null;
    if (!sec) return undefined;

    let work = sec;
    if (ns.isDetailsPage && ns.isDetailsPage()) {
      const scoped =
        typeof ns.getDetailsSectionRoot === 'function'
          ? ns.getDetailsSectionRoot('skills')
          : null;
      if (scoped) work = scoped;
    }

    const raw = [];
    const seen = new Set();

    const add = (label) => {
      const s = norm(label);
      if (!s || isNoiseSkillLabel(s)) return;
      const k = s.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      raw.push(s);
    };

    if (ns.isDetailsPage?.() && ns.currentDetailsKind?.() === 'skills') {
      const skillRows = [
        ...work.querySelectorAll('[componentkey^="skill("]'),
        ...work.querySelectorAll('[componentkey*="skill("]'),
      ].filter((row) => {
        const ck = row.getAttribute('componentkey') || '';
        if (!ck || /-divider$/i.test(ck)) return false;
        if (row.closest('nav, footer, aside')) return false;
        return true;
      });
      for (const row of skillRows) {
        const spans =
          typeof ns.collectTextSpans === 'function'
            ? ns.collectTextSpans(row)
            : [];
        const label =
          spans.find((s) => !isNoiseSkillLabel(s)) ||
          skillLabelFromAnchor(row) ||
          T(row);
        add(label);
      }
    }

    const anchorList = work.querySelectorAll(
      'a[href*="/skills/"], a[href*="/skill/"], a[href*="/details/skills/"]',
    );
    for (const a of anchorList) {
      if (a.closest('aside')) continue;
      if (a.closest('[data-view-name*="search-recommendations"]')) continue;
      if (a.closest('[data-view-name*="PeopleAlsoViewed"]')) continue;
      const href = a.getAttribute('href') || '';
      if (shouldSkipSkillHref(href)) continue;
      const label = skillLabelFromAnchor(a);
      add(label);
    }

    if (raw.length < 4 && typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        const s = spans[0];
        if (!s) continue;
        if (/^(skills|show all|endorse|see |\d+ endorsement)/i.test(s))
          continue;
        if (s.length <= 2 || s.length > 140) continue;
        add(s);
      }
    }

    if (raw.length === 0) {
      QA(
        "a[href*='/skills/'], a[href*='/skill/'], span[aria-hidden='true'], span.artdeco-pill__text",
        sec,
      ).forEach((n) => {
        const s = norm(T(n));
        if (!s) return;
        add(s.replace(/^./, (c) => c.toUpperCase()));
      });
    }

    return raw.length ? raw : undefined;
  };
})(window.__LNP_NS__ || (window.__LNP_NS__ = {}));
