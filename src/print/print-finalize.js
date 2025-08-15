// Final pass: remove global duplicate phrases and print
(function () {
  function finalGlobalPhraseDedup(root) {
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toRemove = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (parent && parent.closest('a')) continue;

      const raw = node.nodeValue || '';
      if (!raw.trim()) continue;

      const parts = raw
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (!parts.length) continue;

      const kept = [];
      for (const p of parts) {
        const key = p.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!key) continue;
        if (!seen.has(key)) {
          seen.add(key);
          kept.push(p);
        }
      }

      if (kept.length === 0) {
        toRemove.push(node);
      } else if (kept.join(' ') !== raw.trim()) {
        node.nodeValue = kept.join(' ');
      }
    }

    toRemove.forEach((n) => n.parentNode && n.parentNode.removeChild(n));

    Array.from(root.querySelectorAll('p, div, li')).forEach((el) => {
      if (!el.textContent || el.textContent.replace(/\s+/g, '').length === 0) {
        el.remove();
      }
    });
  }

  window.__PRINT_FINALIZE__ = { finalGlobalPhraseDedup };
})();
