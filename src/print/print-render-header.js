// Renders the profile header block with optional photo on the right
(function () {
  const { el, a, norm, joinInline } = window.__PRINT_UTILS__;

  const PRONOUNS_RE =
    /^\s*(?:he\s*\/\s*him(?:\s*\/\s*his)?|she\s*\/\s*her(?:\s*\/\s*hers)?|they\s*\/\s*them(?:\s*\/\s*theirs)?|he\s*\/\s*they|she\s*\/\s*they|any pronouns?|[eé]l\s*\/\s*[eé]l|ella\s*\/\s*ella)\s*$/i;

  function renderHeader(root, data, settings) {
    const section = el('section', 'header section');

    const left = el('div', 'left');

    const name = norm(data.name) || 'LinkedIn Profile';
    const profileURL =
      (data.contact && data.contact.publicProfile) ||
      (data.slug
        ? `https://www.linkedin.com/in/${encodeURIComponent(data.slug)}/`
        : null);

    const h1 = el('h1', 'candidate-name');
    if (profileURL) h1.append(a(profileURL, name));
    else h1.textContent = name;
    left.append(h1);

    let headline = data.headline ? norm(data.headline) : '';
    if (headline && PRONOUNS_RE.test(headline)) headline = '';
    if (headline) left.append(el('div', 'headline', headline));

    const metaParts = [];
    if (data.location) metaParts.push(data.location);
    if (data.slug)
      metaParts.push(
        a(
          `https://www.linkedin.com/in/${encodeURIComponent(data.slug)}/`,
          `/in/${data.slug}`,
        ),
      );
    if (data.lastUpdatedISO)
      metaParts.push(
        `Exported: ${new Date(data.lastUpdatedISO).toLocaleString()}`,
      );
    if (metaParts.length) left.append(joinInline(metaParts));

    const right = el('div', 'right');
    if (settings.withPhoto && data.profileImage) {
      const img = el('img', 'profile-photo');
      img.alt = 'Profile photo';
      img.loading = 'eager';
      img.setAttribute('width', '100');
      img.setAttribute('height', '100');

      img.src = data.profileImage;
      right.append(img);

      try {
        img.scrollIntoView({ block: 'nearest' });
      } catch {}
    }

    section.append(left, right);
    root.append(section);
  }

  window.__PRINT_RENDER_HEADER__ = { renderHeader };
})();
