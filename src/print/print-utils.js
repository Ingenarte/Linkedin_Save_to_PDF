// Shared helpers for the print view
(function () {
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }
  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }
  function ensureHref(u) {
    if (!u) return '';
    let s = u.replace(/\s+/g, '').trim();
    if (!s) return '';
    if (/^mailto:/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    return 'https://' + s;
  }
  function a(href, text) {
    const clean = ensureHref(href);
    const link = document.createElement('a');
    link.href = clean;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text ? text.trim() : clean;
    return link;
  }
  function list(items) {
    const ul = el('ul');
    (items || []).forEach((it) => {
      const v = norm(it);
      if (v) ul.append(el('li', '', v));
    });
    return ul;
  }
  function slugifyName(name) {
    const s = String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return s || 'profile';
  }

  function formatExportDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const dd = String(safe.getDate()).padStart(2, '0');
    const mm = String(safe.getMonth() + 1).padStart(2, '0');
    const yyyy = String(safe.getFullYear());
    return `${dd}_${mm}_${yyyy}`;
  }

  function buildPrintDocumentTitle(name, exportKind, iso) {
    const kind = exportKind === 'fullexport' ? 'fullexport' : 'basicexport';
    return `linkedin_${slugifyName(name)}_${kind}_${formatExportDate(iso)}`;
  }

  function joinInline(parts, sep = ' · ') {
    const wrap = el('div', 'meta');
    const clean = parts.filter(Boolean);
    clean.forEach((part, i) => {
      if (i) wrap.append(document.createTextNode(sep));
      wrap.append(
        typeof part === 'string' ? document.createTextNode(part) : part
      );
    });
    return wrap;
  }

  async function loadPrintSettings() {
    const { lnp_settings } = await chrome.storage.local.get('lnp_settings');
    let syncSettings = {};
    try {
      const sync = await chrome.storage.sync.get('lnp_settings_v1');
      syncSettings = sync.lnp_settings_v1 || {};
    } catch (_e) {
      /* sync storage unavailable in some contexts */
    }
    // Defaults; merge legacy local key then popup Settings (sync v1).
    return Object.assign(
      {
        profileHeader: true,
        withPhoto: true,
        contact: true,
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
      },
      lnp_settings || {},
      syncSettings,
    );
  }

  window.__PRINT_UTILS__ = {
    el,
    a,
    norm,
    list,
    joinInline,
    ensureHref,
    loadPrintSettings,
    buildPrintDocumentTitle,
  };
})();
