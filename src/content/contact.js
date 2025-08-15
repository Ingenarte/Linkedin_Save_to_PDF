// contact.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractContact = function extractContact() {
    const { uniqueByCI, QA } = ns;

    const raw = uniqueByCI(
      QA('a[href^="mailto:"], a[href^="https://"], a[href^="http://"]')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean)
    );

    const isInternalLinkedIn = (u) => {
      try {
        const url = new URL(u);
        if (!/^https?:/i.test(url.protocol)) return false;
        return (
          url.hostname.endsWith('linkedin.com') || url.hostname === 'lnkd.in'
        );
      } catch {
        return false;
      }
    };

    const email = raw.find((h) => /^mailto:/i.test(h));
    const websites = raw
      .filter((h) => /^https?:\/\//i.test(h) && !isInternalLinkedIn(h))
      .slice(0, 5);

    return {
      email: email ? email.replace(/^mailto:/i, '') : undefined,
      websites: websites.length ? websites : undefined,
    };
  };
})();
