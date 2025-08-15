// All section renderers (contact, about, experience, etc.)
(function () {
  const { el, a, norm, list, joinInline, ensureHref } = window.__PRINT_UTILS__;

  function section(title) {
    const s = el('section', 'section');
    s.append(el('h2', '', title));
    return s;
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

  window.__PRINT_RENDER_SECTIONS__ = {
    renderContact,
    renderAbout,
    renderExperience,
    renderEducation,
    renderCertifications,
    renderSkills,
    renderLanguages,
    renderHonors,
    renderPublications,
    renderInterests,
  };
})();
