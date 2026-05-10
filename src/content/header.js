// src/content/header.js
//
// Extracts the profile top card: name, headline, location and photo.
//
// Two DOM tiers are supported (newest first):
//
//   1) 2026 SDUI top card. The relevant <section> carries
//      `componentkey="com.linkedin.sdui.profile.card.<ref>Topcard"` and
//      no longer ships any of the historical `pv-top-card-*` classes.
//      Inside the card LinkedIn renders the name as an <h2>, then
//      <p> elements in this order: connection degree, headline,
//      companies, location, contact info, ... The class names are
//      obfuscated (`_885f3d1f`, etc.) and rotate on each LinkedIn
//      release, so we never select on classes here.
//
//   2) Legacy / 2024 DOM and the regression fixture, where the name
//      is an <h1> inside `.pv-top-card`, headline lives in
//      `.text-body-medium.break-words` and the location in
//      `.text-body-small.inline.t-black--light.break-words`.
//
// In both tiers we must NEVER pick the logged-in user's avatar (which
// LinkedIn places inside `nav.global-nav`) and must prefer the URL of
// the profile being viewed over stale canonical/og:url tags.

(function (ns) {
  // Minimal local utils (module self-contained)
  const T = (el) => ((el && el.textContent) || '').trim();
  const Q = (sel, root = document) => root.querySelector(sel);
  const norm = (s) => (s ? s.replace(/\s+/g, ' ').trim() : s);

  function cleanLocation(loc) {
    const v = norm(loc);
    if (!v) return undefined;
    if (/\bhttps?:\/\//i.test(v) || /\.com\b/i.test(v)) return undefined;
    if (/@/.test(v)) return undefined;
    return v;
  }

  function pickImageUrl(el) {
    if (!el) return undefined;
    const delayed =
      el.getAttribute('data-delayed-url') || el.getAttribute('data-test-src');
    if (delayed) return delayed;
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      const last = srcset.split(',').pop();
      if (last) {
        const url = last.trim().split(/\s+/)[0];
        if (url) return url;
      }
    }
    return el.getAttribute('src') || el.src || undefined;
  }

  function getOgImage() {
    const og = document.querySelector('meta[property="og:image"]')?.content;
    const tw = document.querySelector('meta[name="twitter:image"]')?.content;
    return og || tw || undefined;
  }

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

  // Returns true when the element is inside LinkedIn's global navigation,
  // identity feed module, or any top-bar where the LOGGED-IN user's own
  // photo lives. We must never pick those when extracting the target profile.
  function isInsideGlobalNav(node) {
    if (!node || !node.closest) return false;
    return !!node.closest(
      [
        'nav.global-nav',
        '#global-nav',
        '.global-nav__me',
        '.global-nav__me-photo',
        '.feed-identity-module',
        '.profile-rail-card',
        'header.global-nav',
        '[data-test-global-nav]',
        'aside',
      ].join(','),
    );
  }

  // Returns the first matching element under `scope` that is not inside
  // the global nav / identity rail (avoids the logged-in user's own photo).
  function pickProfileImage(scope, name) {
    if (!scope) return undefined;

    const selectors = [
      'img.pv-top-card-profile-picture__image',
      '.pv-top-card-profile-picture img',
      '.pv-top-card__photo img',
      'button.pv-top-card-profile-picture__container img',
      'img.profile-photo-edit__preview',
      'img[src*="profile-displayphoto" i]',
      'img[alt*="profile" i]',
    ];

    for (const sel of selectors) {
      const candidates = Array.from(scope.querySelectorAll(sel));
      for (const img of candidates) {
        if (isInsideGlobalNav(img)) continue;
        // If we have the target's name, prefer images whose alt mentions it.
        if (name) {
          const alt = (img.getAttribute('alt') || '').toLowerCase();
          const first = name.split(/\s+/)[0]?.toLowerCase();
          if (alt && first && !alt.includes(first)) {
            // Keep as fallback but try to find a better match first.
            continue;
          }
        }
        return img;
      }
    }

    // Second pass: ignore the alt cross-check, still exclude global nav.
    for (const sel of selectors) {
      const candidates = Array.from(scope.querySelectorAll(sel));
      for (const img of candidates) {
        if (isInsideGlobalNav(img)) continue;
        return img;
      }
    }

    return undefined;
  }

  // ----------------------------------------------------------------
  // 2026 SDUI top card extractors
  // ----------------------------------------------------------------

  // Detects connection-degree text such as "· 3rd", "· 2nd",
  // "· 1st" or LinkedIn variants like "· You" / "· You followed".
  const DEGREE_RE = /^\s*[·•‧]?\s*(?:1st|2nd|3rd|\dth|you(?:\s|$)|t[uú]\s)/i;

  // Looks like a geographic location ("Milan, Lombardy, Italy",
  // "Buenos Aires, Argentina", "Greater London Area"). LinkedIn never
  // uses "·" in the location line and the line never starts with a
  // digit or with brand-style prefixes like "presso", "at ", "@".
  const LOCATION_RE =
    /^[A-Za-zÀ-ž][A-Za-zÀ-ž\s.\-']+(?:,\s*[A-Za-zÀ-ž][A-Za-zÀ-ž\s.\-']+)+$|^Greater\s+|\s(Metropolitan|Bay|Metro)\s+Area$|\sRegion$|\sArea$/;

  // True when a paragraph is the connection-degree noise we must skip.
  function isDegreeNoise(text) {
    if (!text) return true;
    const t = ns.norm(text);
    if (!t) return true;
    if (DEGREE_RE.test(t)) return true;
    if (/^[·•‧\s]+$/.test(t)) return true;
    return false;
  }

  // Extracts headline + location from a 2026 top card section by
  // walking the visible <p> elements in document order.
  function readSdui(sec) {
    const ps = ns.QA('p, h2', sec);
    let name;
    let headline;
    let location;
    let companiesLine;

    // First non-trivial h2 is the profile name.
    const h2 = sec.querySelector('h2');
    if (h2) name = ns.norm(h2.textContent || '');

    for (const p of ps) {
      const txt = ns.norm(p.textContent || '');
      if (!txt) continue;
      if (p.tagName === 'H2') continue;
      if (txt === name) continue;
      if (isDegreeNoise(txt)) continue;
      if (/^contact\s+info$/i.test(txt)) continue;
      // Video / media modals sometimes inject copy into the top card region.
      if (
        /modal window|press esc|press escape|video player|^\s*close\s*$/i.test(
          txt,
        )
      )
        continue;
      if (
        /^\d[\d.,+]*\s*(?:connections|followers|seguidores|conexi[oó]nes)?$/i.test(
          txt,
        )
      )
        continue;
      if (/^connections?$|^followers?$|^seguidores?$/i.test(txt)) continue;

      if (!headline) {
        headline = txt;
        continue;
      }
      if (!location && LOCATION_RE.test(txt)) {
        location = ns.cleanLocation(txt);
        continue;
      }
      if (!companiesLine && /·/.test(txt) && txt.length < 200) {
        companiesLine = txt;
      }
      if (headline && location) break;
    }

    return { name, headline, location, companiesLine };
  }

  // Picks the profile image for the 2026 top card. The picture lives
  // inside an anchor labelled "Profile photo" / "Foto de perfil" or in
  // a figure that contains an <img> whose src/srcset references
  // "profile-displayphoto-shrink_*". Company logos live alongside but
  // use "company-logo_*" so they are excluded.
  function pickSduiPhoto(sec) {
    const candidates = [
      sec.querySelector('a[aria-label="Profile photo" i] img'),
      sec.querySelector('a[aria-label*="perfil" i] img'),
      sec.querySelector('img[src*="profile-displayphoto" i]'),
      sec.querySelector('img[srcset*="profile-displayphoto" i]'),
    ].filter(Boolean);
    const img = candidates[0];
    return img || null;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  ns.extractHeader = function extractHeader() {
    // Prefer the SDUI top card when present.
    const sdui = ns.getSectionByComponentkey
      ? ns.getSectionByComponentkey('Topcard')
      : null;

    if (sdui) {
      const sduiData = readSdui(sdui);
      const sduiImg = pickSduiPhoto(sdui);
      const sduiPhoto = pickImageUrl(sduiImg) || getOgImage();
      const sduiJsonLd = extractFromJsonLd();

      return {
        name:
          sduiData.name ||
          sduiJsonLd.name ||
          legacyExtract().name ||
          'LinkedIn Profile',
        headline:
          sduiData.headline || sduiJsonLd.headline || legacyExtract().headline,
        location:
          sduiData.location || sduiJsonLd.location || legacyExtract().location,
        profileImage: sduiPhoto || legacyExtract().profileImage,
      };
    }

    // Legacy / fixture path.
    return legacyExtract();
  };

  // ----------------------------------------------------------------
  // Legacy / pre-SDUI extraction (kept for backwards compatibility
  // with older LinkedIn snapshots and the regression fixture).
  // ----------------------------------------------------------------
  function legacyExtract() {
    const name =
      T(Q('[data-test-id="hero__name"]')) || T(Q('main h1')) || T(Q('h1'));

    const headline =
      T(Q('[data-test-id="hero__headline"]')) ||
      T(Q('main div.text-body-medium.break-words')) ||
      T(Q('div.text-body-medium.break-words'));

    const locNode =
      Q('main .text-body-small.inline.t-black--light.break-words') ||
      Q('.text-body-small.inline.t-black--light.break-words') ||
      Q('[data-test-id="hero__location"]') ||
      Q(
        'main section div.inline-flex span.inline.t-14.t-normal.t-black--light',
      ) ||
      Q('main .pv-text-details__left-panel span.t-14.t-black--light') ||
      Q('main .pv-text-details__left-panel div.inline-flex span.t-14') ||
      Q('main li.t-16.t-black.t-normal.inline-block');

    let location = cleanLocation(T(locNode));
    if (!location) {
      const j = extractFromJsonLd();
      location = j.location || undefined;
    }

    const main = document.querySelector('main') || document.body;
    const normalizedName = norm(name);
    const imgEl = pickProfileImage(main, normalizedName);

    let profileImage = pickImageUrl(imgEl);
    if (!profileImage) {
      profileImage = getOgImage();
    }

    return {
      name: normalizedName || 'LinkedIn Profile',
      headline: norm(headline),
      location,
      profileImage,
    };
  }
})(window.__LNP_NS__ || (window.__LNP_NS__ = {}));
