// skills.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractSkills = function extractSkills() {
    const { findSection, QA, T, norm } = ns;
    const sec = findSection(/skills/i);
    if (!sec) return undefined;
    const raw = new Set();
    QA(
      "a[href*='/skills/'], a[href*='/skill/'], span[aria-hidden='true'], span.artdeco-pill__text",
      sec
    ).forEach((n) => {
      const s = norm(T(n));
      if (!s) return;
      if (/^skills$/i.test(s)) return;
      if (/show all|endorse/i.test(s)) return;
      if (s.length <= 2) return;
      raw.add(s.toLowerCase());
    });
    const arr = Array.from(raw).map((s) =>
      s.replace(/^./, (c) => c.toUpperCase())
    );
    return arr.length ? arr : undefined;
  };
})();

