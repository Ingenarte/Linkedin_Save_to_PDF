// bridge.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});

  // Page hook injection (same behavior as before)
  ns.injectPageHook = function injectPageHook() {
    try {
      if (window.__lnp_page_api_installed__) return;
      const url = chrome.runtime.getURL('page-hook.js');
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => s.remove();
      (document.documentElement || document.head).appendChild(s);
      window.__lnp_page_api_installed__ = true;
      console.debug('[lnp] content: injected page-hook.js');
    } catch (err) {
      console.error('[lnp] content: injecting page-hook.js failed', err);
    }
  };

  // Expose test helper on page console (unchanged semantics)
  ns.installLinkedinTest = function installLinkedinTest() {
    window.linkedin_ats_test = function () {
      try {
        console.log('[lnp] Running linkedin_ats_test()...');
        window.postMessage({ type: '__LNP_EXTRACT_REQ' }, '*');
      } catch (err) {
        console.error('[lnp] linkedin_ats_test error', err);
      }
    };
  };

  // Window bridge listener
  ns.installWindowBridge = function installWindowBridge(extractAll) {
    window.addEventListener('message', async (e) => {
      if (e.source !== window) return;
      if (e.data?.type !== '__LNP_EXTRACT_REQ') return;
      try {
        const data = await extractAll({ tabUrl: location.href });
        window.postMessage({ type: '__LNP_EXTRACT_RES', payload: data }, '*');
        if (typeof ns.LNP_printTable === 'function') ns.LNP_printTable(data);
      } catch (err) {
        console.error('extract error', err);
      }
    });
  };
})();
