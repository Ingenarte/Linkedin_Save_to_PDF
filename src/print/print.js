// This file assumes data was already written to chrome.storage.local under the ?nonce key.

function ensureHref(u) {
  if (!u) return '';
  // Remove all spaces (including non-breaking) from inside the URL
  let s = u.replace(/\s+/g, '').trim();
  if (!s) return '';
  if (/^mailto:/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return 'https:' + s;
  return 'https://' + s;
}
function a(href, text) {
  const cleanHref = ensureHref(href);
  const link = document.createElement('a');
  link.href = cleanHref;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text ? text.trim() : cleanHref;
  return link;
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

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
function section(title) {
  const s = el('section', 'section');
  s.append(el('h2', '', title));
  return s;
}
function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
function sanitizeForTitle(s) {
  return (s || '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function list(items) {
  const ul = el('ul');
  (items || []).forEach((it) => {
    const v = norm(it);
    if (v) ul.append(el('li', '', v));
  });
  return ul;
}

const style = document.createElement('style');
style.textContent = `
  .section .item a, .header a { 
    text-decoration: underline;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;
document.head.append(style);

// ------- Minimal renderers (expanded with Contact/Certifications/Honors) -------
function renderHeader(root, data) {
  const header = el('section', 'header section');
  const name = norm(data.name) || 'LinkedIn Profile';

  // Prefer explicit public profile URL; fall back to slug.
  const profileURL =
    (data.contact && data.contact.publicProfile) ||
    (data.slug
      ? `https://www.linkedin.com/in/${encodeURIComponent(data.slug)}/`
      : null);

  // Left column: name, headline, meta
  const left = el('div', 'left');

  // h1 as a link when we have a profile URL
  const h1 = el('h1', '');
  if (profileURL) h1.append(a(profileURL, name));
  else h1.textContent = name;
  left.append(h1);

  // Headline
  if (data.headline) left.append(el('div', 'headline', data.headline));

  // Meta line: location · /in/slug · Exported: …
  const metaParts = [];
  if (data.location) metaParts.push(data.location);
  if (data.slug)
    metaParts.push(
      a(
        `https://www.linkedin.com/in/${encodeURIComponent(data.slug)}/`,
        `/in/${data.slug}`
      )
    );
  if (data.lastUpdatedISO)
    metaParts.push(
      ` Exported: ${new Date(data.lastUpdatedISO).toLocaleString()}`
    );
  if (metaParts.length) left.append(joinInline(metaParts));

  header.append(left);

  // Right: profile image (append AFTER left so it renders on the right)
  if (data.profileImage) {
    const img = document.createElement('img');
    img.src = data.profileImage;
    img.alt = data.name || 'Profile photo';
    img.className = 'profile-photo';
    header.append(img);
  }

  // Document title
  const safeName = sanitizeForTitle(name);
  const safeSlug = sanitizeForTitle(data.slug || '');
  document.title = safeSlug
    ? `LinkedIn Profile - ${safeName} _in_${safeSlug}`
    : `LinkedIn Profile - ${safeName}`;

  root.append(header);
}

function renderContact(root, data) {
  const c = data.contact || {};
  if (!c.publicProfile && !c.email && !(c.websites && c.websites.length))
    return;

  const s = section('Contact');

  if (c.publicProfile) {
    const div = el('div', 'item');
    div.append(a(c.publicProfile, c.publicProfile));
    s.append(div);
  }
  if (c.email) {
    const div = el('div', 'item');
    div.append(a(`mailto:${c.email}`, c.email));
    s.append(div);
  }
  if (c.websites && c.websites.length) {
    const ul = el('ul');
    c.websites.forEach((w) => {
      const li = el('li', '');
      const href = ensureHref(w);
      li.append(a(href, href));
      ul.append(li);
    });
    s.append(ul);
  }

  root.append(s);
}

// Title as "Summary" (a.k.a. About)
function renderAbout(root, data) {
  if (!data.about) return;
  const s = section('Summary');
  s.append(el('p', '', data.about));
  root.append(s);
}

function renderExperience(root, data) {
  if (!data.experiences?.length) return;
  const s = section('Experience');
  data.experiences.forEach((ex) => {
    const div = el('div', 'item');
    if (ex.title) div.append(el('div', 'role', ex.title));
    const meta = [];
    const range = [ex.startDate ?? '', ex.endDate ?? '']
      .filter(Boolean)
      .join(' — ');
    if (range) meta.push(range);
    if (ex.duration) meta.push(ex.duration);
    if (ex.location) meta.push(ex.location);
    if (meta.length) div.append(el('div', 'meta', meta.join(' · ')));
    if (ex.description) div.append(el('p', '', ex.description));
    if (ex.bullets?.length) div.append(list(ex.bullets));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderEducation(root, data) {
  if (!data.education?.length) return;
  const s = section('Education');
  data.education.forEach((ed) => {
    const div = el('div', 'item');
    if (ed.school) div.append(el('div', 'school', ed.school));
    const meta = [];
    if (ed.degree) meta.push(ed.degree);
    const range = [ed.startDate ?? '', ed.endDate ?? '']
      .filter(Boolean)
      .join(' — ');
    if (range) meta.push(range);
    if (meta.length) div.append(el('div', 'meta', meta.join(' · ')));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderCertifications(root, data) {
  if (!data.certifications?.length) return;
  const s = section('Certifications');
  data.certifications.forEach((lc) => {
    const div = el('div', 'item');
    const head = [lc.name, lc.issuer].filter(Boolean).join(' — ');
    if (head) div.append(el('div', 'role', head));
    if (lc.issued) div.append(el('div', 'meta', `Issued ${lc.issued}`));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderSkills(root, data) {
  if (!data.skills?.length) return;
  const s = section('Top Skills');
  s.append(list(data.skills));
  root.append(s);
}

function renderLanguages(root, data) {
  if (!data.languages?.length) return;
  const s = section('Languages');
  data.languages.forEach((l) => {
    const div = el('div', 'item');
    if (l.language) div.append(el('div', 'role', l.language));
    if (l.proficiency) div.append(el('div', 'meta', l.proficiency));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderHonors(root, data) {
  if (!data.honors?.length) return;
  const s = section('Honors & Awards');
  data.honors.forEach((h) => {
    const div = el('div', 'item');
    const head = [h.title, h.issuer].filter(Boolean).join(' — ');
    if (head) div.append(el('div', 'role', head));
    if (h.date) div.append(el('div', 'meta', h.date));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderPublications(root, data) {
  if (!data.publications?.length) return;
  const s = section('Publications');
  data.publications.forEach((p) => {
    const div = el('div', 'item');
    const title = [p.title, p.source].filter(Boolean).join(' — ');
    if (title) div.append(el('div', 'role', title));
    if (p.date) div.append(el('div', 'meta', p.date));
    if (p.description) div.append(el('p', '', p.description));
    if (norm(div.textContent)) s.append(div);
  });
  root.append(s);
}

function renderInterests(root, data) {
  if (!data.interests?.length) return;
  const s = section('Interests');
  s.append(list(data.interests));
  root.append(s);
}

// ------- FINAL CLEANUP: remove identical repeated phrases globally -------
// Split text into sentences by ., !, ? and newlines. Keep first occurrence globally.
function finalGlobalPhraseDedup(root) {
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const toRemove = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    // 1) Never touch text inside links (prevents "example. com")
    if (parent && parent.closest('a')) continue;

    const raw = node.nodeValue || '';
    if (!raw.trim()) continue;

    // 2) Split only on sentence boundaries: punctuation followed by whitespace
    //    (and newlines). This avoids splitting "domain.com" or "v1.2".
    const parts = raw
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!parts.length) continue;

    const kept = [];
    for (const p of parts) {
      const key = p.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        kept.push(p);
      }
    }

    if (kept.length === 0) {
      toRemove.push(node);
    } else if (kept.join(' ') !== raw.trim()) {
      node.nodeValue = kept.join(' ');
    }
  }

  toRemove.forEach((n) => n.parentNode && n.parentNode.removeChild(n));

  // Clean up empty elements left behind
  Array.from(root.querySelectorAll('p, div, li')).forEach((el) => {
    if (!el.textContent || el.textContent.replace(/\s+/g, '').length === 0) {
      el.remove();
    }
  });
}

(async function main() {
  const params = new URLSearchParams(location.search);
  const nonce = params.get('nonce') || '';
  const { [nonce]: data } = await chrome.storage.local.get(nonce);
  const root = document.getElementById('root');

  if (!data) {
    root.append(el('p', '', 'No data to render.'));
    return;
  }

  // Header + Contact + Summary + Sections
  renderHeader(root, data);
  renderContact(root, data); // NEW
  if (data.about) renderAbout(root, data); // "Summary"
  renderExperience(root, data);
  renderEducation(root, data);
  renderCertifications(root, data); // NEW
  renderSkills(root, data);
  renderLanguages(root, data);
  renderHonors(root, data); // NEW
  renderPublications(root, data);
  renderInterests(root, data);

  // Final pass: remove identical phrases across the whole page
  finalGlobalPhraseDedup(root);

  // Footer & cleanup
  const footer = el('footer', '');
  footer.append(
    document.createTextNode('Generated by LinkedIn Save to PDF — Author: '),
    a(
      'https://www.linkedin.com/in/fmrodrigo/',
      'Franco Mariano Rodrigo (Ingenarte)'
    ),
    document.createTextNode(' — '),
    a(
      'https://github.com/Ingenarte/Linkedin_Save_to_PDF',
      'https://github.com/Ingenarte/Linkedin_Save_to_PDF'
    )
  );
  root.append(footer);

  await chrome.storage.local.remove(nonce);
  setTimeout(() => window.print(), 400);
})();
