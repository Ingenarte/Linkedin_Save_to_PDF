// content.js (main orchestrator)
// IMPORTANT: This file assumes the following have already been loaded in this order:
// utils.js, jsonld.js, header.js, contact.js, about.js, experience.js,
// education.js, projects.js, certifications.js, publications.js, skills.js,
// languages.js, honors.js

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
    if (ns.extractContact && typeof ns.extractContact === 'function') {
      return ns.extractContact();
    }
    return {};
  }

  // Expands lazy-loaded UI before extraction so collapsed sections
  // (Skills / Languages / Honors / Publications, plus
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
    const projects = ns.extractProjects ? ns.extractProjects() : undefined;
    const courses = ns.extractCourses ? ns.extractCourses() : undefined;
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
    const recommendations = ns.extractRecommendations
      ? ns.extractRecommendations()
      : undefined;

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
      projects,
      courses,
      certifications,
      skills,
      languages,
      honors,
      publications,
      recommendations,
      lastUpdatedISO: new Date().toISOString(),
    };
    return typeof ns.sanitizeExportPayload === 'function'
      ? ns.sanitizeExportPayload(data) || {}
      : data;
  }

  const SECTION_EXTRACTORS = {
    about: 'extractAbout',
    experience: 'extractExperience',
    education: 'extractEducation',
    projects: 'extractProjects',
    courses: 'extractCourses',
    certifications: 'extractCertifications',
    skills: 'extractSkills',
    languages: 'extractLanguages',
    honors: 'extractHonorsAwards',
    publications: 'extractPublications',
    recommendations: 'extractRecommendations',
  };

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

  // Full-width busy strip on the profile tab while the background deep-export
  // job runs (same visuals as tools/full_info_retrieve/collect.mjs overlay).
  const LNP_DEEP_BUSY_OVERLAY_ID = 'lnp-deep-busy-overlay';
  let lnpDeepBusySecTimer = null;

  function removeDeepExportBusyOverlayInPage() {
    try {
      const root = document.getElementById(LNP_DEEP_BUSY_OVERLAY_ID);
      if (root) root.remove();
      const styleEl = document.getElementById(`${LNP_DEEP_BUSY_OVERLAY_ID}-styles`);
      if (styleEl) styleEl.remove();
      if (lnpDeepBusySecTimer != null) {
        clearInterval(lnpDeepBusySecTimer);
        lnpDeepBusySecTimer = null;
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function showDeepExportBusyOverlayInPage() {
    removeDeepExportBusyOverlayInPage();
    const sid = `${LNP_DEEP_BUSY_OVERLAY_ID}-styles`;
    if (!document.getElementById(sid)) {
      const style = document.createElement('style');
      style.id = sid;
      style.textContent =
        '@keyframes lnpBusyBar{0%{background-position:0% 50%}100%{background-position:200% 50%}}';
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.id = LNP_DEEP_BUSY_OVERLAY_ID;
    root.setAttribute(
      'style',
      [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:2147483646',
        'pointer-events:none',
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'font-size:13px',
        'line-height:1.35',
        'padding:10px 16px 11px',
        'color:#fff',
        'text-align:center',
        'background:linear-gradient(90deg,#0a66c2 0%,#378fd6 50%,#0a66c2 100%)',
        'background-size:200% 100%',
        'animation:lnpBusyBar 3s linear infinite',
        'box-shadow:0 2px 12px rgba(0,0,0,0.18)',
      ].join(';'),
    );
    root.innerHTML =
      '<span id="lnp-deep-busy-text">Full profile PDF export in progress…</span>';
    document.documentElement.appendChild(root);
    let sec = 0;
    lnpDeepBusySecTimer = setInterval(() => {
      sec += 1;
      const el = document.getElementById('lnp-deep-busy-text');
      if (el) {
        el.textContent = `Full profile PDF export in progress… (${sec}s)`;
      }
    }, 1000);
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
      if (msg?.type === 'DEEP_EXPORT_BUSY_OVERLAY') {
        if (window !== window.top) {
          sendResponse({ ok: true });
          return false;
        }
        try {
          if (msg.action === 'show') showDeepExportBusyOverlayInPage();
          else if (msg.action === 'hide') removeDeepExportBusyOverlayInPage();
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
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
      if (msg?.type === 'START_EXPORT') {
        const prev = window.__LNP_START_EXPORT_TAIL__ || Promise.resolve();
        const job = prev.catch(() => {}).then(async () => {
          let done = false;
          const finish = (payload) => {
            if (done) return;
            done = true;
            try {
              sendResponse(payload);
            } catch (_e) {
              /* response channel may already be invalid */
            }
          };
          const hangTimer = setTimeout(() => {
            finish({
              ok: false,
              error:
                'START_EXPORT timed out (extract/storage). Try reloading the LinkedIn tab.',
            });
          }, 120000);
          try {
            const data = await Promise.race([
              extractAll({ tabUrl: location.href }),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('extractAll exceeded 90s')), 90000),
              ),
            ]);
            const nonce = `lnp_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}`;
            const payload = {
              [nonce]: {
                data,
                settings: msg.settings,
                exportKind: 'basicexport',
              },
            };
            chrome.storage.local.set(payload, () => {
              clearTimeout(hangTimer);
              const err = chrome.runtime.lastError;
              if (err) {
                console.error('[content] storage.set error:', err);
                finish({ ok: false, error: String(err) });
                return;
              }
              finish({ ok: true, nonce });
            });
          } catch (err) {
            clearTimeout(hangTimer);
            console.error('[content] START_EXPORT error:', err);
            finish({ ok: false, error: String(err) });
          }
        });
        window.__LNP_START_EXPORT_TAIL__ = job;
        void job.catch(() => {});
        return true;
      }
      return false;
    });
  }

  window.__LNP_extractAll = extractAll;
})();

// Playwright/CDP: page.evaluate cannot trigger chrome.commands. The page and the
// content script share the same DOM node document.documentElement; a synthetic
// attribute change is visible to a MutationObserver in the isolated world.
(function initLnpAutomationBridge() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return;
  if (window.__LNP_AUTOMATION_BRIDGE_V3__) return;
  window.__LNP_AUTOMATION_BRIDGE_V3__ = true;
  const ATTR = 'data-lnp-automation-export';
  /** Mirrors DEFAULT_EXPORT_SETTINGS in background.js — full capture for Playwright runs. */
  const AUTOMATION_EXPORT_SETTINGS = {
    profileHeader: true,
    contact: true,
    withPhoto: true,
    about: true,
    experience: true,
    education: true,
    projects: true,
    courses: true,
    certifications: true,
    skills: true,
    languages: true,
    honors: true,
    publications: true,
    recommendations: true,
  };
  let automationBridgeBusy = false;
  try {
    document.documentElement.setAttribute('data-lnp-cs-ready', '1');
  } catch (_e) {
    /* ignore */
  }
  const obs = new MutationObserver(() => {
    try {
      const mode = document.documentElement.getAttribute(ATTR);
      if (mode !== 'single' && mode !== 'deep') return;
      if (automationBridgeBusy) {
        console.warn('[lnp] automation bridge busy; ignoring duplicate trigger');
        return;
      }
      automationBridgeBusy = true;
      document.documentElement.removeAttribute(ATTR);
      setTimeout(() => {
        let settled = false;
        let port;
        const settle = (payload) => {
          if (settled) return;
          settled = true;
          automationBridgeBusy = false;
          try {
            document.documentElement.setAttribute(
              'data-lnp-automation-result',
              encodeURIComponent(JSON.stringify(payload)),
            );
          } catch (_e) {
            console.warn('[lnp] automation result DOM write failed');
          }
          try {
            if (port) port.disconnect();
          } catch (_e) {
            /* ignore */
          }
        };
        try {
          port = chrome.runtime.connect({ name: 'lnp-full-info-automation' });
        } catch (e) {
          settle({ ok: false, error: String(e?.message || e) });
          return;
        }
        port.onMessage.addListener((response) => {
          if (response && response.ok === false) {
            settle({
              ok: false,
              error: String(response.error || 'LNP_AUTOMATION_EXPORT failed'),
            });
          } else {
            settle({ ok: true });
          }
        });
        port.onDisconnect.addListener(() => {
          if (settled) return;
          const err = chrome.runtime.lastError;
          settle({
            ok: false,
            error: String(
              err?.message || 'port disconnected before automation finished',
            ),
          });
        });
        try {
          port.postMessage({
            type: 'LNP_AUTOMATION_EXPORT',
            mode,
            exportSettings: AUTOMATION_EXPORT_SETTINGS,
          });
        } catch (e) {
          settle({ ok: false, error: String(e?.message || e) });
        }
      }, 0);
    } catch (e) {
      console.warn('[lnp] automation bridge', e);
    }
  });
  try {
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR],
    });
  } catch (e) {
    console.warn('[lnp] automation MutationObserver failed', e);
  }
})();
