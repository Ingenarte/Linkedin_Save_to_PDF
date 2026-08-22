// contact.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractContact = function extractContact() {
    const { uniqueByCI, QA, Q } = ns;

    function unwrapRedirect(href) {
      if (!href) return '';
      try {
        const u = new URL(href, location.href);
        if (u.pathname.includes('/safety/go') || u.pathname.includes('/redir/redirect')) {
          const target = u.searchParams.get('url');
          if (target) return decodeURIComponent(target);
        }
        return u.toString();
      } catch {
        return href;
      }
    }

    function isNoiseContactUrl(u) {
      try {
        const url = new URL(u);
        const host = url.hostname.toLowerCase();
        if (host.endsWith('linkedin.com') || host === 'lnkd.in') return true;
        if (
          host.includes('googletagmanager.com') ||
          host.includes('google-analytics.com')
        )
          return true;
        return false;
      } catch {
        return true;
      }
    }

    const contactRoots = [
      Q('.pv-contact-info'),
      Q('.pv-profile-section__section-info'),
      Q('section[componentkey*="ContactInfo"]'),
      Q('.artdeco-modal[aria-labelledby*="contact" i]'),
      Q('.pv-text-details__custom-action'),
      Q('.pv-top-card--website'),
      Q('section[componentkey*="Topcard"]'),
      Q('.pv-top-card'),
    ].filter(Boolean);

    let rawAnchors = [];
    for (const root of contactRoots) {
      const anchors = QA('a[href^="mailto:"], a[href^="https://"], a[href^="http://"]', root);
      rawAnchors.push(...anchors);
    }

    if (!rawAnchors.length) {
      const topcard = Q('main') || document;
      rawAnchors = QA(
        'a[href^="mailto:"], a[href^="https://"], a[href^="http://"]',
        topcard,
      );
    }

    const raw = uniqueByCI(
      rawAnchors
        .map((a) => a.getAttribute('href'))
        .filter(Boolean)
        .map(unwrapRedirect),
    );

    const email = raw.find((h) => /^mailto:/i.test(h));
    const websites = raw
      .filter((h) => /^https?:\/\//i.test(h) && !isNoiseContactUrl(h))
      .slice(0, 5);

    return {
      email: email ? email.replace(/^mailto:/i, '') : undefined,
      websites: websites.length ? websites : undefined,
    };
  };
})();
