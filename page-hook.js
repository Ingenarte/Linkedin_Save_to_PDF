// page-hook.js - runs in the PAGE world
(function () {
  if (!window.linkedin_ats_test) {
    window.linkedin_ats_test = function () {
      try {
        console.debug('[lnp] page: linkedin_ats_test() -> __LNP_EXTRACT_REQ');
        window.postMessage({ type: '__LNP_EXTRACT_REQ' }, '*');
      } catch (err) {
        console.error('[lnp] page: linkedin_ats_test() error', err);
      }
    };
  }

  if (!window.linkedin_ats_test_direct) {
    window.linkedin_ats_test_direct = async function () {
      try {
        const hasDirect = typeof window.__LNP_extractAll === 'function';
        if (hasDirect) {
          const data = await window.__LNP_extractAll({ tabUrl: location.href });
          window.postMessage({ type: '__LNP_EXTRACT_RES', payload: data }, '*');
          console.debug('[lnp] page: direct extract ok');
        } else {
          console.debug(
            '[lnp] page: no direct extract, falling back to bridge'
          );
          window.postMessage({ type: '__LNP_EXTRACT_REQ' }, '*');
        }
      } catch (err) {
        console.error('[lnp] page: linkedin_ats_test_direct() error', err);
        window.postMessage({ type: '__LNP_EXTRACT_REQ' }, '*');
      }
    };
  }

  console.debug(
    '[lnp] page hooks installed (linkedin_ats_test, linkedin_ats_test_direct)'
  );
})();
