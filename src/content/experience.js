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

  /** Filter promo / sidebar copy that sometimes lands in the wrong scaffold. */
  function isLikelyLinkedInAdExperience(item) {
    const blob = `${item.title || ''} ${item.description || ''}`.toLowerCase();
    if (!blob.trim()) return false;
    return (
      /why am i seeing this ad|manage your ad preferences|don't want to see this ad|sponsored\b|recommendation transparency|ad choices/.test(
        blob,
      ) || /^more profiles for you$/i.test((item.title || '').trim())
    );
  }

  /**
   * 2026 SDUI: each role is often a distinct `entity-collection-item-*`
   * subtree. `collectRowAnchors` dedupes by href + text prefix, which
   * collapses multiple roles at the same company into one anchor — use
   * entity roots when they yield a strictly longer list.
   */
  function collectExperienceEntityCollectionRoots(sec) {
    if (!sec) return [];
    const raw = [
      ...sec.querySelectorAll('[componentkey^="entity-collection-item"]'),
      ...sec.querySelectorAll('[componentkey*="entity-collection-item"]'),
    ];
    const eligible = raw.filter((el) => {
      const company = el.querySelector('a[href*="/company/"]');
      const nP = el.querySelectorAll('p').length;
      return !!(company || nP >= 2);
    });
    return eligible.filter(
      (el) => !eligible.some((other) => other !== el && other.contains(el)),
    );
  }

  function buildExperienceSduiItemFromTextRoot(root) {
    if (!root || typeof ns.collectTextSpans !== 'function') return null;
    const spans = ns.collectTextSpans(root);
    if (!spans.length) return null;
    const parsed = ns.parseRowSpans(spans);
    const item = {
      title: parsed.secondary
        ? `${parsed.title} - ${parsed.secondary}`
        : parsed.title,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      duration: parsed.duration,
    };
    const descParts = (parsed.extras || []).filter((s) => {
      if (s.length < 12) return false;
      if (/^\.\.\.\s*more$/i.test(s)) return false;
      if (/^and \+\d+ skills?$/i.test(s)) return false;
      return true;
    });
    if (descParts.length) item.description = descParts.join(' ');
    if (
      (item.title || item.startDate || item.description) &&
      !isLikelyLinkedInAdExperience(item)
    )
      return item;
    return null;
  }

  // Helper: build a single experience item from a row-like node
  function extractItemFromRow(r) {
    // Title / role
    const roleNode = pickRoleNode(r);
    const roleText = norm(T(roleNode));

    // Company text (LinkedIn often renders as t-14.t-normal or link)
    const companyText = norm(
      pickVisibleText(
        r.querySelectorAll('span.t-14.t-normal, a.app-aware-link'),
      ),
    );

    const title = roleText || undefined;

    // Meta line (date range, duration). Try several fallbacks.
    const metaLine =
      norm(
        T(
          r.querySelector(
            'span.t-14.t-normal.t-black--light, .pvs-entity__caption-wrapper',
          ),
        ),
      ) ||
      norm(T(r.querySelector('.t-black--light'))) ||
      '';

    const { startDate, endDate, duration } = parseDates(metaLine);

    // Description and bullets
    const bullets = uniqueByCI(
      QA('ul li', r).map((li) => dedupeText(norm(T(li)))),
    );

    let description =
      dedupeText(
        norm(
          T(
            r.querySelector(
              'p, .inline-show-more-text, .pv-shared-text-with-see-more',
            ),
          ),
        ),
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
    // Find section by header or common anchors/labels. On /details/experience/
    // sub-pages getSectionRoot falls back to <main> so the extractor still
    // works despite the page-level heading structure.
    const rootResolver = ns.getSectionRoot || findSection;
    const sec =
      rootResolver({ key: 'experience', heading: /experience|experiencia/i }) ||
      Q('section[id*="experience"], section[aria-label*="experience" i]');
    if (!sec) return undefined;

    const items = [];

    // -----------------------------------------------------------------
    // 2026 SDUI: company-anchor rows vs per-role entity blocks. Prefer
    // entity-derived items when they beat anchor dedupe (same company,
    // multiple roles).
    // -----------------------------------------------------------------
    const anchorHrefRes = [
      /\/company\/\d+\/?/,
      /\/company\/[^/?#]+\/?/,
      /\/in\/[^/]+\/details\/experience\/.+\/(company|positions)\b/,
    ];
    const rowAnchors =
      typeof ns.collectRowAnchors === 'function'
        ? ns.collectRowAnchors(sec, anchorHrefRes)
        : [];
    const anchorItems = [];
    for (const a of rowAnchors) {
      const it = buildExperienceSduiItemFromTextRoot(a);
      if (it) anchorItems.push(it);
    }

    const entityRoots = collectExperienceEntityCollectionRoots(sec);
    const entityItems = [];
    for (const root of entityRoots) {
      const it = buildExperienceSduiItemFromTextRoot(root);
      if (it) entityItems.push(it);
    }

    const chosen =
      entityItems.length > anchorItems.length ? entityItems : anchorItems;
    for (const it of chosen) items.push(it);

    // SDUI list rows without a single company anchor (details pages and
    // some locales) — same strategy as education.js.
    if (items.length === 0 && typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r);
        if (!spans.length) continue;
        const parsed = ns.parseRowSpans(spans);
        const item = {
          title: parsed.secondary
            ? `${parsed.title} - ${parsed.secondary}`
            : parsed.title,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          duration: parsed.duration,
        };
        const descParts = (parsed.extras || []).filter((s) => {
          if (s.length < 12) return false;
          if (/^\.\.\.\s*more$/i.test(s)) return false;
          if (/^and \+\d+ skills?$/i.test(s)) return false;
          if (/^skills:\s/i.test(s)) return false;
          return true;
        });
        if (descParts.length) item.description = descParts.join(' ');
        if (
          (item.title || item.startDate || item.description) &&
          !isLikelyLinkedInAdExperience(item)
        )
          items.push(item);
      }
    }

    // -----------------------------------------------------------------
    // Legacy fallback for the pre-2026 DOM and the offline test fixtures.
    // -----------------------------------------------------------------
    if (items.length === 0) {
      const flatRows = QA(
        [
          "div[data-test-id='experience-list-item']",
          'li.artdeco-list__item',
          'div.pvs-list__container > div > ul > li',
          'section[aria-label*="Experience" i] li',
          'article',
        ].join(','),
        sec,
      );
      const nestedRows = [];
      flatRows.forEach((row) => {
        const subList = row.querySelector('ul');
        if (subList) nestedRows.push(...QA(':scope > ul > li', row));
      });
      const rows = flatRows.concat(nestedRows);
      for (const r of rows) {
        const it = extractItemFromRow(r);
        if (it && !isLikelyLinkedInAdExperience(it)) items.push(it);
      }
    }

    // Deduplicate by title+dates (best-effort).
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
