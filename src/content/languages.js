// languages.js
(function () {
  const ns = window.__LNP_NS__ || (window.__LNP_NS__ = {});
  ns.extractLanguages = function extractLanguages() {
    const { findSection, Q, QA, pickVisibleText, norm } = ns;
    const isAdNoise =
      typeof ns.isLinkedInAdOrPreferenceText === 'function'
        ? ns.isLinkedInAdOrPreferenceText
        : () => false;
    const cleanItems =
      typeof ns.withoutLinkedInAdPreferenceItems === 'function'
        ? ns.withoutLinkedInAdPreferenceItems
        : (items) => items;
    const rootResolver = ns.getSectionRoot || findSection;
    const sec =
      rootResolver({
        key: 'languages',
        heading: /languages|idiomas/i,
      }) ||
      Q('section[id*="languages"]') ||
      Q('section[aria-label*="language" i]');
    if (!sec) {
      return undefined;
    }

    // English UI + common localized LinkedIn labels (NL/DE/FR/ES/PT).
    const PROF_RE =
      /^(native or bilingual proficiency|full professional proficiency|professional working proficiency|limited working proficiency|elementary proficiency|moedertaal of tweetalig|volledige professionele vaardigheid|professionele werkvaardigheid|beperkte werkvaardigheid|elementaire kennis|muttersprache|zweisprachig|volle professionelle arbeitskompetenz|berufliche arbeitskompetenz|begrenzte arbeitskompetenz|grundkenntnisse|langue maternelle|bilingue|professionnel complet|professionnel limité|notions|nativo o bilingüe|competencia profesional completa|competencia profesional|competencia limitada|conocimientos básicos|fluente|intermediário|básico)$/i;
    const looksLikeProficiencyLine = (text) => {
      if (PROF_RE.test(text || '')) return true;
      const t = norm(text || '').toLowerCase();
      if (t.length < 6 || t.length > 130) return false;
      // Real proficiency labels are short (≤ ~5 words, e.g. "Native or
      // bilingual proficiency"). A longer sentence that merely contains
      // "professional" — e.g. the leaked "...goes against our Professional
      // Community Policies, please let us know." — is NOT a proficiency line.
      if (t.split(/\s+/).filter(Boolean).length > 6) return false;
      if (/(policies|let us know|goes against|seen the same ad)/i.test(t))
        return false;
      return /\b(proficiency|professional|native|bilingual|elementary|limited|working|vaardigheid|kennis|niveau|moedertaal|beruflich|fließend|fluent|fluido|limitada|basico|básico|intermediate)\b/i.test(
        t,
      );
    };
    const isSectionLabel = (text) =>
      /^(languages?|idiomas?)(?:\s*\(\d+\))?$/i.test(text || '');
    const isStructuralNoise = (text) =>
      /^(show all|see all|mostrar todo|ver todo)$/i.test(text || '') ||
      isSectionLabel(text);
    const addLanguage = (target, language, proficiency, seen) => {
      const cleanLanguage = ns.dedupeText(norm(language || ''));
      const cleanProficiency = norm(proficiency || '');
      if (
        !cleanLanguage ||
        !cleanProficiency ||
        !looksLikeProficiencyLine(cleanProficiency) ||
        looksLikeProficiencyLine(cleanLanguage) ||
        isStructuralNoise(cleanLanguage) ||
        isAdNoise(cleanLanguage) ||
        isAdNoise(cleanProficiency)
      ) {
        return;
      }
      const key = cleanLanguage.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      target.push({
        language: cleanLanguage,
        proficiency: cleanProficiency,
      });
    };

    const out = [];
    const seen = new Set();

    // 2026 SDUI often renders Languages as ordered leaf text:
    // Languages (3), English, Full professional proficiency, Portuguese, ...
    // Pair each proficiency with the nearest previous non-structural label.
    const addFromOrderedTexts = (texts) => {
      for (let i = 0; i < texts.length; i++) {
        if (!looksLikeProficiencyLine(texts[i])) continue;
        for (let j = i - 1; j >= 0; j--) {
          const candidate = texts[j];
          if (looksLikeProficiencyLine(candidate) || isStructuralNoise(candidate))
          continue;
          addLanguage(out, candidate, texts[i], seen);
          break;
        }
      }
    };

    // Details pages can render LanguageDetails as <p> leaves instead of the
    // span[aria-hidden] leaves used on profile root cards.
    if (ns.isDetailsPage?.() && ns.currentDetailsKind?.() === 'languages') {
      const detailRoots = QA('[componentkey*="LanguageDetails"]');
      let bestTexts = [];
      let bestScore = -1;
      for (const root of detailRoots) {
        const texts = QA('p', root)
          .map((node) => norm(node.textContent || node.innerText || ''))
          .filter(Boolean)
          .filter((text) => !isAdNoise(text));
        const proficiencyCount = texts.filter((text) =>
          looksLikeProficiencyLine(text),
        ).length;
        const languageCandidateCount = texts.filter(
          (text) =>
            !looksLikeProficiencyLine(text) && !isStructuralNoise(text),
        ).length;
        const score = proficiencyCount * 2 + languageCandidateCount;
        if (score > bestScore) {
          bestScore = score;
          bestTexts = texts;
        }
      }
      if (bestTexts.length) {
        addFromOrderedTexts(bestTexts);
      }
    }

    if (typeof ns.collectTextSpans === 'function') {
      const spans = ns
        .collectTextSpans(sec)
        .map((text) => norm(text))
        .filter(Boolean)
        .filter((text) => !isAdNoise(text));
      addFromOrderedTexts(spans);
    }

    // Supplemental row parser for DOM variants where each language row is
    // available as a generic item.
    if (typeof ns.collectGenericRows === 'function') {
      const rows = ns.collectGenericRows(sec);
      for (const r of rows) {
        const spans = ns.collectTextSpans(r).map((text) => norm(text)).filter(Boolean);
        if (!spans.length || spans.some(isAdNoise)) continue;
        const proficiencyIndex = spans.findIndex((text) =>
          looksLikeProficiencyLine(text),
        );
        if (proficiencyIndex <= 0) continue;
        addLanguage(out, spans[proficiencyIndex - 1], spans[proficiencyIndex], seen);
      }
    }

    if (out.length) {
      const clean = cleanItems(out);
      if (clean.length) return clean;
    }

    // Legacy fallback
    const rows = QA('li, article', sec);
    for (const r of rows) {
      const language =
        norm(
          pickVisibleText(
            r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]'),
          ),
        ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
      const proficiency = norm(
        pickVisibleText(
          r.querySelectorAll('span.t-14.t-normal, span.t-12, .t-black--light'),
        ),
      );
      addLanguage(out, language, proficiency, seen);
    }
    const clean = cleanItems(out);
    return clean.length ? clean : undefined;
  };
})();
