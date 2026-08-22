(function () {
  "use strict";

  const ns = window.__LNP_NS__ || (window.__LNP_NS__ = {});
  window.__lnp = ns;

  ns.extractRecommendations = function extractRecommendations() {
    try {
      const norm =
        ns.norm ||
        ((value) =>
          String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim());

      const getText =
        ns.T ||
        ((element) => norm(element?.textContent || ""));

      const dedupeText =
        ns.dedupeText ||
        ((value) => norm(value));

      const isAdNoise =
        typeof ns.isLinkedInAdOrPreferenceText === "function"
          ? ns.isLinkedInAdOrPreferenceText
          : () => false;

      const cleanItems =
        typeof ns.withoutLinkedInAdPreferenceItems === "function"
          ? ns.withoutLinkedInAdPreferenceItems
          : (items) => items;

      const Q = (selector, root = document) =>
        (root || document).querySelector(selector);

      const QA = (selector, root = document) =>
        Array.from((root || document).querySelectorAll(selector));

      const EXCLUDED_SELECTOR = [
        "footer",
        "aside",
        "nav",
        "[role=\"contentinfo\"]",
        "[role=\"banner\"]",
        ".global-footer",
        ".scaffold-layout__aside",
      ].join(",");

      const RECOMMENDATION_HEADING_REGEX =
        /\b(recommendations?|tavsiyeler|recomendaciones|empfehlungen)\b/i;

      const RECEIVED_REGEX =
        /\b(received|al\u0131nan|gelen|received recommendations|al\u0131nan tavsiyeler)\b/i;

      const RELATIONSHIP_REGEX =
        /\b(managed|managed directly|worked with|worked directly with|reported to|client|colleague|coworker|supervisor|manager|teammate|team member|partner|worked together|birlikte \u00e7al\u0131\u015ft\u0131k|birlikte \u00e7al\u0131\u015ft\u0131|y\u00f6neticimdi|y\u00f6neticisiydim|\u00e7al\u0131\u015fan\u0131md\u0131|dan\u0131\u015fman|m\u00fc\u015fteri|i\u015f arkada\u015f\u0131|meslekta\u015f\u0131|y\u00f6netici)\b/i;

      const EXACT_NOISE_REGEX =
        /^(?:show all pending|show all|pending|bekleyen|show more|see more|more|daha fazla|daha \u00e7ok|devam\u0131n\u0131 g\u00f6r|t\u00fcm\u00fcn\u00fc g\u00f6ster|received|given|al\u0131nan|verilen|recommendations?|tavsiyeler|nothing to see for now)$/i;

      const EMPTY_STATE_REGEX =
        /nothing to see for now|when you add (?:new )?recommendations|recommendations? that .+ will appear here|no recommendations? (?:yet|to show)/i;

      const EXPAND_BUTTON_REGEX =
        /\b(?:more|show more|see more|daha fazla|devam\u0131n\u0131 g\u00f6r|ver m[a\u00e1]s|mehr)\b/i;

      function clickAllExpanders(root) {
        if (!root || root === document.body) return;
        try {
          const btns = QA(
            'button.inline-show-more-text__button, button[data-testid="expandable-text-button"], button[aria-expanded="false"], button',
            root
          );
          for (const b of btns) {
            if (b.tagName === 'A' || b.closest('a[href]')) continue;
            const t = norm(b.getAttribute("aria-label") || b.textContent || "").toLowerCase();
            if (
              /\b(more|see more|show more|daha fazla|devamını gör|ver m[aá]s|mehr)\b/i.test(t) ||
              b.classList.contains("inline-show-more-text__button") ||
              b.getAttribute("data-testid") === "expandable-text-button"
            ) {
              try { b.click(); } catch (_) {}
            }
          }
        } catch (_) {}
      }

      function cleanName(val) {
        let n = norm(val);
        if (!n) return "";
        n = n
          .replace(/\s*[·•]\s*(?:1st|2nd|3rd|\d+(?:\.|º|ª)?\s*(?:degree|derece|st|nd|rd))\.?\s*$/i, "")
          .replace(/\b(?:1st|2nd|3rd)\b\s*$/i, "")
          .trim();
        if (EXACT_NOISE_REGEX.test(n) || EMPTY_STATE_REGEX.test(n) || isAdNoise(n))
          return "";
        return n;
      }

      function cleanText(val) {
        let t = norm(val);
        if (!t) return "";
        t = t
          .replace(/(?:\.{2,3}|\u2026)\s*(?:see more|show more|more|daha fazla|devamını gör|ver m[aá]s|mehr)\s*$/i, "")
          .replace(/\b(?:see more|show more|daha fazla|devamını gör)\s*$/i, "")
          .trim();
        if (EXACT_NOISE_REGEX.test(t) || EMPTY_STATE_REGEX.test(t) || isAdNoise(t))
          return "";
        return t;
      }

      const isDetails =
        (typeof ns.isDetailsPage === "function" && ns.isDetailsPage() && /recommendations/i.test(location.pathname)) ||
        /\/details\/recommendations/i.test(location.pathname);

      let root = null;
      if (isDetails) {
        root =
          Q("main .scaffold-finite-scroll__content") ||
          Q("main .scaffold-layout__main") ||
          Q("main [role=\"main\"]") ||
          Q("main");
      } else {
        root =
          (typeof ns.getSectionRoot === "function" ? ns.getSectionRoot("recommendations") : null) ||
          (typeof ns.findSection === "function" ? ns.findSection(RECOMMENDATION_HEADING_REGEX) : null) ||
          Q('section[componentkey*="Recommendation" i]') ||
          Q('div[componentkey*="Recommendation" i]') ||
          Q('section[id*="recommendation" i]') ||
          Q('div[id*="recommendation" i]') ||
          Q('section[aria-label*="recommendation" i]') ||
          Q('section[aria-label*="tavsiye" i]');
      }

      if (!root) {
        return undefined;
      }

      const ownerName = norm(Q('h1.inline.t-24.v-align-middle, h1, .pv-top-card--list h1')?.textContent || "").toLowerCase();
      const ownerSlug = (location.pathname.match(/\/in\/([^\/?#]+)/i)?.[1] || "").toLowerCase();

      let textBoxes = QA('[data-testid="expandable-text-box"], div.inline-show-more-text', root);
      if (!textBoxes.length) {
        textBoxes = QA('blockquote, div[class*="recommendation-text"], p', root).filter((el) => {
          if (el.closest('footer, nav, aside, header[role="banner"]')) return false;
          return norm(el.textContent || "").length > 35;
        });
      }

      const results = [];
      const seen = new Set();

      if (textBoxes.length) {
        for (const tb of textBoxes) {
          if (tb.closest('footer, nav, aside, header[role="banner"]')) continue;

          let card = tb.closest('li, [role="listitem"], [componentkey*="entity-collection-item" i], div.artdeco-card');
          if (!card) {
            card = tb.parentElement;
            for (let d = 0; d < 5 && card && card !== root; d++) {
              if (card.querySelector('a[href*="/in/"]')) break;
              card = card.parentElement;
            }
          }
          if (!card) card = tb.parentElement || tb;

          clickAllExpanders(card);

          const links = QA('a[href*="/in/"]', card);
          let recommenderLink = links.find((a) => {
            const h = (a.getAttribute("href") || "").toLowerCase();
            if (ownerSlug && h.includes(`/in/${ownerSlug}`)) return false;
            return true;
          }) || links[0];

          let recommenderName = "";
          if (recommenderLink) {
            const nameEl = recommenderLink.querySelector('span[aria-hidden="true"], strong, h3, h4') || recommenderLink;
            recommenderName = cleanName(getText(nameEl));
          }

          if (!recommenderName) {
            const head = card.querySelector('h3, h4, .t-bold span[aria-hidden="true"], .t-bold');
            if (head) recommenderName = cleanName(getText(head));
          }

          const clone = tb.cloneNode(true);
          QA('button, [data-testid="expandable-text-button"], .inline-show-more-text__button', clone).forEach((n) => n.remove());
          const text = cleanText(getText(clone));

          if (!text || text.length < 15) continue;

          let recommenderTitle = "";
          let relationship = "";

          const allSpans = QA('span[aria-hidden="true"], p', card).map((el) => {
            const c = el.cloneNode(true);
            QA('button, [data-testid="expandable-text-button"], .inline-show-more-text__button', c).forEach((n) => n.remove());
            return cleanText(getText(c));
          }).filter((s) => s && s !== text && s !== recommenderName && !EXACT_NOISE_REGEX.test(s));

          for (const s of allSpans) {
            if (!relationship && RELATIONSHIP_REGEX.test(s) && s.length < 300) {
              relationship = s;
            } else if (!recommenderTitle && s.length < 140 && !RELATIONSHIP_REGEX.test(s)) {
              recommenderTitle = s;
            }
          }

          if (!recommenderName && allSpans.length) {
            recommenderName = cleanName(allSpans[0]);
          }

          if (!recommenderName || recommenderName.length < 2) continue;
          if (ownerName && recommenderName.toLowerCase() === ownerName) continue;
          if (ownerName && ownerName.includes(recommenderName.toLowerCase())) continue;

          const key = (recommenderName + "::" + text.slice(0, 80)).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            recommenderName,
            recommenderTitle: recommenderTitle || undefined,
            relationship: relationship || undefined,
            text,
          });
        }
      }

      if (!results.length) {
        const rows = QA('li.pvs-list__paged-list-item, [role="listitem"], li.artdeco-list__item', root);
        for (const row of rows) {
          if (row.closest("footer, nav, aside")) continue;
          clickAllExpanders(row);

          const links = QA('a[href*="/in/"]', row);
          const link = links.find((a) => {
            const h = (a.getAttribute("href") || "").toLowerCase();
            return !ownerSlug || !h.includes(`/in/${ownerSlug}`);
          }) || links[0];

          let name = "";
          if (link) {
            const nameEl = link.querySelector('span[aria-hidden="true"], strong, h3') || link;
            name = cleanName(getText(nameEl));
          }

          if (ownerName && name.toLowerCase() === ownerName) continue;
          if (ownerName && ownerName.includes(name.toLowerCase())) continue;

          const spans = QA('span[aria-hidden="true"], p', row).map((el) => {
            const c = el.cloneNode(true);
            QA('button, [data-testid="expandable-text-button"], .inline-show-more-text__button', c).forEach((n) => n.remove());
            return cleanText(getText(c));
          }).filter((s) => s && s !== name && !EXACT_NOISE_REGEX.test(s));

          let rel = "";
          let title = "";
          let body = "";

          const longTexts = spans.filter((s) => s.length > 30);
          if (longTexts.length) {
            longTexts.sort((a, b) => b.length - a.length);
            body = longTexts[0];
          }

          for (const s of spans) {
            if (s === body) continue;
            if (!rel && RELATIONSHIP_REGEX.test(s) && s.length < 300) rel = s;
            else if (!title && s.length < 140) title = s;
          }

          if (name && (body || rel)) {
            const key = (name + "::" + (body || rel).slice(0, 80)).toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                recommenderName: name,
                recommenderTitle: title || undefined,
                relationship: rel || undefined,
                text: body || undefined,
              });
            }
          }
        }
      }

      const cleaned = cleanItems(results).filter((item) => {
        if (!item?.recommenderName) return false;
        const blob = [item.recommenderName, item.recommenderTitle, item.text]
          .filter(Boolean)
          .join(' ');
        if (EMPTY_STATE_REGEX.test(blob)) return false;
        return (
          !isAdNoise(item.recommenderName) &&
          !EXACT_NOISE_REGEX.test(item.recommenderName)
        );
      });

      return cleaned.length ? cleaned : undefined;
    } catch (error) {
      console.error("[LNP] extractRecommendations error:", error);
      return undefined;
    }
  };
})();
