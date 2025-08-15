// page-hook.js — runs in the PAGE context (not the content-script isolated world)
(function () {
  try {
    // Expose linkedin_ats_test(): triggers your message bridge
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

    // Expose linkedin_ats_test_direct(): try direct call, else fallback to bridge
    if (!window.linkedin_ats_test) {
      window.linkedin_ats_test = async function () {
        try {
          const hasDirect = typeof window.__LNP_extractAll === 'function';
          if (hasDirect) {
            const data = await window.__LNP_extractAll({
              tabUrl: location.href,
            });
            // Mirror the bridge behavior so console output looks the same
            window.postMessage(
              { type: '__LNP_EXTRACT_RES', payload: data },
              '*'
            );
            if (typeof window.LNP_printTable === 'function') {
              window.LNP_printTable(data);
            } else {
              console.table({
                name: !!data.name,
                headline: !!data.headline,
                location: !!data.location,
                slug: !!data.slug,
                contact: !!data.contact,
                profileImage: !!data.profileImage,
              });
              console.log('profileImage:', data.profileImage);
            }
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
      '[lnp] page hook installed: linkedin_ats_test(), linkedin_ats_test_direct()'
    );
  } catch (e) {
    console.error('[lnp] page hook install failed', e);
  }
})();
