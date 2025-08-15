// src/content/experience.js
(function (ns) {
  // Expect shared utils in ns (from utils.js)
  const {
    Q,
    QA,
    T,
    norm,
    pickVisibleText,
    pickRoleNode,
    uniqueByCI,
    parseDates,
    dedupeText,
    findSection,
  } = ns;

  // Helper: build a single experience item from a row-like node
  function extractItemFromRow(r) {
    // Title / role
    const roleNode = pickRoleNode(r);
    const roleText = norm(T(roleNode));

    // Company text (LinkedIn often renders as t-14.t-normal or link)
    const companyText = norm(
      pickVisibleText(
        r.querySelectorAll('span.t-14.t-normal, a.app-aware-link')
      )
    );

    const title = roleText || undefined;

    // Meta line (date range, duration). Try several fallbacks.
    const metaLine =
      norm(
        T(
          r.querySelector(
            'span.t-14.t-normal.t-black--light, .pvs-entity__caption-wrapper'
          )
        )
      ) ||
      norm(T(r.querySelector('.t-black--light'))) ||
      '';

    const { startDate, endDate, duration } = parseDates(metaLine);

    // Description and bullets
    const bullets = uniqueByCI(
      QA('ul li', r).map((li) => dedupeText(norm(T(li))))
    );

    let description =
      dedupeText(
        norm(
          T(
            r.querySelector(
              'p, .inline-show-more-text, .pv-shared-text-with-see-more'
            )
          )
        )
      ) || undefined;

    if (description && bullets.length) {
      const joined = bullets.join(' ');
      if (description === joined) description = undefined;
    }

    // Compose a visible line: "Title - Company" when applicable
    let roleLine = title || '';
    if (companyText) {
      const titleLC = (title || '').toLowerCase();
      const companyLC = companyText.toLowerCase();
      const showCompany = !titleLC || !titleLC.includes(companyLC);
      if (showCompany) roleLine = `${title || ''} - ${companyText}`;
    }

    // Only push meaningful entries
    if (roleLine || description || bullets.length) {
      return {
        title: dedupeText(roleLine || ''),
        startDate,
        endDate,
        duration,
        bullets: bullets.length ? bullets : undefined,
        description,
      };
    }
    return null;
  }

  ns.extractExperience = function extractExperience() {
    // Find section by header or common anchors/labels
    const sec =
      findSection(/experience|experiencia/i) ||
      Q('section[id*="experience"], section[aria-label*="experience" i]');
    if (!sec) return undefined;

    const items = [];

    // 1) Flat rows: most common selectors
    const flatRows = QA(
      [
        "div[data-test-id='experience-list-item']",
        'li.artdeco-list__item',
        'div.pvs-list__container > div > ul > li',
        'section[aria-label*="Experience" i] li',
        'article',
      ].join(','),
      sec
    );

    // 2) Some profiles group multiple roles under the same company.
    //    We flatten nested list items as well.
    const nestedRows = [];
    flatRows.forEach((row) => {
      const subList = row.querySelector('ul');
      if (subList) {
        nestedRows.push(...QA(':scope > ul > li', row));
      }
    });

    const rows = flatRows.concat(nestedRows);

    for (const r of rows) {
      const it = extractItemFromRow(r);
      if (it) items.push(it);
    }

    // Deduplicate by title+dates (best-effort)
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const k = [
        (it.title || '').toLowerCase(),
        it.startDate || '',
        it.endDate || '',
        it.duration || '',
      ].join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }

    return out.length ? out : undefined;
  };
})(window.__LNP_NS__ || (window.__LNP_NS__ = {}));
