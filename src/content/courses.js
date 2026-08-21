(function () {
  const ns = window.__LNP_NS__ || (window.__LNP_NS__ = {});
  window.__lnp = ns;

  ns.extractCourses = function extractCourses() {
    const { findSection, Q, QA, pickVisibleText, norm, T, dedupeText } = ns;
    const isAdNoise =
      typeof ns.isLinkedInAdOrPreferenceText === "function"
        ? ns.isLinkedInAdOrPreferenceText
        : () => false;
    const cleanItems =
      typeof ns.withoutLinkedInAdPreferenceItems === "function"
        ? ns.withoutLinkedInAdPreferenceItems
        : (items) => items;

    const rootResolver = ns.getSectionRoot || findSection;
    let sec =
      (ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === "courses" &&
      typeof ns.getDetailsComponentkeyRoot === "function"
        ? ns.getDetailsComponentkeyRoot("courses")
        : null) ||
      (typeof rootResolver === "function" ? rootResolver("courses") : null) ||
      (typeof rootResolver === "function"
        ? rootResolver({
            key: "courses",
            heading: /courses?|kurslar|cursos|kurse/i,
          })
        : null) ||
      (typeof rootResolver === "function"
        ? rootResolver(/courses?|kurslar|cursos|kurse/i)
        : null) ||
      Q("section[componentkey*=\"Course\" i]") ||
      Q("div[componentkey*=\"Courses\" i]") ||
      Q("section[id*=\"courses\" i]") ||
      Q("div[id*=\"Courses\" i]") ||
      Q("section[aria-label*=\"course\" i]") ||
      Q("section[aria-label*=\"kurs\" i]");

    if (!sec) {
      const allSections = Array.from(
        document.querySelectorAll("main section, [role=\"main\"] section, section[componentkey], div[componentkey]"),
      );
      sec = allSections.find((s) => {
        if (s.closest("footer, aside, nav, [role=\"contentinfo\"]")) return false;
        const heading = s.querySelector("h1, h2, h3, header");
        return heading && /courses?|kurslar|cursos|kurse/i.test(heading.textContent || "");
      });
    }

    if (!sec) {
      const detailLink = Q("main a[href*=\"/details/courses\"], main a[href*=\"details/courses\"], a[href*=\"/details/courses\"]");
      if (detailLink && !detailLink.closest("footer, aside, nav, [role=\"contentinfo\"]")) {
        sec = detailLink.closest("section[componentkey]") || detailLink.closest("section") || detailLink.closest("div[componentkey]");
      }
    }

    if (
      !sec &&
      ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === "courses"
    ) {
      sec =
        document.querySelector("main .scaffold-finite-scroll__content") ||
        document.querySelector("main .scaffold-layout__main") ||
        document.querySelector("main [role=\"main\"]") ||
        document.querySelector("main") ||
        document.querySelector(".scaffold-layout__main") ||
        document.querySelector("[role=\"main\"]") ||
        undefined;
    }
    if (!sec) return undefined;

    const out = [];
    const seenNames = new Set();

    if (typeof ns.collectGenericRows === "function") {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        if (r.closest("footer, aside, nav, [role=\"contentinfo\"], header[role=\"banner\"], .global-footer, .scaffold-layout__aside")) continue;
        const spans = typeof ns.collectTextSpans === "function" ? ns.collectTextSpans(r) : [];
        if (!spans.length) continue;
        if (/^associated with\b/i.test(spans[0])) continue;
        let name = dedupeText(spans[0]);
        if (!name || /^(?:courses?|kurslar|show all|see all|associated with|· 1st|· 2nd|\d+\s*(?:followers?|connections?)|open to|resources|enhance profile|add section)$/i.test(name) || isAdNoise(name))
          continue;

        let number, associatedWith;
        for (let i = 1; i < spans.length; i++) {
          const s = spans[i];
          if (/^(?:show all|see all)/i.test(s) || isAdNoise(s)) continue;
          if (/^(?:associated with|asociado con|ilişkili kurum)\s*:?\s*/i.test(s)) {
            associatedWith = s.replace(/^(?:associated with|asociado con|ilişkili kurum)\s*:?\s*/i, "").trim();
          } else if (/^(?:course number|kurs numarası|número de curso|number|code)\s*:?\s*/i.test(s)) {
            number = s.replace(/^(?:course number|kurs numarası|número de curso|number|code)\s*:?\s*/i, "").trim();
          } else if (!associatedWith && s.length < 120 && s !== name && !isAdNoise(s)) {
            associatedWith = s;
          }
        }

        const key = name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          out.push({
            name,
            number: number || undefined,
            associatedWith: associatedWith || undefined,
          });
        }
      }
    }

    if (!out.length) {
      let rawRows = Array.from(
        sec.querySelectorAll(
          "ul > li, [role=\"listitem\"], li.artdeco-list__item, li.pvs-list__paged-list-item, div.pvs-list__paged-list-item, div[data-view-name*=\"profile-component-entity\"], .pvs-entity",
        ),
      );
      if (!rawRows.length) {
        rawRows = Array.from(sec.querySelectorAll("li, article, div.display-flex.flex-column.full-width, div[componentkey]"));
      }
      for (const r of rawRows) {
        if (r.closest("footer, aside, nav, [role=\"contentinfo\"], header[role=\"banner\"], .global-footer, .scaffold-layout__aside")) continue;
        const spans = typeof ns.collectTextSpans === "function" ? ns.collectTextSpans(r) : [];
        if (!spans.length) continue;
        let name = dedupeText(spans[0]);
        if (!name || /^(?:courses?|kurslar|show all|see all|associated with|· 1st|· 2nd)$/i.test(name) || isAdNoise(name)) continue;

        let number, associatedWith;
        for (let i = 1; i < spans.length; i++) {
          const s = spans[i];
          if (/^(?:show all|see all)/i.test(s) || isAdNoise(s)) continue;
          if (/^(?:associated with|asociado con|ilişkili kurum)\s*:?\s*/i.test(s)) {
            associatedWith = s.replace(/^(?:associated with|asociado con|ilişkili kurum)\s*:?\s*/i, "").trim();
          } else if (/^(?:course number|kurs numarası|número de curso|number|code)\s*:?\s*/i.test(s)) {
            number = s.replace(/^(?:course number|kurs numarası|número de curso|number|code)\s*:?\s*/i, "").trim();
          } else if (!associatedWith && s.length < 120 && s !== name && !isAdNoise(s)) {
            associatedWith = s;
          }
        }

        const key = name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          out.push({
            name,
            number: number || undefined,
            associatedWith: associatedWith || undefined,
          });
        }
      }
    }

    const clean = cleanItems(out);
    return clean.length ? clean : undefined;
  };
})();
