// interests.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.extractInterests = function extractInterests() {
    const { findSection, QA, T, norm } = ns;
    const rootResolver = ns.getSectionRoot || findSection;
    const sec = rootResolver({
      key: 'interests',
      heading: /interests|intereses/i,
    });
    if (!sec) return undefined;
    const names = new Set();
    QA(
      "a[href*='/in/'], a[href*='/company/'], a[href*='/groups/']",
      sec,
    ).forEach((a) => {
      const s = norm(T(a));
      if (!s) return;
      if (/show all/i.test(s)) return;
      if (/followers/i.test(s)) return;
      if (s.length <= 2) return;
      names.add(s.toLowerCase());
    });
    const arr = Array.from(names)
      .map((s) => s.replace(/^./, (c) => c.toUpperCase()))
      .slice(0, 40);
    return arr.length ? arr : undefined;
  };
})();
