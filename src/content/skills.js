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
      /^(industry knowledge|interpersonal skills|tools & technologies|tools and technologies|other skills|aptitudes|habilidades|herramientas y tecnolog[ií]as|conocimiento del sector)$/i.test(
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

      // 2026 /details/skills/ without componentkey: entries are <hr>-delimited
      // sibling blocks. The first non-noise line of each block is the skill
      // (a second line, e.g. an associated role/project, is skipped). Walk the
      // list container directly so the full list is captured, not just the
      // 2-row main-profile preview.
      const mainEl =
        document.querySelector('main') || document.querySelector('[role="main"]');
      let listRoot = null;
      if (skillRows.length) {
        listRoot = skillRows[0].parentElement;
        for (const r of skillRows)
          while (listRoot && !listRoot.contains(r))
            listRoot = listRoot.parentElement;
      }
      if (!listRoot) {
        const titleP = [...(mainEl || work).querySelectorAll('p, h2')].find(
          (p) => /^\s*skills?\s*$|aptitudes|habilidades|compet[eê]ncias/i.test(
            norm(p.textContent || ''),
          ),
        );
        listRoot =
          (titleP &&
            (titleP.closest('.scaffold-finite-scroll__content') ||
              titleP.closest('[class*="finite-scroll__content"]') ||
              titleP.closest('[class*="scaffold"]'))) ||
          mainEl ||
          work;
      }
      if (listRoot) {
        // <hr> separators usually sit a few levels below listRoot; split at
        // their common parent. Stop at the next profile section so the walker
        // never bleeds into Honors/Publications/Languages/etc.
        const hrs = [...listRoot.querySelectorAll('hr')];
        const splitRoot =
          (hrs.length && hrs[0].parentElement && listRoot.contains(hrs[0])
            ? hrs[0].parentElement
            : listRoot) || listRoot;
        const SECTION_BREAK_RE =
          /^(honors?\s*&?\s*awards?|honores|publications?|publicaciones|recommendations?|recomendaciones|interests?|intereses|languages?|idiomas|education|educaci[oó]n|experience|certifications?|licen[sc]es|people also|más perfiles|more profiles|nothing to see)\b/i;
        const groups = [];
        let cur = [];
        let stop = false;
        for (const child of [...splitRoot.children]) {
          if (stop || child.nodeType !== 1) continue;
          if (child.tagName === 'HR') {
            if (cur.length) groups.push(cur);
            cur = [];
            continue;
          }
          const head = norm(
            (child.innerText || child.textContent || '').split('\n')[0] || '',
          );
          if (SECTION_BREAK_RE.test(head)) {
            stop = true;
            continue;
          }
          cur.push(child);
        }
        if (cur.length) groups.push(cur);
        for (const g of groups) {
          let lines = [];
          for (const el of g) {
            if (el.closest('nav, footer, aside')) continue;
            lines = lines.concat(
              typeof ns.collectTextSpans === 'function'
                ? ns.collectTextSpans(el)
                : norm(el.innerText || '').split(/\n+/),
            );
          }
          const label = lines
            .map((s) => norm(s))
            .find((s) => s && !isNoiseSkillLabel(s));
          if (label) add(label);
        }
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
