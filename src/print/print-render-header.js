// Renders the profile header block with optional photo on the right
(function () {
  const { el, a, norm, joinInline } = window.__PRINT_UTILS__;

  function sanitizeForTitle(s) {
    return (s || '')
      .replace(/[<>:"/\\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderHeader(root, data, settings) {
    const section = el('section', 'header section');

    // Left column (name, headline, meta)
    const left = el('div', 'left');

    const name = norm(data.name) || 'LinkedIn Profile';
    const profileURL =
      (data.contact && data.contact.publicProfile) ||
      (data.slug
        ? `https://www.linkedin.com/in/${encodeURIComponent(data.slug)}/`
        : null);

    const h1 = el('h1', '');
    if (profileURL) h1.append(a(profileURL, name));
    else h1.textContent = name;
    left.append(h1);

    if (data.headline) left.append(el('div', 'headline', data.headline));

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
        `Exported: ${new Date(data.lastUpdatedISO).toLocaleString()}`
      );
    if (metaParts.length) left.append(joinInline(metaParts));

    // Right column (photo). The browser may load the already-visible
    // LinkedIn image URL as a normal page resource; the extension does
    // not fetch profile images programmatically.
    const right = el('div', 'right');
    if (settings.withPhoto && data.profileImage) {
      const img = el('img', 'profile-photo');
      img.alt = 'Profile photo';
      img.loading = 'eager';
      img.setAttribute('width', '110');
      img.setAttribute('height', '110');

      img.src = data.profileImage;
      right.append(img);

      try {
        img.scrollIntoView({ block: 'nearest' });
      } catch {}
    }

    // Compose
    section.append(left, right);
    root.append(section);

    // Document title
    const safeName = sanitizeForTitle(name);
    const safeSlug = sanitizeForTitle(data.slug || '');
    document.title = safeSlug
      ? `LinkedIn Profile - ${safeName} — _in_${safeSlug}`
      : `LinkedIn Profile - ${safeName}`;
  }

  window.__PRINT_RENDER_HEADER__ = { renderHeader };
})();
