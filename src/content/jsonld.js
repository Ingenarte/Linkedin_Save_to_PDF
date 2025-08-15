// jsonld.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractFromJsonLd = function extractFromJsonLd() {
    try {
      const scripts = ns.QA('script[type="application/ld+json"]');
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!/Person/i.test(txt)) continue;
        const json = JSON.parse(txt);
        const person = Array.isArray(json)
          ? json.find((j) => j['@type'] === 'Person')
          : json;
        if (person && person['@type'] === 'Person') {
          return {
            name: person.name || undefined,
            headline: person.jobTitle || person.description || undefined,
            location: person.address?.addressLocality || undefined,
          };
        }
      }
    } catch {}
    return {};
  };
})();
