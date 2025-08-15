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
    // Defaults if nothing was saved yet
    return Object.assign(
      {
        profileHeader: true,
        withPhoto: true,
        contact: true,
        about: true,
        experience: true,
        education: true,
        certifications: true,
        skills: true,
        languages: true,
        honors: true,
        publications: true,
        interests: true,
      },
      lnp_settings || {}
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
  };
})();
