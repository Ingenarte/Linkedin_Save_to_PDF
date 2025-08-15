(function (ns) {
  ns.runATSExtraction = function () {
    console.log('[lnp] Running linkedin_ats_test()...');
    window.postMessage({ type: '__LNP_EXTRACT_REQ' }, '*');
  };
})(window.__LNP_NS__);
