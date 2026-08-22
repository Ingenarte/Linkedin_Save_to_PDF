(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractProjects = function extractProjects() {
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
    let sec =
      (ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === 'projects' &&
      typeof ns.getDetailsComponentkeyRoot === 'function'
        ? ns.getDetailsComponentkeyRoot('projects')
        : null) ||
      rootResolver('projects') ||
      rootResolver({
        key: 'projects',
        heading: /projects?|proyectos?|projetos?|projeler|projelerim|proje\b/i,
      }) ||
      (typeof rootResolver === 'function' &&
        rootResolver(/projects?|proyectos?|projetos?|projeler|projelerim|proje\b/i)) ||
      Q('section[componentkey*="Project" i]') ||
      Q('section[componentkey*="Accomplishment" i]') ||
      Q('section[id*="projects" i]') ||
      Q('section[aria-label*="project" i]') ||
      Q('section[aria-label*="proje" i]');

    if (!sec) {
      const allSections = Array.from(
        document.querySelectorAll('main section, [role="main"] section, section[componentkey]'),
      );
      sec = allSections.find((s) => {
        const heading = s.querySelector('h1, h2, h3, header');
        return heading && /projects?|proyectos?|projetos?|projeler|projelerim|proje\b/i.test(heading.textContent || '');
      });
    }

    if (!sec) {
      const detailLink = Q('main a[href*="/details/projects"], main a[href*="details/projects"], a[href*="/details/projects"]');
      if (detailLink) {
        sec = detailLink.closest('section[componentkey]') || detailLink.closest('section');
      }
    }

    if (
      !sec &&
      ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === 'projects'
    ) {
      sec =
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        undefined;
    }
    if (!sec) return undefined;

    const out = [];

    function cleanProjectUrl(u) {
      if (!u) return undefined;
      try {
        let raw = u.trim();
        if (raw.includes('linkedin.com/safety/go')) {
          const parsed = new URL(raw, location.origin);
          const target = parsed.searchParams.get('url');
          if (target) raw = decodeURIComponent(target);
        }
        if (/^https?:\/\//i.test(raw)) {
          if (!raw.includes('linkedin.com/in/') && !raw.includes('linkedin.com/company/')) {
            return raw;
          }
        }
      } catch (_e) {}
      return undefined;
    }

    function cleanTextUrls(text) {
      if (!text) return text;
      return text.replace(/https?:\/\/(?:www\.)?linkedin\.com\/safety\/go\/\?[^\s]+/gi, (m) => {
        try {
          const u = new URL(m, location.origin);
          const t = u.searchParams.get('url');
          return t ? decodeURIComponent(t) : '';
        } catch (_e) {
          return '';
        }
      }).trim();
    }

    function extractProjectUrl(rowEl) {
      if (!rowEl) return undefined;
      const links = Array.from(rowEl.querySelectorAll('a[href]'));
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const decoded = cleanProjectUrl(href);
        if (decoded) return decoded;
      }
      return undefined;
    }

    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        if (!spans.length) continue;
        if (/^associated with\b/i.test(spans[0])) continue;
        let title = dedupeText(spans[0]);
        if (!title || /^show project/i.test(title) || isAdNoise(title))
          continue;

        let date, associatedWith, description;
        for (let i = 1; i < spans.length; i++) {
          const s = spans[i];
          if (/^(show project|view project)/i.test(s) || isAdNoise(s)) continue;

          const assocMatch = s.match(/^(?:Associated with|Asociado con|Associado a)\s+(.+)$/i);
          if (assocMatch && !associatedWith) {
            associatedWith = assocMatch[1].trim();
            continue;
          }

          const dateMatch = s.match(
            /^[A-Za-zÀ-ÿ]{3,}\s+\d{4}\s*[-–—]\s*(?:Present|[A-Za-zÀ-ÿ]{3,}\s+\d{4}|Presente|Actualidad)|\d{4}\s*[-–—]\s*(?:\d{4}|Present|Presente)|(?:[A-Za-zÀ-ÿ]{3,}\s+)?\d{4}$/i,
          );
          if (dateMatch && !date) {
            date = s;
            continue;
          }

          if (!description && s.length > 25 && !/^\d+\s*skills?/i.test(s)) {
            description = s;
          }
        }

        const url = extractProjectUrl(r);
        const finalDesc = description ? dedupeText(cleanTextUrls(description)) : undefined;
        if (
          title &&
          !isAdNoise(associatedWith) &&
          !isAdNoise(date) &&
          !isAdNoise(finalDesc)
        ) {
          out.push({
            title,
            date,
            associatedWith,
            description: finalDesc,
            url,
          });
        }
      }
      if (out.length) {
        const clean = cleanItems(out);
        if (clean.length) return clean;
      }
    }

    const rowCandidates = QA(
      'li, article, div.pvs-list__paged-list-item, div.artdeco-list__item, div[data-view-name*="profile-component-entity"]',
      sec,
    );
    for (const r of rowCandidates) {
      if (r.querySelector('li, article, div.pvs-list__paged-list-item')) continue;
      let title =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"], div.t-bold'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      if (/^(show project|view project)/i.test(title || '')) title = undefined;

      const secondarySpans = QA('span.t-14.t-normal span[aria-hidden="true"], span.t-14.t-normal', r);
      let date, associatedWith;
      for (const sp of secondarySpans) {
        const txt = norm(T(sp));
        if (!txt) continue;
        if (/^(?:Associated with|Asociado con|Associado a)\s+/i.test(txt)) {
          associatedWith = txt.replace(/^(?:Associated with|Asociado con|Associado a)\s+/i, '');
        } else if (/\d{4}/.test(txt) && !date) {
          date = txt;
        }
      }

      const rawDesc =
        dedupeText(
          norm(
            T(
              r.querySelector(
                'p, div.inline-show-more-text, .pv-shared-text-with-see-more',
              ),
            ),
          ),
        ) || undefined;
      const description = rawDesc ? dedupeText(cleanTextUrls(rawDesc)) : undefined;

      const url = extractProjectUrl(r);

      if (
        title &&
        !isAdNoise(title) &&
        !isAdNoise(associatedWith) &&
        !isAdNoise(date) &&
        !isAdNoise(description)
      ) {
        out.push({
          title: dedupeText(title),
          date,
          associatedWith,
          description,
          url,
        });
      }
    }

    const clean = cleanItems(out);
    return clean.length ? clean : undefined;
  };
})();
