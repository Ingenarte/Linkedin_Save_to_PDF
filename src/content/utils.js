// src/content/utils.js
// Shared helpers (attached to a single global namespace to avoid ES module usage in MV3 content scripts)
(function (w) {
  // Unified namespace
  const ns = (w.__LNP_NS__ = w.__LNP_NS__ || {});
  // Backward compatibility alias for older modules
  w.__lnp = ns;

  // DOM helpers
  ns.T = (el) => ((el && el.textContent) || '').trim();
  ns.Q = (sel, root = document) => root.querySelector(sel);
  ns.QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  ns.norm = (s) => (s ? s.replace(/\s+/g, ' ').trim() : s);

  ns.uniqueByCI = (arr) => {
    const out = [];
    const seen = new Set();
    for (const v of arr || []) {
      const t = ns.norm(v);
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  };

  // Remove consecutive duplicate lines and inline doubled phrases
  ns.dedupeText = (s) => {
    if (!s) return s;
    const parts = s
      .split(/\n+|(?<=\.)\s+(?=[A-Z])|(?<=\!)\s+|(?<=\?)\s+/)
      .map((x) => ns.norm(x))
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
  };

  // Prefer visible text and avoid mixing aria-hidden variants
  ns.pickVisibleText = (nodes) => {
    const arr = Array.from(nodes || []);
    const hidden = arr.find(
      (n) => n.getAttribute && n.getAttribute('aria-hidden') === 'true'
    );
    return ns.T(hidden || arr[0] || null);
  };
  ns.pickRoleNode = (container) =>
    ns.Q('h3', container) ||
    ns.Q("span[aria-hidden='true']", container) ||
    ns.Q('span', container);

  // Async helpers
  ns.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  ns.autoScroll = async (passes = 1) => {
    for (let p = 0; p < passes; p++) {
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await ns.wait(140);
      }
    }
    window.scrollTo(0, 0);
  };
  ns.clickMoreButtons = async () => {
    const re = /see more|show more|show all/i;
    const candidates = ns
      .QA("button, a[role='button']")
      .filter((b) => re.test(b.textContent || ''));
    for (const btn of candidates) {
      try {
        btn.click();
      } catch {}
    }
    ns.QA('[aria-expanded="false"]').forEach((el) => {
      try {
        el.click();
      } catch {}
    });
  };
  ns.expandUI = async () => {
    await ns.clickMoreButtons();
    await ns.autoScroll(4);
    await ns.wait(600);
  };

  // Section discovery
  ns.hasHeader = (sec, re) => {
    const h = sec.querySelector('h2, h3, header h2, header h3');
    return re.test((h && h.textContent) || '');
  };
  ns.findSection = (re) => {
    const sections = ns.QA("section, main section, div[role='region']");
    return sections.find((sec) => ns.hasHeader(sec, re));
  };

  // Dates
  ns.parseDates = (meta) => {
    if (!meta) return {};
    const text = ns.norm(meta);
    const mRange = text.match(
      /([A-Za-z]{3,}\s?\d{4})\s*(?:—|-|to)\s*(Present|[A-Za-z]{3,}\s?\d{4})/i
    );
    const mDur = text.match(/·\s*([\d\s,.]+(?:mos?|yrs?|years?|months?))/i);
    return {
      startDate: mRange ? ns.norm(mRange[1]) : undefined,
      endDate: mRange ? ns.norm(mRange[2]) : undefined,
      duration: mDur ? ns.norm(mDur[1]) : undefined,
    };
  };

  // Header helpers
  ns.cleanLocation = (loc) => {
    const v = ns.norm(loc);
    if (!v) return undefined;
    if (/\bhttps?:\/\//i.test(v) || /\.com\b/i.test(v)) return undefined;
    if (/@/.test(v)) return undefined;
    return v;
  };
  ns.pickImageUrl = (el) => {
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
  };
  ns.getOgImage = () => {
    const og = document.querySelector('meta[property="og:image"]')?.content;
    const tw = document.querySelector('meta[name="twitter:image"]')?.content;
    return og || tw || undefined;
  };

  // URL helpers
  ns.extractPublicProfileURL = (tabUrl) => {
    const cand = [
      ns.Q("link[rel='canonical']")?.href,
      document.querySelector('meta[property="og:url"]')?.content,
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
  };
  ns.computeSlug = (tabUrl) => {
    const sources = [
      ns.Q("link[rel='canonical']")?.href,
      document.querySelector('meta[property="og:url"]')?.content,
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
  };
})(window);
