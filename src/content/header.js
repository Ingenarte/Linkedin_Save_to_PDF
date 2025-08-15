// header.js
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

  ns.extractHeader = function extractHeader() {
    const name =
      T(Q('[data-test-id="hero__name"]')) || T(Q('header h1')) || T(Q('h1'));

    const headline =
      T(Q('[data-test-id="hero__headline"]')) ||
      T(Q('div.text-body-medium.break-words'));

    const locNode =
      Q('.text-body-small.inline.t-black--light.break-words') ||
      Q('[data-test-id="hero__location"]') ||
      Q('section div.inline-flex span.inline.t-14.t-normal.t-black--light') ||
      Q('.pv-text-details__left-panel span.t-14.t-black--light') ||
      Q('.pv-text-details__left-panel div.inline-flex span.t-14') ||
      Q('li.t-16.t-black.t-normal.inline-block');

    let location = cleanLocation(T(locNode));
    if (!location) {
      const j = extractFromJsonLd();
      location = j.location || undefined;
    }

    // Profile image candidates
    const imgEl =
      Q('img.pv-top-card-profile-picture__image') ||
      Q('.pv-top-card-profile-picture img') ||
      Q('.pv-top-card__photo img') ||
      Q('img[src*="profile-displayphoto" i]') ||
      Q('img[alt*="profile" i]') ||
      Q('.presence-entity__image img, .ivm-view-attr__img--centered');

    const profileImage = pickImageUrl(imgEl) || getOgImage();

    return {
      name: norm(name) || 'LinkedIn Profile',
      headline: norm(headline),
      location,
      profileImage,
    };
  };
})(window.__LNP_NS__ || (window.__LNP_NS__ = {}));
