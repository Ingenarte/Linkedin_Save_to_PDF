// content.js (main orchestrator)
// IMPORTANT: This file assumes the following have already been loaded in this order:
// utils.js, jsonld.js, header.js, contact.js, about.js, experience.js,
// education.js, certifications.js, publications.js, skills.js,
// languages.js, honors.js, interests.js, printTable.js, bridge.js

// Main Orchestrator using namespace functions
(function () {
  const ns = window.__LNP_NS__ || {};

  function extractFromJsonLd() {
    try {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
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

  function extractPublicProfileURL(tabUrl) {
    const Q = (sel, root = document) => root.querySelector(sel);
    const cand = [
      Q('link[rel="canonical"]')?.href,
      Q('meta[property="og:url"]')?.content,
      tabUrl,
      location.href,
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
      Q('link[rel="canonical"]')?.href,
      Q('meta[property="og:url"]')?.content,
      tabUrl,
      location.href,
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
        .filter(Boolean)
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

  async function extractAll(msg) {
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

    return {
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
  }

  // Console summary (sin preview de imagen)
  function LNP_printTable(data) {
    const d = data || {};
    const summary = {
      name: !!d.name,
      headline: !!d.headline,
      location: !!d.location,
      slug: !!d.slug,
      contact: !!d.contact,
      profileImage: !!d.profileImage,
      about_len: d.about?.length || 0,
      experiences: d.experiences?.length || 0,
      education: d.education?.length || 0,
      certifications: d.certifications?.length || 0,
      skills: d.skills?.length || 0,
      publications: d.publications?.length || 0,
      languages: d.languages?.length || 0,
      honors: d.honors?.length || 0,
      interests: d.interests?.length || 0,
    };
    console.log('EXTRACTED DATA');
    console.table(summary);
  }

  // Chrome runtime message
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'EXTRACT_PROFILE') {
        (async () => {
          try {
            const data = await extractAll(msg);
            LNP_printTable(data);
            sendResponse(data);
          } catch (e) {
            console.error('Extraction error', e);
            sendResponse({ name: 'LinkedIn Profile' });
          }
        })();
        return true;
      }
    });
  }

  // Window bridge
  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== '__LNP_EXTRACT_REQ') return;
    try {
      const data = await extractAll({ tabUrl: location.href });
      window.postMessage({ type: '__LNP_EXTRACT_RES', payload: data }, '*');
      LNP_printTable(data);
    } catch (err) {
      console.error('extract error', err);
    }
  });

  // Dev helpers
  window.__LNP_extractAll = extractAll;
  window.LNP_table = async function () {
    const data = await extractAll({ tabUrl: location.href });
    LNP_printTable(data);
    return data;
  };

  // Inject page-level APIs so console Top can call linkedin_ats_test()
  (function installPageAPIs() {
    try {
      if (window.__lnp_page_api_installed__) return;
      const hookUrl = chrome.runtime.getURL('page-hook.js'); // declared in web_accessible_resources

      const s = document.createElement('script');
      s.src = hookUrl;
      s.async = false;
      s.onload = function () {
        this.remove();
        window.__lnp_page_api_installed__ = true;
        console.debug('[lnp] content: page API injected via page-hook.js');
      };
      (document.documentElement || document.head || document.body).appendChild(
        s
      );
    } catch (e) {
      console.error('[lnp] content: failed to install page API', e);
    }
  })();
})();
