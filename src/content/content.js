// content.js (main orchestrator)
// IMPORTANT: This file assumes the following have already been loaded in this order:
// utils.js, jsonld.js, header.js, contact.js, about.js, experience.js,
// education.js, certifications.js, publications.js, skills.js,
// languages.js, honors.js, interests.js

// Main Orchestrator using namespace functions
(function () {
  const ns = window.__LNP_NS__ || {};

  function extractFromJsonLd() {
    try {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      );
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!/Person/i.test(txt)) continue;
        const json = JSON.parse(txt);
        const person = Array.isArray(json)
          ? json.find((j) => j['@type'] === 'Person')
          : json;
        if (person && person['@type'] === 'Person') {
          return {
            name: person.name || undefined,
            headline: person.jobTitle || person.description || undefined,
            location: person.address?.addressLocality || undefined,
          };
        }
      }
    } catch {}
    return {};
  }

  // LinkedIn is a SPA. After in-app navigation between profiles, the
  // <link rel="canonical"> and <meta property="og:url"> tags are often
  // STALE and still point at the previously-loaded page (frequently the
  // logged-in user's own profile). Live URL sources (tabUrl / location.href)
  // are authoritative and must be preferred.
  function extractPublicProfileURL(tabUrl) {
    const Q = (sel, root = document) => root.querySelector(sel);
    const cand = [
      tabUrl,
      location.href,
      Q('link[rel="canonical"]')?.href,
      Q('meta[property="og:url"]')?.content,
    ].filter(Boolean);
    for (const href of cand) {
      try {
        const u = new URL(href);
        if (/linkedin\.com/i.test(u.hostname) && /\/in\//i.test(u.pathname))
          return u.toString();
      } catch {}
    }
    return undefined;
  }

  function computeSlug(tabUrl) {
    const Q = (sel, root = document) => root.querySelector(sel);
    const sources = [
      tabUrl,
      location.href,
      Q('link[rel="canonical"]')?.href,
      Q('meta[property="og:url"]')?.content,
    ].filter(Boolean);
    for (const href of sources) {
      try {
        const url = new URL(href);
        const m = url.pathname.match(/\/in\/([^\/?#]+)/i);
        if (m && m[1]) return decodeURIComponent(m[1]);
      } catch {}
    }
    return undefined;
  }

  function extractContact() {
    function uniqueByCI(arr) {
      const out = [];
      const seen = new Set();
      for (const v of arr || []) {
        const t = (v || '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    }
    const QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const raw = uniqueByCI(
      QA('a[href^="mailto:"], a[href^="https://"], a[href^="http://"]')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean),
    );
    const isInternalLinkedIn = (u) => {
      try {
        const url = new URL(u);
        if (!/^https?:/i.test(url.protocol)) return false;
        return (
          url.hostname.endsWith('linkedin.com') || url.hostname === 'lnkd.in'
        );
      } catch {
        return false;
      }
    };
    const email = raw.find((h) => /^mailto:/i.test(h));
    const websites = raw
      .filter((h) => /^https?:\/\//i.test(h) && !isInternalLinkedIn(h))
      .slice(0, 5);
    return {
      email: email ? email.replace(/^mailto:/i, '') : undefined,
      websites: websites.length ? websites : undefined,
    };
  }

  // Expands lazy-loaded UI before extraction so collapsed sections
  // (Skills / Languages / Honors / Publications / Interests, plus
  // "see more" descriptions) are visible to the extractors. Without
  // this, sections selected by the user can come back empty.
  async function expandIfPossible() {
    try {
      if (typeof ns.expandUI === 'function') {
        await ns.expandUI();
        return;
      }
      if (
        typeof ns.clickMoreButtons === 'function' &&
        typeof ns.autoScroll === 'function'
      ) {
        await ns.clickMoreButtons();
        await ns.autoScroll(2);
        if (typeof ns.wait === 'function') await ns.wait(400);
      }
    } catch (e) {
      console.warn('[content] expand pre-extraction failed:', e);
    }
  }

  async function extractAll(msg) {
    // The popup's preview pings us with `quick: true` every time it
    // opens. In that mode we skip the lazy-load scroll pipeline (which
    // visibly moves the page) and only read whatever is already in
    // the DOM above the fold. The Export action sends a non-quick
    // request which performs the full PageDown sweep.
    if (!(msg && msg.quick)) {
      await expandIfPossible();
    }

    // Header
    const header = (ns.extractHeader && ns.extractHeader()) || {};
    const jsonld = extractFromJsonLd();

    const name = header.name || jsonld.name || 'LinkedIn Profile';
    const headline = header.headline || jsonld.headline || undefined;
    const location = header.location || jsonld.location || undefined;
    const profileImage = header.profileImage || undefined;

    // Contact + URL + slug
    const publicProfileUrl = extractPublicProfileURL(msg?.tabUrl);
    const slug = computeSlug(msg?.tabUrl);
    const contact = extractContact();
    if (publicProfileUrl) {
      contact.publicProfile = publicProfileUrl;
    }

    // Sections (guard each call)
    const about = ns.extractAbout ? ns.extractAbout() : undefined;
    const experiences = ns.extractExperience
      ? ns.extractExperience()
      : undefined;
    const education = ns.extractEducation ? ns.extractEducation() : undefined;
    const certifications = ns.extractCertifications
      ? ns.extractCertifications()
      : undefined;
    const skills = ns.extractSkills ? ns.extractSkills() : undefined;
    const languages = ns.extractLanguages ? ns.extractLanguages() : undefined;
    const honors = ns.extractHonorsAwards
      ? ns.extractHonorsAwards()
      : undefined;
    const publications = ns.extractPublications
      ? ns.extractPublications()
      : undefined;
    const interests = ns.extractInterests ? ns.extractInterests() : undefined;

    const data = {
      name,
      headline,
      location,
      slug,
      profileImage,
      contact,
      about,
      experiences,
      education,
      certifications,
      skills,
      languages,
      honors,
      publications,
      interests,
      lastUpdatedISO: new Date().toISOString(),
    };
    return typeof ns.sanitizeExportPayload === 'function'
      ? ns.sanitizeExportPayload(data) || {}
      : data;
  }

  // Maps a section name (as used by the deep-export orchestrator) to the
  // namespaced extractor function that produces its payload.
  const SECTION_EXTRACTORS = {
    about: 'extractAbout',
    experience: 'extractExperience',
    education: 'extractEducation',
    certifications: 'extractCertifications',
    skills: 'extractSkills',
    languages: 'extractLanguages',
    honors: 'extractHonorsAwards',
    publications: 'extractPublications',
    interests: 'extractInterests',
  };

  // Runs a single section extractor after ensuring lazy content is
  // loaded. Used by the background service worker when performing a
  // deep export from a /details/<section>/ sub-page.
  async function extractSection(msg) {
    const section = typeof msg === 'string' ? msg : msg?.section;
    const budgetMs =
      typeof msg === 'object' && msg && typeof msg.budgetMs === 'number'
        ? msg.budgetMs
        : 0;
    if (budgetMs > 0 && typeof ns.expandUIWithBudget === 'function') {
      await ns.expandUIWithBudget(budgetMs, section);
    } else {
      await expandIfPossible();
    }
    const fnName = SECTION_EXTRACTORS[section];
    if (!fnName || typeof ns[fnName] !== 'function') return undefined;
    try {
      return ns[fnName]();
    } catch (e) {
      console.error('[lnp] extractSection error', section, e);
      return undefined;
    }
  }

  // Chrome runtime message (guard: programmatic re-inject via
  // chrome.scripting must not register duplicate listeners).
  if (
    typeof chrome !== 'undefined' &&
    chrome.runtime?.onMessage &&
    !window.__LNP_CS_MESSAGE_ROUTER__
  ) {
    window.__LNP_CS_MESSAGE_ROUTER__ = true;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'PING_LNP') {
        // Lightweight readiness probe used by the popup and by the
        // background orchestrator right after opening a details tab.
        sendResponse({ ok: true });
        return false;
      }
      if (msg?.type === 'EXTRACT_PROFILE') {
        (async () => {
          try {
            const data = await extractAll(msg);
            sendResponse(data);
          } catch (e) {
            console.error('Extraction error', e);
            sendResponse({ name: 'LinkedIn Profile' });
          }
        })();
        return true;
      }
      if (msg?.type === 'EXTRACT_SECTION') {
        (async () => {
          try {
            const rawValue = await extractSection(msg);
            const value =
              typeof ns.sanitizeExportPayload === 'function'
                ? ns.sanitizeExportPayload(rawValue)
                : rawValue;
            const response = { ok: true, section: msg.section, value };
            sendResponse(response);
          } catch (e) {
            console.error('[lnp] EXTRACT_SECTION error', e);
            sendResponse({
              ok: false,
              section: msg.section,
              error: String(e),
            });
          }
        })();
        return true;
      }
    });
  }

  window.__LNP_extractAll = extractAll;
})();

// --- START_EXPORT handler (separate listener; guard against re-inject)
if (
  typeof chrome !== 'undefined' &&
  chrome.runtime?.onMessage &&
  !window.__LNP_CS_START_EXPORT__
) {
  window.__LNP_CS_START_EXPORT__ = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'START_EXPORT') {
      (async () => {
        try {
          // 1) Extract
          const data = await window.__LNP_extractAll({ tabUrl: location.href });

          // 2) Store (use callback, not await)
          const nonce = `lnp_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;
          const payload = { [nonce]: { data, settings: msg.settings } };

          chrome.storage.local.set(payload, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              console.error('[content] storage.set error:', err);
              sendResponse({ ok: false, error: String(err) });
              return;
            }

            // 3) Open print page AFTER storage write is done
            const printUrl = chrome.runtime.getURL(
              `src/print/print.html?nonce=${encodeURIComponent(nonce)}`,
            );
            window.open(printUrl, '_blank', 'noopener');

            sendResponse({ ok: true, nonce });
          });
        } catch (err) {
          console.error('[content] START_EXPORT error:', err);
          sendResponse({ ok: false, error: String(err) });
        }
      })();

      return true; // keep the channel open for async sendResponse
    }
  });
}
