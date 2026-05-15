// src/content/utils.js
// Shared helpers (attached to a single global namespace to avoid ES module usage in MV3 content scripts)
(function (w) {
  // Unified namespace
  const ns = (w.__LNP_NS__ = w.__LNP_NS__ || {});
  // Backward compatibility alias for older modules
  w.__lnp = ns;

  // DOM helpers
  ns.T = (el) => ((el && el.textContent) || '').trim();
  ns.Q = (sel, root = document) => root.querySelector(sel);
  ns.QA = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  ns.norm = (s) => (s ? s.replace(/\s+/g, ' ').trim() : s);

  ns.isLinkedInAdOrPreferenceText = (text) => {
    const t = ns.norm(text || '');
    if (!t) return false;
    const low = t
      .replace(/[’]/g, "'")
      .replace(/^[\s\-–—·•:]+|[\s\-–—·•:]+$/g, '')
      .toLowerCase();
    if (!low) return false;
    const compact = low.replace(/[\s\-–—·•:?!.,;()]+/g, ' ').trim();
    if (
      /^(why am i seeing this ad\??|manage your ad preferences|i don'?t want to see this ad(?: in my feed)?|hide this ad|ad choices|advertising choices|sponsored|promoted)$/.test(
        low,
      )
    )
      return true;
    if (
      /\b(why am i seeing this ad|manage your ad preferences|i don'?t want to see this ad|ad choices|advertising choices)\b/.test(
        low,
      )
    )
      return true;
    if (
      compact.includes('why am i seeing this ad') ||
      compact.includes('manage your ad preferences') ||
      compact.includes("i don't want to see this ad") ||
      compact.includes('i dont want to see this ad')
    )
      return true;
    if (/^[-–—·•]*\s*manage your ad preferences$/i.test(t)) return true;
    return false;
  };

  ns.hasLinkedInAdOrPreferenceText = (value) => {
    if (value == null) return false;
    if (typeof value === 'string') return ns.isLinkedInAdOrPreferenceText(value);
    if (Array.isArray(value)) return value.some(ns.hasLinkedInAdOrPreferenceText);
    if (typeof value === 'object') {
      return Object.values(value).some(ns.hasLinkedInAdOrPreferenceText);
    }
    return false;
  };

  ns.withoutLinkedInAdPreferenceItems = (items) => {
    if (!Array.isArray(items)) return items;
    return items.filter((item) => !ns.hasLinkedInAdOrPreferenceText(item));
  };

  ns.sanitizeExportPayload = (value) => {
    if (value == null) return value;
    if (typeof value === 'string') {
      return ns.isLinkedInAdOrPreferenceText(value) ? undefined : value;
    }
    if (Array.isArray(value)) {
      const items = value
        .map(ns.sanitizeExportPayload)
        .filter((item) => {
          if (item == null) return false;
          if (typeof item === 'object' && !Array.isArray(item)) {
            return Object.keys(item).length > 0;
          }
          return true;
        });
      return items.length ? items : undefined;
    }
    if (typeof value === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        const clean = ns.sanitizeExportPayload(child);
        if (clean !== undefined) out[key] = clean;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return value;
  };

  ns.uniqueByCI = (arr) => {
    const out = [];
    const seen = new Set();
    for (const v of arr || []) {
      const t = ns.norm(v);
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  };

  // Remove consecutive duplicate lines and inline doubled phrases
  ns.dedupeText = (s) => {
    if (!s) return s;
    const parts = s
      .split(/\n+|(?<=\.)\s+(?=[A-Z])|(?<=\!)\s+|(?<=\?)\s+/)
      .map((x) => ns.norm(x))
      .filter(Boolean);
    const out = [];
    let last = '';
    for (let p of parts) {
      let v = p;
      if (v.length % 2 === 0) {
        const half = v.slice(0, v.length / 2);
        if (half && v === half + half) v = half;
      }
      if (v && v !== last) {
        out.push(v);
        last = v;
      }
    }
    return out.join(' ');
  };

  // Prefer visible text and avoid mixing aria-hidden variants
  ns.pickVisibleText = (nodes) => {
    const arr = Array.from(nodes || []);
    const hidden = arr.find(
      (n) => n.getAttribute && n.getAttribute('aria-hidden') === 'true',
    );
    return ns.T(hidden || arr[0] || null);
  };
  ns.pickRoleNode = (container) =>
    ns.Q('h3', container) ||
    ns.Q("span[aria-hidden='true']", container) ||
    ns.Q('span', container);

  // Async helpers
  ns.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  ns.autoScroll = async (passes = 1) => {
    for (let p = 0; p < passes; p++) {
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await ns.wait(140);
      }
    }
    window.scrollTo(0, 0);
  };

  // LinkedIn's 2026 SPA wraps the profile in <main id="workspace">
  // with `overflow-y: auto`. The body has `overflow: hidden`, so
  // `window.scrollTo` is a no-op — the inner <main> is the actual
  // scroller. Find whichever element is currently scrollable (handles
  // future redesigns and the legacy DOM where <html> still scrolls).
  ns.getScrollContainer = () => {
    // Preferred: an explicit <main> with overflow-y:auto/scroll.
    const candidates = [
      document.getElementById('workspace'),
      document.querySelector('main#workspace'),
      document.querySelector('main[role="main"]'),
      document.querySelector('main'),
    ].filter(Boolean);
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      const ovY = cs.overflowY;
      if (
        (ovY === 'auto' || ovY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 50
      ) {
        return el;
      }
    }
    // Heuristic: walk all elements once and pick the largest scroller.
    let best = null;
    for (const el of document.querySelectorAll('main, div, section')) {
      const cs = getComputedStyle(el);
      const ovY = cs.overflowY;
      if (ovY !== 'auto' && ovY !== 'scroll') continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow < 200) continue;
      if (!best || overflow > best.scrollHeight - best.clientHeight) best = el;
    }
    if (best) return best;
    // Fallback to documentElement / body for legacy DOMs and tests.
    return (
      document.scrollingElement || document.documentElement || document.body
    );
  };

  // Wait until no MutationObserver mutations fire for `quietMs`
  // milliseconds, or `maxWait` is hit. Used between scroll steps so
  // we proceed only after React/lazy-load has actually settled.
  ns.waitForDomQuiet = (target, opts = {}) =>
    new Promise((resolve) => {
      const quietMs = opts.quietMs ?? 500;
      const maxWait = opts.maxWait ?? 3000;
      let lastMutation = Date.now();
      let mutationCount = 0;
      const obs = new MutationObserver(() => {
        mutationCount++;
        lastMutation = Date.now();
      });
      try {
        obs.observe(target || document.body, {
          childList: true,
          subtree: true,
          attributes: false,
        });
      } catch {
        resolve({ mutationCount: 0, gaveUp: false });
        return;
      }
      const start = Date.now();
      const tick = setInterval(() => {
        const now = Date.now();
        if (now - lastMutation >= quietMs) {
          clearInterval(tick);
          obs.disconnect();
          resolve({ mutationCount, gaveUp: false });
        } else if (now - start >= maxWait) {
          clearInterval(tick);
          obs.disconnect();
          resolve({ mutationCount, gaveUp: true });
        }
      }, 100);
    });

  // Per-step PageDown loop. Mirrors what a human does pressing the
  // PageDown key: scroll one viewport, wait, check whether the DOM
  // mutated, repeat. We never restart at scrollTop=0 mid-loop, so the
  // user sees one continuous downward sweep instead of repeated
  // up/down bounces.
  //
  // Stops when:
  //   - we reached the bottom AND the DOM was quiet (no mutations)
  //     for `stableSteps` consecutive steps, OR
  //   - we hit the `maxSteps` hard cap.
  //
  // The caller is responsible for the single scroll-back-to-top at
  // the very end of the expand pipeline.
  ns.scrollUntilStable = async (opts = {}) => {
    const stepWait = opts.stepWait ?? 500; // user-requested 0.5s per PageDown
    const quietMs = opts.quietMs ?? 400; // MutationObserver quiet window
    const settleWait = opts.settleWait ?? 1500; // max wait inside waitForDomQuiet
    const stableSteps = opts.stableSteps ?? 2; // consecutive quiet steps to stop
    const maxSteps = opts.maxSteps ?? 80; // hard cap (~40s worst case)
    const deadlineMs = opts.deadlineMs; // optional epoch ms — stop scrolling after this
    const sectionSelector =
      opts.sectionSelector ?? 'section[componentkey], section';

    const container = ns.getScrollContainer();
    const isWindowScroller =
      container === document.documentElement ||
      container === document.body ||
      container === document.scrollingElement;

    const getScrollH = () => container.scrollHeight;
    const getClientH = () => container.clientHeight || window.innerHeight;
    const getScrollTop = () =>
      isWindowScroller
        ? window.scrollY || document.documentElement.scrollTop
        : container.scrollTop;
    const setScrollTop = (y) => {
      if (isWindowScroller) window.scrollTo(0, y);
      else container.scrollTop = y;
    };

    let consecutiveStable = 0;
    let stepNumber = 0;
    let lastY = -1;
    const log = [];

    while (consecutiveStable < stableSteps && stepNumber < maxSteps) {
      if (typeof deadlineMs === 'number' && Date.now() >= deadlineMs) break;
      stepNumber++;
      const viewport = getClientH();
      const curY = getScrollTop();
      const maxY = Math.max(0, getScrollH() - viewport);
      const targetY = Math.min(curY + viewport, getScrollH());

      // ONE PageDown.
      setScrollTop(targetY);
      // Wait the requested step delay (analogous to "press PageDown,
      // then wait 0.5s").
      await ns.wait(stepWait);
      // Verify whether the DOM actually mutated (lazy-load fired).
      let maxWaitThisStep = settleWait;
      if (typeof deadlineMs === 'number') {
        maxWaitThisStep = Math.max(
          80,
          Math.min(settleWait, deadlineMs - Date.now() - 50),
        );
      }
      const quiet = await ns.waitForDomQuiet(container, {
        quietMs,
        maxWait: maxWaitThisStep,
      });

      const reachedBottom = getScrollTop() >= maxY - 2;
      const noMutations = quiet.mutationCount === 0;
      const noScrollProgress = getScrollTop() === lastY;

      log.push({
        step: stepNumber,
        y: getScrollTop(),
        scrollH: getScrollH(),
        sections: document.querySelectorAll(sectionSelector).length,
        mutations: quiet.mutationCount,
        reachedBottom,
      });

      // Only count the step as "stable" once we are at the bottom
      // (otherwise we still have viewports to traverse) AND nothing
      // new appeared during the wait.
      if (reachedBottom && (noMutations || noScrollProgress)) {
        consecutiveStable++;
      } else {
        consecutiveStable = 0;
      }
      lastY = getScrollTop();
    }

    return {
      steps: stepNumber,
      finalScrollTop: getScrollTop(),
      finalScrollH: getScrollH(),
      finalSections: document.querySelectorAll(sectionSelector).length,
      containerTag: container.tagName,
      containerId: container.id || null,
      isWindowScroller,
      setScrollTop,
      log,
    };
  };
  // Expands only content-expansion controls inside the profile's <main>.
  // Must NEVER click global nav menus, avatar/popover triggers, post "..."
  // menus, or any element that opens a menu/dialog/listbox — clicking those
  // causes multiple LinkedIn dropdowns to open simultaneously.
  ns.EXPAND_TEXT_RE = /see more|show more|show all|\.{2,3}\s*more\b/i;

  // aria-haspopup values that indicate a menu/dialog trigger (never click).
  ns.POPUP_HASPOPUP_VALUES = new Set([
    'true',
    'menu',
    'dialog',
    'listbox',
    'grid',
    'tree',
  ]);

  // Returns true if clicking this element would open a menu/popover instead
  // of expanding inline content.
  ns.isPopupTrigger = (el) => {
    if (!el || !el.getAttribute) return false;
    const hp = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (hp && ns.POPUP_HASPOPUP_VALUES.has(hp)) return true;
    if (el.closest && el.closest('[role="menu"], [role="menubar"], nav'))
      return true;
    return false;
  };

  // Returns true if element is considered a safe inline-expander:
  //  - lives inside <main> (profile content)
  //  - is a button / role=button / link-button
  //  - is NOT a popup trigger
  //  - visible text matches an expansion phrase
  ns.isSafeExpander = (el) => {
    if (!el) return false;
    const main = document.querySelector('main');
    if (main && !main.contains(el)) return false;
    if (ns.isPopupTrigger(el)) return false;
    const txt = (el.textContent || '').trim();
    if (!txt) return false;
    return ns.EXPAND_TEXT_RE.test(txt);
  };

  ns.clickMoreButtons = async () => {
    const main = document.querySelector('main') || document;
    const candidates = Array.from(
      main.querySelectorAll("button, a[role='button']"),
    ).filter(ns.isSafeExpander);
    for (const btn of candidates) {
      try {
        btn.click();
        // Small delay so LinkedIn's React has time to settle between
        // synthetic clicks and we don't stack re-renders.
        await ns.wait(60);
      } catch {}
    }
  };

  /**
   * Every `<section>` in `<main>` whose `componentkey` looks like an
   * Education card or list (English SDUI keys are not localized).
   */
  ns.listEducationSectionRootsInMain = () => {
    const main = document.querySelector('main') || document.body;
    return [...main.querySelectorAll('section[componentkey]')].filter((s) => {
      const ck = (s.getAttribute('componentkey') || '').toLowerCase();
      if (!ck.includes('education')) return false;
      if (
        /interests|skill|certif|honor|publication|language|experience|topcard|about|contact|featured|activity|service|recommend|volunteer|license|position|company|insight|course/i.test(
          ck,
        )
      ) {
        return false;
      }
      return true;
    });
  };

  /**
   * SDUI `/details/<section>/` lists often live inside nested
   * `.scaffold-finite-scroll__content` regions. Window scroll alone does
   * not virtualize all rows — page each inner scroller after the section
   * is in view (same approach as Education).
   */
  ns.materializeInnerFiniteScrollForSectionRoots = async (roots) => {
    if (!roots || !roots.length) return;
    const innerSelectors = [
      '.scaffold-finite-scroll__content',
      '[class*="finite-scroll__content"]',
    ];
    for (const sec of roots) {
      try {
        sec.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch {
        try {
          sec.scrollIntoView(true);
        } catch {}
      }
      await ns.wait(220);
      const innerSet = new Set();
      for (const sel of innerSelectors) {
        for (const el of sec.querySelectorAll(sel)) innerSet.add(el);
      }
      for (const root of innerSet) {
        if (!root || root.scrollHeight <= root.clientHeight + 12) continue;
        let stagnant = 0;
        let prevTop = -999;
        for (let step = 0; step < 40; step++) {
          const ch = root.clientHeight || 400;
          const maxTop = Math.max(0, root.scrollHeight - ch);
          root.scrollTop = Math.min(
            (root.scrollTop || 0) + Math.max(80, ch * 0.88),
            maxTop + 2,
          );
          await ns.wait(160);
          try {
            await ns.waitForDomQuiet(root, { quietMs: 180, maxWait: 800 });
          } catch {}
          if (Math.abs(root.scrollTop - prevTop) < 2) stagnant++;
          else stagnant = 0;
          prevTop = root.scrollTop;
          if (root.scrollTop >= maxTop - 6 || stagnant >= 3) break;
        }
      }
    }
  };

  /**
   * Every Experience `<section>` in `<main>` matching the SDUI
   * `componentkey` suffixes (same set as getSectionByComponentkey).
   */
  ns.listExperienceSectionRootsInMain = () => {
    const main = document.querySelector('main') || document.body;
    const suf = ns.SECTION_COMPONENTKEY?.experience;
    if (!suf || !Array.isArray(suf)) return [];
    return [...main.querySelectorAll('section[componentkey]')].filter((s) => {
      const ck = s.getAttribute('componentkey') || '';
      return suf.some((fragment) => ck.endsWith(fragment));
    });
  };

  ns.materializeExperienceFiniteScrolls = async () => {
    await ns.materializeInnerFiniteScrollForSectionRoots(
      ns.listExperienceSectionRootsInMain(),
    );
  };

  /**
   * After expandUI scrolls the profile workspace back to `scrollTop=0`,
   * virtualized SDUI lists often drop off-screen rows. Re-mount the full
   * Education list by bringing each Education section into view and paging
   * inner finite-scroll roots to the bottom.
   */
  ns.materializeEducationFiniteScrolls = async () => {
    await ns.materializeInnerFiniteScrollForSectionRoots(
      ns.listEducationSectionRootsInMain(),
    );
  };

  // Single-pass expand. Goal: scroll DOWN exactly once (with stability
  // detection so we stop as soon as nothing new loads), click any
  // expanders revealed by the scroll, then scroll back to TOP exactly
  // once. The user should see one smooth down-trip, not multiple
  // up/down bounces.
  ns.expandUI = async () => {
    const scrollMeta = await ns.scrollUntilStable({
      stepWait: 360,
      quietMs: 300,
      settleWait: 1000,
      stableSteps: 2,
      maxSteps: 60,
    });
    await ns.clickMoreButtons();
    // Brief settle wait so React mounts any expanded content. We do
    // NOT trigger another full scroll pass — the user reported
    // visible up/down bouncing when this was a multi-pass loop.
    await ns.wait(300);
    // Single anchor back to top now that everything is loaded.
    if (scrollMeta && typeof scrollMeta.setScrollTop === 'function') {
      scrollMeta.setScrollTop(0);
    } else {
      window.scrollTo(0, 0);
    }
    await ns.wait(120);
    if (typeof ns.materializeEducationFiniteScrolls === 'function') {
      await ns.materializeEducationFiniteScrolls();
    }
    if (typeof ns.materializeExperienceFiniteScrolls === 'function') {
      await ns.materializeExperienceFiniteScrolls();
    }
    await ns.wait(120);
    return scrollMeta;
  };

  // Tighter scroll + shorter observer waits for /details/ deep-export
  // tabs so each page finishes within ~6s instead of tens of seconds.
  ns.expandUIWithBudget = async (maxTotalMs = 5500, section) => {
    const heavySection = section === 'experience' || section === 'education';
    // education gets the slowest scroll to give headless/GPU-less Chromium
    // (e.g. Linode Xvfb) enough time to hydrate each SDUI row.
    const educationSection = section === 'education';
    const mediumSection = section === 'skills';
    const reserveTop = heavySection ? 500 : 220;
    const deadline = Date.now() + Math.max(1200, maxTotalMs - reserveTop);
    const scrollMeta = await ns.scrollUntilStable({
      stepWait: educationSection ? 300 : heavySection ? 160 : 110,
      quietMs: educationSection ? 350 : heavySection ? 200 : 140,
      settleWait: educationSection ? 600 : heavySection ? 340 : 220,
      stableSteps: heavySection ? 2 : 1,
      maxSteps: educationSection ? 32 : heavySection ? 24 : mediumSection ? 18 : 10,
      deadlineMs: deadline,
    });
    await ns.clickMoreButtons();
    await ns.wait(Math.min(heavySection ? 160 : 80, Math.max(0, deadline - Date.now())));
    if (scrollMeta && typeof scrollMeta.setScrollTop === 'function') {
      scrollMeta.setScrollTop(0);
    } else {
      window.scrollTo(0, 0);
    }
    await ns.wait(heavySection ? 100 : 60);
    if (
      section === 'education' &&
      typeof ns.materializeEducationFiniteScrolls === 'function'
    ) {
      await ns.materializeEducationFiniteScrolls();
    }
    if (
      section === 'experience' &&
      typeof ns.materializeExperienceFiniteScrolls === 'function'
    ) {
      await ns.materializeExperienceFiniteScrolls();
    }
    await ns.wait(heavySection ? 100 : 40);
    return scrollMeta;
  };

  // ----------------------------------------------------------------
  // Section discovery
  // ----------------------------------------------------------------
  //
  // LinkedIn's 2026 SPA is a Server-Driven UI: every profile card is a
  // <section componentkey="com.linkedin.sdui.profile.card.<ref><Name>">.
  // Names like Topcard / About / Experience / Education / Skills are
  // stable across locales (the DOM does not localize the componentkey).
  //
  // Older LinkedIn snapshots (and the synthetic regression fixture) used
  // <section id="about-section"> + visible <h2>About</h2>. We keep both
  // strategies, with componentkey preferred when available.

  ns.hasHeader = (sec, re) => {
    if (!sec) return false;
    const h = sec.querySelector('h1, h2, h3, header h1, header h2, header h3');
    return re.test((h && h.textContent) || '');
  };

  // Finds the first <section> in <main> whose `componentkey` attribute
  // matches one of the given suffix patterns. LinkedIn uses several
  // naming variants in the wild — for example, the Experience card
  // can be `...Experience`, `...ExperienceTopLevelSection`, the
  // Languages card can be `...LanguageTopLevel` (singular), and the
  // Certifications card can be `...CertificationTopLevel`.
  //
  // Accepts:
  //   - a single string suffix          ("Experience")
  //   - an array of string suffixes     (["Experience", "ExperienceTopLevelSection"])
  //   - a RegExp tested against the key (componentkey itself)
  ns.getSectionByComponentkey = (matcher) => {
    if (!matcher) return null;
    const main = document.querySelector('main') || document;
    const all = main.querySelectorAll('section[componentkey]');
    const matches = (ck) => {
      if (matcher instanceof RegExp) return matcher.test(ck);
      const list = Array.isArray(matcher) ? matcher : [matcher];
      return list.some((suf) => ck.endsWith(suf));
    };
    for (const s of all) {
      const ck = s.getAttribute('componentkey') || '';
      if (matches(ck)) return s;
    }
    return null;
  };

  /**
   * Main profile often has two Education `<section>` nodes: a compact
   * top card (`...profile.card.*Education`) and the full list
   * (`...EducationTopLevelSection` / `...profile.education.*`). The
   * generic getSectionByComponentkey() returns the first DOM match (the
   * card), so extractors only see one school. Score every matching section
   * and return the richest one.
   */
  ns.getBestEducationSectionByComponentkey = (matcher) => {
    if (!matcher) return null;
    const main = document.querySelector('main') || document;
    const sections = main.querySelectorAll('section[componentkey]');
    const matches = (ck) => {
      if (matcher instanceof RegExp) return matcher.test(ck);
      const list = Array.isArray(matcher) ? matcher : [matcher];
      return list.some((suf) => ck.endsWith(suf));
    };
    const entityBlockCount = (sec) => {
      const raw = [
        ...sec.querySelectorAll('[componentkey^="entity-collection-item"]'),
        ...sec.querySelectorAll('[componentkey*="entity-collection-item"]'),
      ];
      const withPs = raw.filter((el) => el.querySelectorAll('p').length >= 2);
      const roots = withPs.filter(
        (el) => !withPs.some((other) => other !== el && other.contains(el)),
      );
      return roots.length;
    };
    const scoreEducationSection = (sec) => {
      const entities = entityBlockCount(sec);
      const li = sec.querySelectorAll('ul li').length;
      const h3 = sec.querySelectorAll('h3').length;
      const schoolA = sec.querySelectorAll('a[href*="/school/"]').length;
      const listSignal = li * 12 + h3 * 8;
      const entitySignal = entities * 75;
      return Math.max(entitySignal, listSignal) + schoolA * 4;
    };
    const tierEducationCk = (ck) => {
      const k = String(ck || '');
      if (/EducationTopLevelSection|EducationTopLevel$/i.test(k)) return 3;
      if (/\.profile\.education\./i.test(k)) return 2;
      if (/\.profile\.card\./i.test(k) && /Education/i.test(k)) return 1;
      return 0;
    };
    let best = null;
    let bestScore = -1;
    let bestTier = -1;
    let bestIdx = -1;
    let i = 0;
    for (const s of sections) {
      const ck = s.getAttribute('componentkey') || '';
      if (!matches(ck)) {
        i++;
        continue;
      }
      const sc = scoreEducationSection(s);
      const tier = tierEducationCk(ck);
      if (
        sc > bestScore ||
        (sc === bestScore && tier > bestTier) ||
        (sc === bestScore && tier === bestTier && i > bestIdx)
      ) {
        best = s;
        bestScore = sc;
        bestTier = tier;
        bestIdx = i;
      }
      i++;
    }
    return best;
  };

  // Finds the first <section> whose first heading matches `re`. Mirrors
  // the legacy findSection() but is exported under a clearer name and
  // also walks <article role="region"> wrappers used in some details
  // pages.
  ns.getSectionByHeading = (re) => {
    if (!re) return null;
    const main = document.querySelector('main') || document;
    const candidates = Array.from(
      main.querySelectorAll(
        "section, [role='region'], main > div > section, main > div > div > section",
      ),
    );
    return candidates.find((sec) => ns.hasHeader(sec, re)) || null;
  };

  // Backwards-compatible alias kept for older modules.
  ns.findSection = (re) => ns.getSectionByHeading(re);

  // Details sub-pages (/in/<slug>/details/<kind>/) sometimes use
  // componentkey strings that do not match the main-profile suffix
  // list (e.g. internal "Detail" variants). Match any section whose
  // key contains a stable substring.
  ns.getSectionByComponentkeyLoose = (key) => {
    if (!key) return null;
    const hints = {
      experience: [/Experience/i, /Position/i],
      education: [/Education/i],
      certifications: [/Certification/i, /License/i],
      skills: [/Skill/i],
      languages: [/Language/i],
      honors: [/Honor/i, /Award/i],
      publications: [/Publication/i],
    };
    const patterns = hints[String(key).toLowerCase()];
    if (!patterns) return null;
    const main = document.querySelector('main') || document;
    for (const s of main.querySelectorAll('section[componentkey]')) {
      const ck = s.getAttribute('componentkey') || '';
      if (patterns.some((re) => re.test(ck))) return s;
    }
    return null;
  };

  ns.DETAILS_COMPONENTKEY = {
    experience: [/ExperienceDetailsSection/i],
    education: [/EducationDetailsSection/i],
    certifications: [/CertificationDetails/i, /License.*Certification/i],
    skills: [/^skill\(/i, /SkillsDetails/i],
    languages: [/LanguageDetails/i],
    honors: [/HonorDetails/i, /AwardDetails/i],
    publications: [/PublicationDetails/i],
  };

  ns.isSupportedLocalesRoot = (node) => {
    const ck = node?.getAttribute?.('componentkey') || '';
    return /SupportedLocales/i.test(ck);
  };

  ns.getDetailsComponentkeyRoot = (key) => {
    if (!ns.isDetailsPage()) return null;
    const patterns = ns.DETAILS_COMPONENTKEY[String(key || '').toLowerCase()];
    if (!patterns) return null;
    const main = document.querySelector('main') || document;
    const sections = [...main.querySelectorAll('section[componentkey]')].filter(
      (section) => {
        if (ns.isSupportedLocalesRoot(section)) return false;
        const ck = section.getAttribute('componentkey') || '';
        return patterns.some((re) => re.test(ck));
      },
    );
    if (sections.length) {
      sections.sort((a, b) => {
        const score = (node) =>
          node.querySelectorAll('[componentkey*="entity-collection-item"]')
            .length +
          node.querySelectorAll('[componentkey^="skill("]').length +
          node.querySelectorAll('a[href]').length;
        return score(b) - score(a);
      });
      return sections[0];
    }
    if (String(key).toLowerCase() === 'skills') {
      const skillRows = [
        ...main.querySelectorAll('[componentkey^="skill("]'),
      ].filter((node) => !/-divider$/i.test(node.getAttribute('componentkey') || ''));
      if (skillRows.length) {
        let root = skillRows[0].parentElement;
        for (let d = 0; d < 12 && root && root !== main; d++) {
          const count = root.querySelectorAll('[componentkey^="skill("]').length;
          if (count >= Math.min(skillRows.length, 4)) return root;
          root = root.parentElement;
        }
      }
    }
    return null;
  };

  // On /details/<kind>/ the list often lives under the scroll scaffold
  // with a visible H1/H2 section title. Prefer that subtree over the
  // whole <main> so we do not scrape sidebar "More profiles for you".
  ns.getDetailsSectionRoot = (key) => {
    if (!ns.isDetailsPage()) return null;
    const k = String(key || '').toLowerCase();
    const headingRe = key && ns.SECTION_HEADING[k];
    if (!headingRe) return null;
    const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
    const rootScan = mainEl || document.body;
    const detailCkRoot =
      typeof ns.getDetailsComponentkeyRoot === 'function'
        ? ns.getDetailsComponentkeyRoot(k)
        : null;
    if (detailCkRoot) return detailCkRoot;
    const headings = rootScan.querySelectorAll('h1, h2, h3');
    const candidates = [];
    const seenCand = new Set();
    const pushCandidate = (node) => {
      if (!node || seenCand.has(node)) return;
      seenCand.add(node);
      candidates.push(node);
    };

    const scoreCandidate = (node) => {
      if (!node) return 0;
      const q = (sel) => node.querySelectorAll(sel).length;
      if (k === 'experience')
        return q('a[href*="/company/"]') + q('a[href*="/positions/"]') * 2;
      if (k === 'education')
        return q('a[href*="/school/"]') + q('a[href*="/company/"]');
      if (k === 'certifications' || k === 'honors' || k === 'publications') {
        let score = q('a[href]');
        const txt = (node.innerText || node.textContent || '').toLowerCase();
        if (/why am i seeing this ad|manage your ad preferences/.test(txt))
          score -= 80;
        if (/\bissued\b/.test(txt)) score += 25;
        if (/credential\s+id/.test(txt)) score += 15;
        return score;
      }
      if (k === 'skills')
        return q('a[href*="/skills/"]') + q('h3');
      if (k === 'languages') return q('a[href]') + q('h3');
      return (node.innerText || node.textContent || '').length;
    };

    const attachScrollRoot = (el) => {
      let scroll = el.closest('.scaffold-finite-scroll__content');
      if (!scroll) {
        const wrap = el.closest('[class*="scaffold-finite-scroll"]');
        if (wrap) {
          scroll =
            wrap.querySelector(
              '.scaffold-finite-scroll__content, [class*="finite-scroll__content"]',
            ) || wrap;
        }
      }
      const node = scroll || el.closest('section[componentkey]') || el.closest('section');
      pushCandidate(node);
    };
    for (const el of headings) {
      if (el.closest('nav, footer, header[role="banner"]')) continue;
      const t = ns.norm(el.textContent || '');
      if (!headingRe.test(t)) continue;
      attachScrollRoot(el);
    }
    // 2026+ details pages sometimes render the card title as a <p> (no h2),
    // so h1–h3-only matching never finds Licenses & certifications.
    for (const el of rootScan.querySelectorAll('p')) {
      if (el.closest('nav, footer, header[role="banner"]')) continue;
      const t = ns.norm(el.textContent || '');
      if (t.length < 4 || t.length > 120) continue;
      if (!headingRe.test(t)) continue;
      attachScrollRoot(el);
    }
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = scoreCandidate(best);
    for (let i = 1; i < candidates.length; i++) {
      const s = scoreCandidate(candidates[i]);
      if (s > bestScore) {
        bestScore = s;
        best = candidates[i];
      }
    }
    if (bestScore < 1 && candidates.length > 1) {
      // Prefer largest subtree when link counts tie at zero (edge DOM).
      for (let i = 1; i < candidates.length; i++) {
        const len = (candidates[i].innerText || '').length;
        if (len > (best.innerText || '').length) best = candidates[i];
      }
    }
    return best;
  };

  ns.isDetailsPage = () => /\/in\/[^\/?#]+\/details\//i.test(location.pathname);

  ns.currentDetailsKind = () => {
    const m = location.pathname.match(/\/details\/([^\/?#]+)\/?/i);
    return m ? m[1].toLowerCase() : undefined;
  };

  /**
   * When heading/scaffold resolution fails on a dedicated /details/<kind>/
   * page, find the smallest subtree in `main` that contains several real
   * row links (company / school / skill) so we avoid the first global scaffold
   * (often an ad slot).
   */
  ns.getDetailsDenseAnchorRoot = (key) => {
    if (!ns.isDetailsPage()) return null;
    const k = String(key || '').toLowerCase();
    const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
    if (!mainEl) return null;
    let selector = 'a[href*="/company/"]';
    if (k === 'education') selector = 'a[href*="/school/"], a[href*="/company/"]';
    else if (k === 'skills') selector = 'a[href*="/skills/"]';
    else if (k === 'languages' || k === 'certifications')
      selector = 'a[href]';
    else if (k === 'honors' || k === 'publications') selector = 'a[href]';

    const anchors = Array.from(mainEl.querySelectorAll(selector)).filter(
      (a) => !a.closest('nav, footer, aside'),
    );
    const hrefOk = (h) => {
      const u = (h || '').split('?')[0];
      if (k === 'skills') return /\/skills\//i.test(u) && !/\/(people|endorse)\b/i.test(u);
      if (k === 'experience')
        return /\/company\/\d+\//.test(u) || /\/company\/[^/?#]+\/?$/i.test(u);
      if (k === 'education')
        return /\/school\/|\/company\//i.test(u);
      return u.includes('linkedin.com');
    };
    const list = anchors.filter((a) => hrefOk(a.getAttribute('href') || ''));
    if (list.length < 2) return null;
    const need = Math.min(list.length, Math.max(3, Math.ceil(list.length * 0.45)));
    let el = list[0];
    for (let d = 0; d < 14 && el && el !== mainEl; d++) {
      const inside = list.filter((a) => el.contains(a)).length;
      if (inside >= need) return el;
      el = el.parentElement;
    }
    return null;
  };

  // Maps a section name (as used by extractors) to the camel-case
  // componentkey suffix LinkedIn uses on the 2026 main profile page.
  // Each section maps to the list of componentkey suffixes seen in
  // the wild on the 2026 LinkedIn SPA. Order is significant only for
  // documentation; getSectionByComponentkey iterates the DOM and
  // returns the first <section> whose key ends with ANY of these.
  //
  // Variants observed:
  //   - Plain English noun:  "Experience", "Education", "Skills"
  //   - "TopLevelSection"  : "ExperienceTopLevelSection",
  //                         "EducationTopLevelSection"
  //   - "TopLevel"         : "CertificationTopLevel",
  //                         "LanguageTopLevel" (singular!),
  //                         "RecommendationsTopLevel"
  ns.SECTION_COMPONENTKEY = {
    topcard: ['Topcard'],
    // LinkedIn 2026+ often uses *AboutTopLevel*; `endsWith('About')` misses those keys.
    about: ['AboutTopLevelSection', 'AboutTopLevel', 'About'],
    experience: [
      'Experience',
      'ExperienceTopLevelSection',
      'ExperienceTopLevel',
    ],
    education: ['Education', 'EducationTopLevelSection', 'EducationTopLevel'],
    certifications: [
      'Certifications',
      'CertificationsTopLevel',
      'CertificationTopLevel',
      'LicenseAndCertification',
      'LicensesAndCertifications',
      'SyntheticCertifications',
    ],
    skills: ['Skills', 'SkillsTopLevel'],
    languages: ['Languages', 'LanguagesTopLevel', 'LanguageTopLevel'],
    honors: [
      'Honors',
      'HonorsTopLevel',
      'HonorTopLevel',
      'HonorsAndAwardsTopLevel',
    ],
    publications: [
      'Publications',
      'PublicationsTopLevel',
      'PublicationTopLevel',
      'PublicationTopLevelSection',
      'PublicationsTopLevelSection',
    ],
    featured: ['Featured'],
    services: ['Services'],
    activity: ['Activity'],
    contact: ['ContactInfo'],
  };

  // Heading regex used as a locale-aware fallback when SDUI metadata is
  // missing. English is the canonical key; common Spanish/Portuguese
  // translations are added because the user base of this extension is
  // mostly Latin American.
  ns.SECTION_HEADING = {
    about:
      /^about|acerca de|sobre|resumen|summary|samenvatting|über mich|überblick$/i,
    experience: /^experience|experiencia|experi[eê]ncia$/i,
    education: /^education|educaci[oó]n|formaci[oó]n acad[eé]mica$/i,
    certifications:
      /^licenses? *&* *certifications?|certifications?|licencias y certificaciones|certificados?$/i,
    skills: /^skills|aptitudes|habilidades|compet[eê]ncias$/i,
    languages: /^languages|idiomas$/i,
    honors: /^honors *&* *awards|honors|awards|logros|distinciones|premios$/i,
    publications: /^publications|publicaciones|publica[cç][oõ]es$/i,
  };

  // Resolves the DOM root for a section. Tries (in order):
  //   1) SDUI componentkey (most reliable on the 2026 DOM)
  //   2) On /details/<kind>/: heading-scoped scroll root (before loose match —
  //      loose was matching the wrong section and the first main scaffold
  //      often sits on ads / "More profiles" above the real list)
  //   3) heading regex (legacy + fixtures)
  //   4) Loose componentkey (details pages where kind differs from section)
  //   5) Last-resort first scaffold in main (may still be wrong on live LI)
  //
  // Both signatures are accepted to remain backwards compatible:
  //   getSectionRoot(/about/i)
  //   getSectionRoot('about')
  //   getSectionRoot({ key: 'about', heading: /custom/i })
  ns.getSectionRoot = (arg) => {
    let key, headingRe;
    if (arg instanceof RegExp) {
      headingRe = arg;
    } else if (typeof arg === 'string') {
      key = arg.toLowerCase();
      headingRe = ns.SECTION_HEADING[key];
    } else if (arg && typeof arg === 'object') {
      key = arg.key && arg.key.toLowerCase();
      headingRe = arg.heading || (key && ns.SECTION_HEADING[key]);
    }

    const dedicatedDetails =
      key &&
      ns.isDetailsPage?.() &&
      ns.currentDetailsKind?.() === key;

    // Dedicated /details/certifications/: prefer the SDUI Certification card.
    // Heading-scoped scaffold resolution can match the ad strip above the list
    // (same H2 pattern / scroll wrapper), so collectGenericRows sees one junk row.
    if (
      dedicatedDetails &&
      key === 'certifications' &&
      ns.SECTION_COMPONENTKEY?.certifications
    ) {
      const certSec = ns.getSectionByComponentkey(
        ns.SECTION_COMPONENTKEY.certifications,
      );
      if (certSec) return certSec;
    }

    // Dedicated /details/education/: prefer the SDUI Education card (same
    // rationale as certifications — heading-scoped scroll can sit on promos).
    if (
      dedicatedDetails &&
      key === 'education' &&
      ns.SECTION_COMPONENTKEY?.education
    ) {
      const eduSec = ns.getSectionByComponentkey(
        ns.SECTION_COMPONENTKEY.education,
      );
      if (eduSec) return eduSec;
    }

    // Dedicated /details/experience/: heading-scoped root alone often
    // under-counts vs the full SDUI Experience card. Prefer the subtree
    // with stronger company/position/entity-row signals (same idea as
    // getBestEducationSectionByComponentkey for education).
    if (
      dedicatedDetails &&
      key === 'experience' &&
      ns.SECTION_COMPONENTKEY?.experience &&
      typeof ns.getDetailsSectionRoot === 'function'
    ) {
      const ckSec = ns.getSectionByComponentkey(
        ns.SECTION_COMPONENTKEY.experience,
      );
      const scoped = ns.getDetailsSectionRoot(key);
      const experienceSubtreeScore = (el) => {
        if (!el) return 0;
        return (
          el.querySelectorAll('a[href*="/company/"]').length +
          el.querySelectorAll('a[href*="/positions/"]').length * 2 +
          el.querySelectorAll('[componentkey*="entity-collection-item"]')
            .length
        );
      };
      let best = null;
      if (ckSec && scoped) {
        const sCk = experienceSubtreeScore(ckSec);
        const sSc = experienceSubtreeScore(scoped);
        best = sCk >= sSc ? ckSec : scoped;
      } else {
        best = ckSec || scoped;
      }
      if (best) return best;
    }

    // On the main profile (not /details/...), prefer SDUI componentkey.
    if (!dedicatedDetails && key && ns.SECTION_COMPONENTKEY[key]) {
      if (
        key === 'education' &&
        typeof ns.getBestEducationSectionByComponentkey === 'function'
      ) {
        const eduBest = ns.getBestEducationSectionByComponentkey(
          ns.SECTION_COMPONENTKEY.education,
        );
        if (eduBest) return eduBest;
      }
      const ck = ns.getSectionByComponentkey(ns.SECTION_COMPONENTKEY[key]);
      if (ck) return ck;
    }
    if (ns.isDetailsPage() && key && ns.getDetailsSectionRoot) {
      const scoped = ns.getDetailsSectionRoot(key);
      if (scoped) return scoped;
    }
    if (headingRe) {
      const sec = ns.getSectionByHeading(headingRe);
      if (sec) return sec;
    }
    if (
      key &&
      ns.isDetailsPage() &&
      !dedicatedDetails &&
      ns.getSectionByComponentkeyLoose
    ) {
      const loose = ns.getSectionByComponentkeyLoose(key);
      if (loose) return loose;
    }
    if (dedicatedDetails && ns.getDetailsDenseAnchorRoot) {
      const dense = ns.getDetailsDenseAnchorRoot(key);
      if (dense) return dense;
    }
    if (ns.isDetailsPage()) {
      return (
        document.querySelector('main .scaffold-finite-scroll__content') ||
        document.querySelector('main') ||
        document.body
      );
    }
    return null;
  };

  // ----------------------------------------------------------------
  // Text cleanup
  // ----------------------------------------------------------------
  // Patterns LinkedIn renders next to expandable text. The 2026 DOM
  // uses a positioned <button data-testid="expandable-text-button">
  // overlaying the truncation; the FULL text is always present in the
  // DOM, so extractors only need to drop the trailing artifact.
  ns.SEE_MORE_RE =
    /(?:\u2026|\.{2,3})\s*(?:see more|show more|show all|m[aá]s|mostrar m[aá]s|m[aá]is|ver mais)\s*$/i;

  ns.stripSeeMore = (s) => {
    if (!s) return s;
    return s
      .replace(/\u2026?\s*see more/gi, '')
      .replace(/\u2026?\s*show more/gi, '')
      .replace(/\u2026?\s*show all/gi, '')
      .replace(/\u2026?\s*ver m[aá]s/gi, '')
      .replace(/\u2026?\s*mostrar m[aá]s/gi, '')
      .replace(/\u2026?\s*ver mais/gi, '')
      .replace(/\s*\.{2,3}\s*more\s*$/i, '')
      .trim();
  };

  // Returns the visible text of a section, excluding controls that
  // LinkedIn overlays (truncation buttons, "Show all" actions). Used
  // by About and any other free-text section.
  //
  // IMPORTANT: do NOT use a `[data-testid*="expandable"]` selector
  // because it matches BOTH the truncation control
  // (`expandable-text-button`) AND its parent container
  // (`expandable-text-box`), which holds the full body text. We only
  // strip the inner button.
  ns.sectionVisibleText = (sec) => {
    if (!sec) return '';
    const clone = sec.cloneNode(true);
    clone
      .querySelectorAll(
        '[data-testid="expandable-text-button"], button, [role="button"], svg, script, style',
      )
      .forEach((n) => n.remove());
    return ns.norm(clone.textContent || '');
  };

  // Dates
  ns.parseDates = (meta) => {
    if (!meta) return {};
    const text = ns.norm(meta);
    const mRange = text.match(
      /([A-Za-z]{3,}\s?\d{4})\s*(?:—|-|to)\s*(Present|[A-Za-z]{3,}\s?\d{4})/i,
    );
    const mDur = text.match(/·\s*([\d\s,.]+(?:mos?|yrs?|years?|months?))/i);
    return {
      startDate: mRange ? ns.norm(mRange[1]) : undefined,
      endDate: mRange ? ns.norm(mRange[2]) : undefined,
      duration: mDur ? ns.norm(mDur[1]) : undefined,
    };
  };

  // Header helpers
  ns.cleanLocation = (loc) => {
    const v = ns.norm(loc);
    if (!v) return undefined;
    if (/\bhttps?:\/\//i.test(v) || /\.com\b/i.test(v)) return undefined;
    if (/@/.test(v)) return undefined;
    return v;
  };
  ns.pickImageUrl = (el) => {
    if (!el) return undefined;
    const delayed =
      el.getAttribute('data-delayed-url') || el.getAttribute('data-test-src');
    if (delayed) return delayed;
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      const last = srcset.split(',').pop();
      if (last) {
        const url = last.trim().split(/\s+/)[0];
        if (url) return url;
      }
    }
    return el.getAttribute('src') || el.src || undefined;
  };
  ns.getOgImage = () => {
    const og = document.querySelector('meta[property="og:image"]')?.content;
    const tw = document.querySelector('meta[name="twitter:image"]')?.content;
    return og || tw || undefined;
  };

  // URL helpers
  //
  // LinkedIn is a SPA. After in-app navigation between profiles,
  // `<link rel="canonical">` and `<meta property="og:url">` often remain
  // STALE (pointing at the previously-loaded page, frequently the
  // logged-in user's own profile). Therefore the live URL sources
  // (tabUrl / location.href) MUST be preferred over canonical/og:url.
  ns.extractPublicProfileURL = (tabUrl) => {
    const cand = [
      tabUrl,
      location.href,
      ns.Q("link[rel='canonical']")?.href,
      document.querySelector('meta[property="og:url"]')?.content,
    ].filter(Boolean);
    for (const href of cand) {
      try {
        const u = new URL(href);
        if (/linkedin\.com/i.test(u.hostname) && /\/in\//i.test(u.pathname))
          return u.toString();
      } catch {}
    }
    return undefined;
  };
  ns.computeSlug = (tabUrl) => {
    const sources = [
      tabUrl,
      location.href,
      ns.Q("link[rel='canonical']")?.href,
      document.querySelector('meta[property="og:url"]')?.content,
    ].filter(Boolean);
    for (const href of sources) {
      try {
        const url = new URL(href);
        const m = url.pathname.match(/\/in\/([^\/?#]+)/i);
        if (m && m[1]) return decodeURIComponent(m[1]);
      } catch {}
    }
    return undefined;
  };
  // ----------------------------------------------------------------
  // 2026 SDUI helpers — list-row extraction
  // ----------------------------------------------------------------
  // The new LinkedIn DOM ditched <ul>/<li> in favor of nested <div>s
  // with obfuscated class names. Most multi-item sections have one
  // <a href="..."> per row (Experience -> /company/<id>/, Education ->
  // /school/<id>/ or /edu/<id>/, Certifications/Honors/Publications
  // similarly). Other sections (Skills / Languages) use
  // bare <div>s.
  //
  // For both shapes we expose helpers that:
  //   - return the row anchors (deduplicated, "Show all" filtered)
  //   - return the row's distinct visible text segments (so callers
  //     can map them to fields without depending on class names)

  // Returns an array of distinct visible text segments inside `el`.
  // We collect text from leaf elements only (those with no element
  // children), trim/normalize, and skip duplicates that React renders
  // twice for accessibility (visually-hidden + visible copy).
  ns.collectTextSpans = (el) => {
    if (!el) return [];
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.currentNode;
    do {
      if (!node || node === el) {
        node = walker.nextNode();
        continue;
      }
      // Skip nodes that have element children — we only want leaf
      // elements so each text segment shows up exactly once.
      if (node.children && node.children.length > 0) {
        node = walker.nextNode();
        continue;
      }
      // Skip non-textual leaves.
      const tag = node.tagName;
      if (
        tag === 'IMG' ||
        tag === 'SVG' ||
        tag === 'BUTTON' ||
        tag === 'INPUT'
      ) {
        node = walker.nextNode();
        continue;
      }
      const txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt) {
        node = walker.nextNode();
        continue;
      }
      // LinkedIn often duplicates text for screen-readers
      // ("Founder Founder" pattern). Dedupe consecutive identical
      // strings; the surrounding prose dedupe in extractors handles
      // residual cases.
      const key = txt;
      if (out.length && out[out.length - 1] === key) {
        node = walker.nextNode();
        continue;
      }
      if (seen.has(key) && !/^\d|present|month|year|yr|mo\b/i.test(key)) {
        node = walker.nextNode();
        continue;
      }
      seen.add(key);
      out.push(key);
      node = walker.nextNode();
    } while (node);
    return out;
  };

  // Returns deduplicated row anchors inside `sec` whose href matches
  // any of the given regexes. The first empty-text anchor (typically
  // the entity logo) and the trailing "Show all" anchor are filtered
  // out.
  ns.collectRowAnchors = (sec, hrefRegexes) => {
    if (!sec) return [];
    const list = Array.isArray(hrefRegexes) ? hrefRegexes : [hrefRegexes];
    const anchors = Array.from(sec.querySelectorAll('a[href]')).filter((a) => {
      const href = a.getAttribute('href') || '';
      if (!list.some((re) => re.test(href))) return false;
      let text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        // Logo-only <a>: climb to a row-sized ancestor for visible copy.
        let p = a.parentElement;
        for (let d = 0; d < 8 && p && p !== sec; d++, p = p.parentElement) {
          const pt = (p.innerText || '').replace(/\s+/g, ' ').trim();
          if (pt.length >= 24) {
            text = pt.slice(0, 120);
            break;
          }
        }
      }
      if (!text) return false;
      if (/^show all\b/i.test(text)) return false;
      return true;
    });
    // Dedupe by (href + first 60 chars of text). LinkedIn sometimes
    // wraps the same row in multiple anchors; we want one per role.
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const text = (a.innerText || a.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      const key = href.split('?')[0] + '|' + text;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  };

  // Returns the rows wrapper inside an SDUI section. The rows live in
  // the last large sibling div after the H2 header; this helper walks
  // a few levels to find it. Falls back to the section itself.
  ns.getRowsContainer = (sec) => {
    if (!sec) return null;
    // /details/<section>/ SDUI often lists rows inside the finite-scroll
    // wrapper with no h2 inside the same subtree (title is a <p>).
    const scroll =
      sec.querySelector(
        '.scaffold-finite-scroll__content, [class*="finite-scroll__content"]',
      ) || null;
    if (scroll) {
      const divKids = Array.from(scroll.children).filter(
        (c) => c.tagName === 'DIV' && (c.innerText || c.textContent || '').trim(),
      );
      if (divKids.length >= 1) return scroll;
    }
    const h2 = sec.querySelector('h2');
    if (!h2) return sec;
    // Walk up from H2 until we find a parent whose next sibling is a
    // div with multiple children — that is the rows wrapper.
    let cur = h2;
    while (cur && cur !== sec) {
      const sib = cur.nextElementSibling;
      if (sib && sib.tagName === 'DIV' && sib.children.length >= 1) return sib;
      cur = cur.parentElement;
    }
    return sec;
  };

  // Returns "row" divs inside a section that does NOT use anchors per
  // row (Skills / Languages / Honors / Publications, etc.).
  //
  // LinkedIn 2026 wraps rows differently per section. Sometimes the
  // rowsContainer's direct children are the rows; sometimes there is
  // an extra wrapper div. We descend through any single-child divs
  // until we find a level whose div children look like a list of
  // siblings (>= 2 non-empty divs), or we run out of nesting.
  ns.collectGenericRows = (sec) => {
    if (!sec) return [];
    let container = ns.getRowsContainer(sec);
    if (!container) return [];

    // JSDOM (and some headless contexts) omit innerText; textContent is
    // a reliable fallback for row emptiness checks.
    const rowPlain = (el) =>
      (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

    // Helper: count non-empty <div> children of a node.
    const countDivKids = (el) =>
      Array.from(el.children).filter(
        (c) => c.tagName === 'DIV' && rowPlain(c),
      ).length;

    // Descend through single-child wrapper divs until we hit a node
    // with multiple <div> children. Hard cap on depth to avoid runaway.
    let depth = 0;
    while (depth < 6 && countDivKids(container) <= 1) {
      const onlyChild = Array.from(container.children).find(
        (c) => c.tagName === 'DIV' && rowPlain(c),
      );
      if (!onlyChild) break;
      container = onlyChild;
      depth++;
    }

    // Now collect the direct DIV children that look like rows.
    let rows = Array.from(container.children).filter((c) => {
      if (c.tagName !== 'DIV') return false;
      const t = rowPlain(c);
      if (!t) return false;
      if (/^show all\b/i.test(t)) return false;
      return true;
    });

    // If we still ended up with just one big row, drop into its
    // inside one more time — LinkedIn sometimes wraps each item in a
    // pair of divs (separator + content).
    if (rows.length === 1) {
      const inner = rows[0];
      const innerRows = Array.from(inner.children).filter(
        (c) => c.tagName === 'DIV' && rowPlain(c),
      );
      if (innerRows.length >= 2) rows = innerRows;
    }

    // <ul>/<ol> list rows (common on Licenses & certifications, Skills,
    // Languages). Previously we returned [] here so Experience could fall
    // back to anchor-based parsing; other extractors need the <li> nodes.
    if (!rows.length && rowPlain(container)) {
      if (container.querySelector('ul li, ol li')) {
        const listItemsFrom = (listEl) =>
          Array.from(listEl.children).filter(
            (c) => c.tagName === 'LI' && rowPlain(c),
          );
        const pickListRows = (root) => {
          for (const listTag of ['UL', 'OL']) {
            for (const el of root.children) {
              if (el.tagName !== listTag) continue;
              const lis = listItemsFrom(el);
              if (lis.length) return lis;
            }
          }
          for (const wrap of root.children) {
            if (wrap.tagName !== 'DIV') continue;
            for (const listTag of ['UL', 'OL']) {
              for (const el of wrap.children) {
                if (el.tagName !== listTag) continue;
                const lis = listItemsFrom(el);
                if (lis.length) return lis;
              }
            }
          }
          return null;
        };
        const lis = pickListRows(container);
        if (lis && lis.length) return lis;
        return rows;
      }
      const hasRowLikeDivChild = Array.from(container.children).some(
        (c) => c.tagName === 'DIV' && rowPlain(c),
      );
      if (!hasRowLikeDivChild) return [container];
    }

    return rows;
  };

  // Parse a row's text spans into a structured shape. Used by
  // Experience / Education / Certifications etc. The returned shape
  // is intentionally flexible so each extractor can pick what it
  // needs.
  //
  // Heuristics applied in order:
  //   spans[0]   -> primary title (role / school / cert name)
  //   spans[1]   -> secondary entity (company / degree / issuer)
  //   first span matching a date range -> dates
  //   span starting with "Issued"      -> issuedDate
  //   span containing only digits + units (yr / mo / yrs)  -> duration
  //   any "Credential ID ..."           -> credentialId
  //   the rest                           -> description fragments
  ns.parseRowSpans = (spans) => {
    const out = { spans };
    if (!spans || !spans.length) return out;

    const dateRangeRe =
      /\b(\w{3,9}\s+\d{4}|\d{4})\s*[-–]\s*(\w{3,9}\s+\d{4}|\d{4}|present)\b/i;
    const issuedRe = /^issued\s+(.+)$/i;
    const expiresRe = /(?:expires?|expired)\s+(.+)$/i;
    const credentialRe = /^credential\s+id\s*[:\s]\s*(.+)$/i;
    const durationRe =
      /^(?:[<·•]\s*)?\d+\s*(?:yr|yrs|year|years|mo|mos|month|months)\b.*/i;

    const consumed = new Set();

    // Title / secondary entity
    out.title = spans[0];
    if (
      spans.length > 1 &&
      !dateRangeRe.test(spans[1]) &&
      !issuedRe.test(spans[1])
    ) {
      out.secondary = spans[1];
      consumed.add(0);
      consumed.add(1);
    } else {
      consumed.add(0);
    }

    for (let i = 0; i < spans.length; i++) {
      if (consumed.has(i)) continue;
      const s = spans[i];
      const dr = s.match(dateRangeRe);
      if (dr && !out.startDate) {
        out.startDate = dr[1];
        out.endDate = dr[2];
        consumed.add(i);
        continue;
      }
      const iss = s.match(issuedRe);
      if (iss && !out.issued) {
        out.issued = iss[1];
        consumed.add(i);
        continue;
      }
      const exp = s.match(expiresRe);
      if (exp && !out.expires) {
        out.expires = exp[1];
        consumed.add(i);
        continue;
      }
      const cred = s.match(credentialRe);
      if (cred && !out.credentialId) {
        out.credentialId = cred[1];
        consumed.add(i);
        continue;
      }
      if (durationRe.test(s) && !out.duration) {
        out.duration = s.replace(/^[·•\s]+/, '');
        consumed.add(i);
        continue;
      }
    }

    out.extras = spans.filter((_, i) => !consumed.has(i));
    return out;
  };
})(window);
