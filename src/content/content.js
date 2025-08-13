// Heuristic DOM extractor for LinkedIn profile pages (no build step).
// Focus: expand lazy content, deduplicate repeated text, normalize dates, and compute slug.
// Adds: contact, languages (with proficiency), certifications, honors/awards, publications, interests.

///////////////////////
// Boot
///////////////////////
console.log('[lnp] content LOADED', location.href);

///////////////////////
// Utilities
///////////////////////
const T = (el) => ((el && el.textContent) || '').trim();
const Q = (sel, root = document) => root.querySelector(sel);
const QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const norm = (s) => (s ? s.replace(/\s+/g, ' ').trim() : s);

function uniqueByCI(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const t = norm(v);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

// Remove consecutive duplicate lines and inline doubled phrases like "FooFoo"
function dedupeText(s) {
  if (!s) return s;
  const parts = s
    .split(/\n+|(?<=\.)\s+(?=[A-Z])|(?<=\!)\s+|(?<=\?)\s+/)
    .map((x) => norm(x))
    .filter(Boolean);
  const out = [];
  let last = '';
  for (let p of parts) {
    let v = p;
    if (v.length % 2 === 0) {
      const half = v.slice(0, v.length / 2);
      if (half && v === half + half) v = half;
    }
    if (v && v !== last) {
      out.push(v);
      last = v;
    }
  }
  return out.join(' ');
}

// Prefer visible text and avoid mixing aria-hidden variants
function pickVisibleText(nodes) {
  const arr = Array.from(nodes || []);
  const hidden = arr.find(
    (n) => n.getAttribute && n.getAttribute('aria-hidden') === 'true'
  );
  return T(hidden || arr[0] || null);
}
function pickRoleNode(container) {
  return (
    Q('h3', container) ||
    Q("span[aria-hidden='true']", container) ||
    Q('span', container)
  );
}

///////////////////////
// Expand “see more” and lazy content
///////////////////////
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function autoScroll(passes = 1) {
  for (let p = 0; p < passes; p++) {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await wait(140);
    }
  }
  window.scrollTo(0, 0);
}

async function clickMoreButtons() {
  // English-only triggers per your requirement
  const re = /see more|show more|show all/i;
  const candidates = QA('button, a[role="button"]').filter((b) =>
    re.test(b.textContent || '')
  );
  for (const btn of candidates) {
    try {
      btn.click();
    } catch {}
  }
  // Some containers gate content behind aria-expanded
  QA('[aria-expanded="false"]').forEach((el) => {
    try {
      el.click();
    } catch {}
  });
}

async function expandUI() {
  await clickMoreButtons();
  await autoScroll(4);
  await wait(600);
}

///////////////////////
// Section discovery helpers
///////////////////////
function hasHeader(sec, re) {
  const h = sec.querySelector('h2, h3, header h2, header h3');
  return re.test((h && h.textContent) || '');
}
function findSection(re) {
  const sections = QA("section, main section, div[role='region']");
  return sections.find((sec) => hasHeader(sec, re));
}

// Extract a consistent date range from a meta line
function parseDates(meta) {
  if (!meta) return {};
  const text = norm(meta);
  const mRange = text.match(
    /([A-Za-z]{3,}\s?\d{4})\s*(?:—|-|to)\s*(Present|[A-Za-z]{3,}\s?\d{4})/i
  );
  const mDur = text.match(/·\s*([\d\s,.]+(?:mos?|yrs?|years?|months?))/i); // keep "mos" to catch "mos" tokens in some UIs while keeping comments in English
  return {
    startDate: mRange ? norm(mRange[1]) : undefined,
    endDate: mRange ? norm(mRange[2]) : undefined,
    duration: mDur ? norm(mDur[1]) : undefined,
  };
}

///////////////////////
// Header & Contact
///////////////////////
function cleanLocation(loc) {
  const v = norm(loc);
  if (!v) return undefined;
  // Avoid websites in the location field
  if (/\bhttps?:\/\//i.test(v) || /\.com\b/i.test(v)) return undefined;
  // Avoid contact-like lines
  if (/@/.test(v)) return undefined;
  return v;
}

function extractHeader() {
  const name =
    T(Q('[data-test-id="hero__name"]')) || T(Q('header h1')) || T(Q('h1'));

  const headline =
    T(Q('[data-test-id="hero__headline"]')) ||
    T(Q('div.text-body-medium.break-words'));

  // Location: prefer the exact span you pasted, then fall back to other variants
  const locNode =
    Q('.text-body-small.inline.t-black--light.break-words') || // <-- your exact node
    Q('[data-test-id="hero__location"]') ||
    Q('section div.inline-flex span.inline.t-14.t-normal.t-black--light') ||
    Q('.pv-text-details__left-panel span.t-14.t-black--light') ||
    Q('.pv-text-details__left-panel div.inline-flex span.t-14') ||
    Q('li.t-16.t-black.t-normal.inline-block');

  let location = cleanLocation(T(locNode));

  // JSON-LD fallback if nothing matched
  if (!location) {
    const j = extractFromJsonLd();
    location = j.location || undefined;
  }

  return {
    name: norm(name) || 'LinkedIn Profile',
    headline: norm(headline),
    location,
  };
}

// Public profile URL
function extractPublicProfileURL(tabUrl) {
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

function extractContact() {
  // Collect website/email anchors visible on the profile
  const raw = uniqueByCI(
    QA('a[href^="mailto:"], a[href^="https://"], a[href^="http://"]')
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
  );

  const isInternalLinkedIn = (u) => {
    try {
      const url = new URL(u);
      if (!/^https?:/i.test(url.protocol)) return false;
      // treat lnkd.in shortener as internal so it doesn't pollute "websites"
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

function computeSlug(tabUrl) {
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

///////////////////////
// Sections
///////////////////////
function extractAbout() {
  const sec =
    findSection(/about/i) || Q('section[id*="about"], div[id*="about"]');
  if (!sec) return undefined;

  const raw =
    T(Q('p', sec)) ||
    T(Q('div:not(:has(h2,h3))', sec)) ||
    T(Q('div.display-flex.full-width', sec)) ||
    T(Q('div.inline-show-more-text', sec));

  const txt = dedupeText(norm(raw));
  return txt || undefined;
}

function extractExperience() {
  const sec = findSection(/experience/i);
  if (!sec) return undefined;
  const items = [];
  const rows = QA("li, article, div[data-test-id='experience-list-item']", sec);
  for (const r of rows) {
    const roleNode = pickRoleNode(r);
    const roleText = norm(T(roleNode));
    const companyText = norm(
      pickVisibleText(
        r.querySelectorAll('span.t-14.t-normal, a.app-aware-link')
      )
    );
    const title = roleText || undefined;
    const showCompany =
      companyText &&
      (!title || !title.toLowerCase().includes(companyText.toLowerCase()));
    const metaLine = norm(T(Q('span.t-14.t-normal.t-black--light', r))) || '';
    const { startDate, endDate, duration } = parseDates(metaLine);

    // Description/bullets
    const bullets = uniqueByCI(
      QA('ul li', r).map((li) => dedupeText(norm(T(li))))
    );
    let description = dedupeText(norm(T(Q('p', r)))) || undefined;
    if (description && bullets.length) {
      const joined = bullets.join(' ');
      if (description === joined) description = undefined;
    }

    // Build display role line
    const roleLine =
      showCompany && companyText ? `${title} — ${companyText}` : title;
    if (roleLine || description || bullets.length) {
      items.push({
        title: dedupeText(roleLine || ''),
        startDate,
        endDate,
        duration,
        bullets: bullets.length ? bullets : undefined,
        description,
      });
    }
  }
  return items.length ? items : undefined;
}

function extractEducation() {
  const sec = findSection(/education/i);
  if (!sec) return undefined;
  const items = [];
  const rows = QA('li, article', sec);
  for (const r of rows) {
    const school = norm(T(Q('h3', r)) || T(Q('a span', r)));
    const degree = norm(T(Q('span.t-14.t-normal', r)));
    const meta = norm(T(Q('span.t-14.t-normal.t-black--light', r))) || '';
    const m = meta.match(/(\d{4}).*?(Present|\d{4})/i);
    const startDate = m?.[1];
    const endDate = m?.[2];
    if (school) items.push({ school, degree, startDate, endDate });
  }
  return items.length ? items : undefined;
}

function extractHonorsAwards() {
  const sec =
    findSection(/honors|awards|logros|distinciones/i) ||
    Q('section[id*="honors"], section[id*="awards"]') ||
    Q('section[aria-label*="honor" i], section[aria-label*="award" i]');
  if (!sec) return undefined;

  const out = [];
  const rows = QA('li, article', sec);
  for (const r of rows) {
    const title =
      norm(
        pickVisibleText(
          r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
    const issuer =
      norm(
        pickVisibleText(
          r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
    const meta =
      norm(T(r.querySelector('span.t-14.t-normal.t-black--light'))) || '';
    // e.g., "Jun 2022" or just "2022"
    const m = meta.match(/[A-Za-z]{3,}\s+\d{4}|\b\d{4}\b/);
    const date = m ? norm(m[0]) : undefined;

    if (title) out.push({ title: dedupeText(title), issuer, date });
  }
  return out.length ? out : undefined;
}

function extractPublications() {
  const sec =
    findSection(/publications|publicaciones/i) ||
    Q('section[id*="publications"]') ||
    Q('section[aria-label*="publication" i]');
  if (!sec) return undefined;

  const out = [];
  const rows = QA('li, article', sec);
  for (const r of rows) {
    let title =
      norm(
        pickVisibleText(
          r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
    if (/show publication/i.test(title || '')) title = undefined;

    const source =
      norm(
        pickVisibleText(
          r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));

    const dateText =
      norm(T(r.querySelector('span.t-14.t-normal.t-black--light'))) ||
      norm(T(r));
    const mDate =
      (dateText && dateText.match(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/)) ||
      (dateText && dateText.match(/[A-Za-z]{3,}\s+\d{4}|\b\d{4}\b/));
    const date = mDate ? norm(mDate[0]) : undefined;

    const description =
      dedupeText(
        norm(
          T(
            r.querySelector(
              'p, div.inline-show-more-text, .pv-shared-text-with-see-more'
            )
          )
        )
      ) || undefined;

    if (title)
      out.push({ title: dedupeText(title), source, date, description });
  }
  return out.length ? out : undefined;
}

function extractSkills() {
  const sec = findSection(/skills/i);
  if (!sec) return undefined;
  const raw = new Set();
  QA(
    "a[href*='/skills/'], a[href*='/skill/'], span[aria-hidden='true'], span.artdeco-pill__text",
    sec
  ).forEach((n) => {
    const s = norm(T(n));
    if (!s) return;
    if (/^skills$/i.test(s)) return;
    if (/show all|endorse/i.test(s)) return;
    if (s.length <= 2) return;
    raw.add(s.toLowerCase());
  });
  const arr = Array.from(raw).map((s) =>
    s.replace(/^./, (c) => c.toUpperCase())
  );
  return arr.length ? arr : undefined;
}

function extractLanguages() {
  const sec =
    findSection(/languages|idiomas/i) ||
    Q('section[id*="languages"]') ||
    Q('section[aria-label*="language" i]');
  if (!sec) return undefined;

  const out = [];
  const rows = QA('li, article', sec);
  for (const r of rows) {
    const language =
      norm(
        pickVisibleText(
          r.querySelectorAll('h3, a span, .t-bold span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('.t-bold, h3, a span')));
    const proficiency = norm(
      pickVisibleText(
        r.querySelectorAll('span.t-14.t-normal, span.t-12, .t-black--light')
      )
    );
    if (language) out.push({ language: dedupeText(language), proficiency });
  }
  return out.length ? out : undefined;
}

function extractCertifications() {
  // Find the section by header OR by common ids/labels
  const sec =
    findSection(/licenses? *&* *certifications?/i) ||
    Q('section[id*="licenses"], section[id*="certifications"]') ||
    Q('section[aria-label*="certification" i]');
  if (!sec) return undefined;

  const items = [];
  // Be generous: some profiles render <li> with many classes; fall back to article
  const rows = QA('li.artdeco-list__item, li, article', sec);

  for (const r of rows) {
    // Title
    let name =
      norm(
        pickVisibleText(r.querySelectorAll('.t-bold span[aria-hidden="true"]'))
      ) || norm(pickVisibleText(r.querySelectorAll('h3, a span')));
    // Issuer
    const issuer =
      norm(
        pickVisibleText(
          r.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]')
        )
      ) || norm(pickVisibleText(r.querySelectorAll('span.t-14.t-normal')));
    // Issued date
    const issuedRaw =
      norm(
        T(
          r.querySelector(
            '.t-14.t-normal.t-black--light .pvs-entity__caption-wrapper'
          )
        )
      ) ||
      norm(T(r.querySelector('.t-14.t-normal.t-black--light'))) ||
      norm(T(r));
    // Normalize “Issued Jan 2013” → “Jan 2013”
    let issued;
    if (issuedRaw) {
      const m =
        issuedRaw.match(/(?:Issued|Expedid[oa])\s+([A-Za-z]{3,}\s+\d{4})/i) ||
        issuedRaw.match(/\b([A-Za-z]{3,}\s+\d{4})\b/);
      issued = m ? norm(m[1]) : undefined;
    }

    // Clean doubled texts like “First Certificate in EnglishFirst Certificate in English”
    if (name) name = dedupeText(name);

    if (name) {
      items.push({ name, issuer: issuer || undefined, issued });
    }
  }

  return items.length ? items : undefined;
}

function extractPublications() {
  // Find the section by header, by #publications anchor, or by aria-label
  const sec =
    findSection(/publications/i) ||
    (Q('#publications') && Q('#publications').closest('section')) ||
    Q('section[aria-label*="publication" i]');
  if (!sec) return undefined;

  const out = [];
  const rows = QA('li.artdeco-list__item, li', sec);

  for (const r of rows) {
    // Title (prefer visible aria-hidden spans LinkedIn uses)
    const title = dedupeText(
      norm(
        pickVisibleText(
          r.querySelectorAll(
            '.t-bold span[aria-hidden="true"], h3, a span, .t-bold'
          )
        )
      )
    );

    // Meta line
    const metaRaw = norm(
      pickVisibleText(
        r.querySelectorAll(
          'span.t-14.t-normal span[aria-hidden="true"], span.t-14.t-normal'
        )
      )
    );

    let source, date;
    if (metaRaw) {
      const parts = metaRaw
        .split('·')
        .map((s) => norm(s))
        .filter(Boolean);
      if (parts.length >= 2) {
        source = parts[0];
        date = parts.slice(1).join(' · ');
      } else {
        // Fallback: pull a date token and treat the rest as source
        const m =
          metaRaw.match(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/) ||
          metaRaw.match(/[A-Za-z]{3,}\s+\d{4}/) ||
          metaRaw.match(/\b\d{4}\b/);
        if (m) {
          date = norm(m[0]);
          const leftover = norm(metaRaw.replace(m[0], '').replace(/·/g, ''));
          source = leftover || undefined;
        }
      }
    }

    // Optional description (usually inside inline-show-more-text)
    const description =
      dedupeText(
        norm(
          T(
            r.querySelector(
              '.inline-show-more-text, .pv-shared-text-with-see-more, p'
            )
          )
        )
      ) || undefined;

    // External link (“Show publication”)
    const linkEl = r.querySelector(
      'a.optional-action-target-wrapper[href^="http"]'
    );
    const url = linkEl ? linkEl.getAttribute('href') : undefined;

    if (title) {
      out.push({
        title,
        source,
        date,
        url,
        description,
      });
    }
  }

  return out.length ? out : undefined;
}

function extractInterests() {
  const sec = findSection(/interests/i);
  if (!sec) return undefined;
  const names = new Set();
  QA("a[href*='/in/'], a[href*='/company/'], a[href*='/groups/']", sec).forEach(
    (a) => {
      const s = norm(T(a));
      if (!s) return;
      if (/show all/i.test(s)) return;
      // Drop follower counters duplication
      if (/followers/i.test(s)) return;
      if (s.length <= 2) return;
      names.add(s.toLowerCase());
    }
  );
  const arr = Array.from(names)
    .map((s) => s.replace(/^./, (c) => c.toUpperCase()))
    .slice(0, 40);
  return arr.length ? arr : undefined;
}

///////////////////////
// JSON-LD fallback (when present)
///////////////////////
function extractFromJsonLd() {
  try {
    const scripts = QA('script[type="application/ld+json"]');
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

///////////////////////
// Orchestrator
///////////////////////
async function extractAll(msg) {
  await expandUI();

  // Header
  const header = extractHeader();
  const jsonld = extractFromJsonLd();
  const name = header.name || jsonld.name || 'LinkedIn Profile';
  const headline = header.headline || jsonld.headline || undefined;
  const location = header.location || jsonld.location || undefined;

  // Contact + URL + slug
  const publicProfileUrl = extractPublicProfileURL(msg?.tabUrl);
  const slug = computeSlug(msg?.tabUrl);
  const contact = extractContact();
  if (publicProfileUrl) {
    contact.publicProfile = publicProfileUrl;
  }

  // Sections
  const about = extractAbout();
  const experiences = extractExperience();
  const education = extractEducation();
  const certifications = extractCertifications();
  const skills = extractSkills();
  const languages = extractLanguages();
  const honors = extractHonorsAwards();
  const publications = extractPublications();
  const interests = extractInterests();

  return {
    // Header
    name,
    headline,
    location,
    slug,
    // Contact block
    contact, // { publicProfile?, email?, websites?[] }
    // Sections
    about,
    experiences,
    education,
    certifications,
    skills,
    languages,
    honors, // honors & awards
    publications,
    interests,
    // Meta
    lastUpdatedISO: new Date().toISOString(),
  };
}

///////////////////////
// Messaging (Chrome runtime)
///////////////////////
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'EXTRACT_PROFILE') {
      (async () => {
        try {
          const data = await extractAll(msg);
          // Console summary
          LNP_printTable(data);
          sendResponse(data);
        } catch (e) {
          console.error('Extraction error', e);
          sendResponse({ name: 'LinkedIn Profile' });
        }
      })();
      return true; // async
    }
  });
}

///////////////////////
// Messaging (window bridge)
///////////////////////
window.addEventListener('message', async (e) => {
  if (e.source !== window) return;
  if (e.data?.type !== '__LNP_EXTRACT_REQ') return;
  try {
    const data = await extractAll({ tabUrl: location.href });
    window.postMessage({ type: '__LNP_EXTRACT_RES', payload: data }, '*');
    // Console summary
    LNP_printTable(data);
  } catch (err) {
    console.error('extract error', err);
  }
});

///////////////////////
// Debug helpers (console)
///////////////////////
function LNP_printTable(data) {
  const d = data || {};
  const summary = {
    name: !!d.name,
    headline: !!d.headline,
    location: !!d.location,
    slug: !!d.slug,
    contact: !!d.contact,
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

  // Missing-first list for key sections
  const FOCUS_FIELDS = [
    'location',
    'certifications',
    'languages',
    'honors',
    'publications',
  ];
  const fields = Object.fromEntries(FOCUS_FIELDS.map((k) => [k, d[k]]));
  const missing = Object.entries(fields).filter(
    ([_, v]) =>
      v == null ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'string' && v.trim() === '')
  );
  if (missing.length) {
    console.group('%cMISSING (focus fields)', 'font-weight:bold; color:#c00');
    console.table(
      missing.map(([k, v]) => ({
        field: k,
        valueType: Array.isArray(v) ? 'array' : typeof v,
        valuePreview: Array.isArray(v) ? v.length : v ?? null,
      }))
    );
    console.groupEnd();
  }
}

// Run from DevTools any time to extract + print a table
window.__LNP_extractAll = extractAll;
window.LNP_table = async function () {
  const data = await extractAll({ tabUrl: location.href });
  LNP_printTable(data);
  return data;
};
