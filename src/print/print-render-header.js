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

    // Right column (photo) with robust fallback
    const right = el('div', 'right');
    if (settings.withPhoto && data.profileImage) {
      console.log('ADENTRO');

      const img = el('img', 'profile-photo');
      console.log('img element created:', img);

      img.alt = 'Profile photo';

      // Force eager load (printing context often ignores lazy loading)
      img.loading = 'eager';

      // Give the image intrinsic size so layout/print reserves space immediately
      img.setAttribute('width', '110');
      img.setAttribute('height', '110');

      // Avoid forcing referrerPolicy here; defaults are usually safer for CDNs
      // Do not set decoding to async; let the browser choose
      // (you can test: img.decoding = 'sync' is not valid; omit attribute)

      // Debug helper to inspect geometry/visibility
      const logGeom = (label) => {
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        console.debug(`[print][img] ${label}`, {
          complete: img.complete,
          natural: [img.naturalWidth, img.naturalHeight],
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          src: img.getAttribute('src'),
        });
      };

      logGeom('created-before-src');

      img.onload = () => {
        console.debug('[print] profileImage onload');
        logGeom('onload');
      };

      img.onerror = (e) => {
        console.warn(
          '[print] profileImage ERROR (initial):',
          e,
          'url=',
          data.profileImage
        );
        logGeom('onerror');
      };

      let objectUrl = null;
      const cleanupObjectUrl = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      };

      async function fetchAsBlobUrl(url) {
        try {
          const res = await fetch(url, { credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        } catch (e) {
          console.warn('[print] Fallback fetch->blob failed:', e);
          return null;
        }
      }

      // Fallback if direct load fails (kept for diagnosis; harmless if not used)
      const fallbackOnError = async () => {
        console.warn(
          '[print] Direct image load failed; trying blob fallback:',
          data.profileImage
        );
        const blobUrl = await fetchAsBlobUrl(data.profileImage);
        if (!blobUrl) {
          // As last resort, keep layout by inserting a placeholder box
          const placeholder = el('div', 'profile-photo');
          placeholder.style.background = '#e5e7eb';
          placeholder.style.width = '110px';
          placeholder.style.height = '110px';
          right.append(placeholder);
          return;
        }
        objectUrl = blobUrl;
        img.onerror = () => {
          console.error('[print] Blob fallback load failed.');
          cleanupObjectUrl();
        };
        img.onload = () => {
          logGeom('onload-blob-fallback');
          setTimeout(cleanupObjectUrl, 5000);
        };
        img.src = blobUrl;
      };

      // Bind fallback handler
      img.addEventListener('error', fallbackOnError, { once: true });

      // Assign src and append
      img.src = data.profileImage;
      logGeom('after-src');

      right.append(img);
      logGeom('after-append');

      // Make sure it's considered "in view" even in print preview flows
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
