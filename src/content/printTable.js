// printTable.js
(function () {
  const ns = (window.__lnp = window.__lnp || {});
  ns.LNP_printTable = function LNP_printTable(data) {
    const d = data || {};

    const summary = {
      name: !!d.name,
      headline: !!d.headline,
      location: !!d.location,
      slug: !!d.slug,
      contact: !!d.contact,
      profileImage: !!d.profileImage,
      about_len: d.about?.length || 0,
      experiences: d.experiences?.length || 0,
      education: d.education?.length || 0,
      certifications: d.certifications?.length || 0,
      skills: d.skills?.length || 0,
      publications: d.publications?.length || 0,
      languages: d.languages?.length || 0,
      honors: d.honors?.length || 0,
      interests: d.interests?.length || 0,
    };

    console.log('LINKEDIN ATS TO PDF: EXTRACTED DATA');
    console.table(summary);

    if (d.profileImage && typeof d.profileImage === 'string') {
      console.log('profileImage URL:', d.profileImage.trim());
    }

    const FOCUS_FIELDS = [
      'location',
      'certifications',
      'languages',
      'honors',
      'publications',
    ];
    const fields = Object.fromEntries(FOCUS_FIELDS.map((k) => [k, d[k]]));
    const missing = Object.entries(fields).filter(
      ([_, v]) =>
        v == null ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'string' && v.trim() === '')
    );
    if (missing.length) {
      console.group('%cMISSING (focus fields)', 'font-weight:bold; color:#c00');
      console.table(
        missing.map(([k, v]) => ({
          field: k,
          valueType: Array.isArray(v) ? 'array' : typeof v,
          valuePreview: Array.isArray(v) ? v.length : v ?? null,
        }))
      );
      console.groupEnd();
    }
  };
})();
