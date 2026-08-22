(function () {
  const { el, a, norm, list, joinInline, ensureHref } = window.__PRINT_UTILS__;

  function section(title) {
    const s = el('section', 'section');
    s.append(el('h2', '', title));
    return s;
  }

  function renderContact(root, data) {
    const c = data.contact || {};
    const loc = data.location ? norm(data.location) : undefined;
    if (!c.publicProfile && !c.email && !(c.websites && c.websites.length) && !loc)
      return;
    const s = section('Contact');
    const grid = el('div', 'contact-grid');

    if (loc) {
      const item = el('div', 'contact-item');
      const icon = el('span', 'contact-icon', '📍 ');
      item.append(icon, document.createTextNode(loc));
      grid.append(item);
    }
    if (c.email) {
      const item = el('div', 'contact-item');
      const icon = el('span', 'contact-icon', '✉️ ');
      item.append(icon, a(`mailto:${c.email}`, c.email));
      grid.append(item);
    }
    if (c.publicProfile) {
      const item = el('div', 'contact-item');
      const icon = el('span', 'contact-icon', '🔗 ');
      item.append(icon, a(c.publicProfile, c.publicProfile));
      grid.append(item);
    }
    if (c.websites && c.websites.length) {
      c.websites.forEach((w) => {
        const item = el('div', 'contact-item');
        const icon = el('span', 'contact-icon', '🌐 ');
        const href = ensureHref(w);
        item.append(icon, a(href, href));
        grid.append(item);
      });
    }
    s.append(grid);
    root.append(s);
  }

  function renderAbout(root, data) {
    if (!data.about) return;
    const s = section('Summary');
    const raw = String(data.about).trim();
    const paragraphs = raw
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length) {
      paragraphs.forEach((p) => {
        const pEl = el('p', 'summary-paragraph');
        const lines = p.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        lines.forEach((line, i) => {
          if (i > 0) pEl.append(document.createElement('br'));
          pEl.append(document.createTextNode(line));
        });
        s.append(pEl);
      });
    } else {
      s.append(el('p', 'summary-paragraph', raw));
    }
    root.append(s);
  }

  function renderExperience(root, data) {
    if (!data.experiences?.length) return;
    const s = section('Experience');
    data.experiences.forEach((ex) => {
      const div = el('div', 'item experience-item');
      if (ex.title) div.append(el('div', 'role', ex.title));
      const meta = [];
      const range = [ex.startDate ?? '', ex.endDate ?? '']
        .filter(Boolean)
        .join(' — ');
      if (range) meta.push(range);
      if (ex.duration) meta.push(ex.duration);
      if (ex.location) meta.push(ex.location);
      if (meta.length) div.append(el('div', 'meta', meta.join(' · ')));
      if (ex.description) div.append(el('p', 'description', ex.description));
      if (ex.bullets?.length) div.append(list(ex.bullets));
      if (norm(div.textContent)) s.append(div);
    });
    root.append(s);
  }

  function isPromoEducation(ed) {
    const school = String(ed?.school || '').trim();
    const degree = String(ed?.degree || '').trim();
    const blob = `${school} ${degree}`.toLowerCase();
    if (!blob.trim()) return true;
    if (/^https?:\/\//i.test(school) || /^https?:\/\//i.test(degree)) return true;
    return /[úu]nete al|join (?:the |our )?campus|estudia programaci|campus de programaci[oó]n|mouredev\.pro|learn programming (?:and|with)/i.test(
      blob,
    );
  }

  function renderEducation(root, data) {
    if (!data.education?.length) return;
    const valid = data.education.filter((ed) => ed && ed.school && !isPromoEducation(ed));
    if (!valid.length) return;
    const s = section('Education');
    valid.forEach((ed) => {
      const div = el('div', 'item education-item');
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
    if (s.querySelector('.item')) root.append(s);
  }

  function renderCertifications(root, data) {
    if (!data.certifications?.length) return;
    const s = section('Certifications');
    let appended = 0;
    data.certifications.forEach((lc) => {
      const div = el('div', 'item certification-item');
      const head = [lc.name, lc.issuer].filter(Boolean).join(' — ');
      if (head) div.append(el('div', 'role', head));
      if (lc.issued) div.append(el('div', 'meta', `Issued ${lc.issued}`));
      if (norm(div.textContent)) {
        s.append(div);
        appended++;
      }
    });
    if (!appended) {
      s.append(
        el(
          'p',
          '',
          'Certification rows were present in the export but had no printable title or issuer.',
        ),
      );
    }
    root.append(s);
  }

  function renderSkills(root, data) {
    if (!data.skills?.length) return;
    const s = section('Top Skills');
    const ul = el('ul', 'skills-list');
    data.skills.forEach((sk) => {
      const v = norm(sk);
      if (v) ul.append(el('li', '', v));
    });
    s.append(ul);
    root.append(s);
  }

  function renderLanguages(root, data) {
    if (!data.languages?.length) return;
    const s = section('Languages');
    const grid = el('div', 'languages-grid');
    data.languages.forEach((l) => {
      const div = el('div', 'language-card');
      if (l.language) div.append(el('div', 'language-name', l.language));
      if (l.proficiency) div.append(el('div', 'language-prof', l.proficiency));
      if (norm(div.textContent)) grid.append(div);
    });
    s.append(grid);
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

  function renderProjects(root, data) {
    if (!data.projects?.length) return;
    const s = section('Projects');
    data.projects.forEach((p) => {
      const div = el('div', 'item');
      const head = [p.title, p.associatedWith].filter(Boolean).join(' — ');
      if (head) div.append(el('div', 'role', head));
      const meta = [];
      const range = [p.startDate ?? '', p.endDate ?? '']
        .filter(Boolean)
        .join(' — ');
      if (range) meta.push(range);
      else if (p.date) meta.push(p.date);
      if (meta.length) div.append(el('div', 'meta', meta.join(' · ')));
      if (p.url) {
        let displayUrl = p.url.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
        if (displayUrl.length > 55) displayUrl = displayUrl.slice(0, 52) + '...';
        const linkDiv = el('div', 'meta project-link');
        linkDiv.append(a(p.url, `🔗 ${displayUrl}`));
        div.append(linkDiv);
      }
      if (p.description) div.append(el('p', '', p.description));
      if (norm(div.textContent)) s.append(div);
    });
    if (s.querySelector('.item')) root.append(s);
  }

  function renderCourses(root, data) {
    if (!data.courses?.length) return;
    const isNoise = (str) =>
      !str ||
      /^(?:courses?|kurslar|questions\??|visit our help center|manage your account|recommendation transparency|linkedin corporation|why am i seeing this ad|manage your ad preferences)$/i.test(
        str.trim(),
      ) ||
      /visit our help center|manage your account and privacy|recommendation transparency|linkedin corporation/i.test(str);
    const s = section('Courses');
    data.courses.forEach((c) => {
      const name = typeof c === 'string' ? c : c?.name;
      if (!name || isNoise(name)) return;
      const div = el('div', 'item course-item');
      const number = typeof c === 'object' ? c?.number : undefined;
      const associatedWith = typeof c === 'object' ? c?.associatedWith : undefined;
      const head = [name, number].filter(Boolean).join(' — ');
      if (head) div.append(el('div', 'role', head));
      if (associatedWith && !isNoise(associatedWith)) div.append(el('div', 'meta', associatedWith));
      if (norm(div.textContent)) s.append(div);
    });
    if (s.querySelector('.item')) root.append(s);
  }

  function renderPublications(root, data) {
    if (!data.publications?.length) return;
    const isNoise = (str) =>
      !str || /nothing to see for now|when you add new publications/i.test(str);
    const valid = data.publications.filter((p) => p && p.title && !isNoise(p.title));
    if (!valid.length) return;
    const s = section('Publications');
    valid.forEach((p) => {
      if (isNoise(p.title)) return;
      const div = el('div', 'item');
      const title = [p.title, p.source].filter(Boolean).join(' — ');
      if (title) div.append(el('div', 'role', title));
      if (p.date) div.append(el('div', 'meta', p.date));
      if (p.description) div.append(el('p', '', p.description));
      if (norm(div.textContent)) s.append(div);
    });
    if (s.querySelector('.item')) root.append(s);
  }

  function renderRecommendations(root, data) {
    if (!Array.isArray(data.recommendations) || !data.recommendations.length) return;
    const isNoise = (str) => {
      if (!str) return false;
      const s = String(str).trim();
      if (
        /nothing to see for now|when you add (?:new )?recommendations|recommendations? that .+ will appear here|no recommendations? (?:yet|to show)/i.test(
          s,
        )
      )
        return true;
      if (s.length > 80) return false;
      return (
        /^(?:show all pending|show all|pending|bekleyen|questions\??|visit our help center|manage your account|recommendation transparency|linkedin corporation|why am i seeing this ad|manage your ad preferences)$/i.test(
          s,
        ) ||
        /visit our help center|manage your account and privacy|recommendation transparency|linkedin corporation/i.test(s)
      );
    };
    const valid = data.recommendations.filter(
      (r) => r && (r.recommenderName || r.text) && !isNoise(r.recommenderName) && !isNoise(r.text),
    );
    if (!valid.length) return;
    const s = section('Recommendations');
    valid.forEach((r) => {
      if (isNoise(r.recommenderName) || isNoise(r.text)) return;
      const div = el('div', 'item recommendation-item');
      const name = r.recommenderName || 'Recommendation';
      const head = [name, r.recommenderTitle].filter(Boolean).join(' — ');
      if (head) div.append(el('div', 'role', head));
      if (r.relationship && !isNoise(r.relationship)) div.append(el('div', 'meta', r.relationship));
      if (r.text && !isNoise(r.text)) div.append(el('p', 'description recommendation-text', r.text));
      if (norm(div.textContent)) s.append(div);
    });
    if (s.querySelector('.item')) root.append(s);
  }

  window.__PRINT_RENDER_SECTIONS__ = {
    renderContact,
    renderAbout,
    renderExperience,
    renderEducation,
    renderProjects,
    renderCourses,
    renderCertifications,
    renderSkills,
    renderLanguages,
    renderHonors,
    renderPublications,
    renderRecommendations,
  };
})();
