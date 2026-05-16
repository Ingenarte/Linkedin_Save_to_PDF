# Changelog

All notable changes to this extension will be documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.5] — 2026-05-16

### Fixed

- **Top Skills: "99+ endorsements" leaked as a skill.** The endorsement-count
  noise filter (`^\d+\s+endorsements?$`) did not match "99+ endorsements"
  (the `+`). Allow an optional `+` so "5 endorsements" / "99+ endorsements" /
  "1 endorsement" are all dropped (seen on reidhoffman deep).

## [1.2.4] — 2026-05-16

### Fixed

- **Deep Certifications could drop a cert when the /details/ extract flakily
  truncated.** 1.2.3 made the deep cert list always win over the base; on a
  throttled background tab (e.g. Linode) the deep extract sometimes returned
  fewer certs and clobbered a valid base (paul-dc lost "First Certificate in
  English — Cambridge": Linode deep 1 vs Local deep 2). Certifications now use
  the same rule as skills — keep whichever of base vs deep is LONGER. The
  section-title junk row is already filtered from every path, so the base
  count is valid; a richer deep (Luca GMAT+FCE, Franco Odoo+JSConf, Martin 3)
  still wins, but a shorter flaky deep can no longer remove real certs.

## [1.2.3] — 2026-05-16

### Fixed

- **Languages: LinkedIn ad report/feedback text leak.** When a profile had
  0–1 languages, an ad block inside the `/details/languages/` area leaked
  *"I've seen the same ad too often / …Professional Community Policies…"*
  into the Languages section. Added those report/feedback phrases to the
  central ad filter, and hardened `looksLikeProficiencyLine` (a long sentence
  merely containing "professional" is no longer treated as a proficiency).
- **Deep Certifications incomplete on 2026 `/details/certifications/`.** The
  company-logo walker missed certs whose issuer has no LinkedIn `/company/`
  page (GMAC, Cambridge, JSConf EU). Added a per-entry walker that seeds one
  cert per "Issued {Mon Year}" line (anchor-independent, reliable), filtered
  the section title ("Licenses & certifications") that was mis-captured as a
  cert row and tied the good list on length, and made the dedicated details
  page prefer the per-entry list (then company-logo, then generic). The deep
  `/details/` extract is now authoritative for certs (the main-profile
  preview base is unreliable). Result: Luca GMAT+FCE, Franco Odoo+JSConf,
  Martin CISM+NSE3+ISO all captured.
- **Deep Top Skills truncated to the 2-row preview / flaky.** `skills` deep
  timing was far too short (3600/250) so a background tab kept only the
  main-profile preview; bumped to the full-list budget (9000/1800) and added
  `skills`/`certifications` to the active-tab re-extract set (Chromium
  throttles background-tab layout, so virtualized rows never hydrated). Skills
  merge now keeps the longer of base vs deep so a flaky short extract can no
  longer clobber the full list. Added an `<hr>`-delimited list-container
  walker for `/details/skills/` and excluded the category tabs
  ("Tools & Technologies", "Other Skills", …) and next-section bleed.

## [1.2.2] — 2026-05-16

### Fixed

- **Deep Education capture on the 2026 `/details/education/` SDUI layout.**
  The new layout has no `entity-collection-item` wrappers and puts each line
  in `span[aria-hidden="true"]` instead of `<p>`, and entries are sibling
  block `<div>`s separated by `<hr>`. The school-anchor walker also de-duped
  by school URL, dropping every extra degree at the same school. Result: deep
  export only kept a collapsed list (one row per school, no degree, no dates).
  Now: a new list-container walker reads every entry block (including schools
  with no LinkedIn page, e.g. a high school), and the anchor walker no longer
  de-dupes by school — so multiple degrees per school (BSc+MSc, 1st+2nd level
  diploma) and the high-school entry, with date ranges, are all captured.
- Education/Certifications deep timing widened for slower headless Chromium
  (e.g. Linode Xvfb) so virtualized rows hydrate before extraction.

## [1.2.0] — 2026-05-09

### Removed

- **Interests section** end-to-end: no popup toggle, no `extractInterests`
  content script, no print block, and no `/details/interests/` deep pass.
  LinkedIn SDUI "Interests" card is not part of the export surface anymore.

## [1.1.0] — 2026-05-01

### Added

- **Deep-export orchestrator** in the background service worker. It visits
  `/details/<section>/` sub-pages serially with throttling after explicit
  user confirmation.
- **`scripting` permission** with guarded re-injection of the manifest
  content-script bundle when `PING_LNP` fails (e.g. tab opened before
  install/update), so Export can recover without a manual reload in
  many cases.
- **Stable `componentkey` selectors.** Sections are now located by SDUI
  identifier first (`Topcard`, `About`, `Experience`, `Education`,
  `Skills`, `Languages`, `Certifications`, `Honors`, `Publications`),
  with locale-aware heading regex and the legacy
  `id="*-section"` shape kept as fallbacks for older snapshots.
- **Dark mode toggle** in the popup Settings tab. Persisted in
  `chrome.storage.sync` so the preference roams with the profile.
  Print/PDF output stays light to keep recruiter-friendly defaults.
- **Version + author panel** in the popup Info tab. The version is
  read live from `chrome.runtime.getManifest()` so it always matches
  the deployed bundle.
- **`COMPLIANCE.md`** documenting the project's stance against the
  LinkedIn User Agreement and the Chrome Web Store Developer Program
  Policies. See the file for the full review.

### Changed

- **Popup** clearer status when the active tab is not a LinkedIn profile
  or when the content script is missing; shared copy with the export
  error path. Short hint under Export explains 1-page vs Full Profile export.
- **Profile extraction** updated for LinkedIn's 2026 redesign, including
  SDUI top-card support, improved About extraction, headline/location
  recovery, and profile photo isolation from the logged-in user's nav
  avatar.

### Removed

- The post-install `chrome.notifications.create()` call. The
  `notifications` permission was never declared, so the call was a
  silent no-op; removing it shrinks the permission story we present
  to the Chrome Web Store reviewer.
- Dev-only page-world console hooks and local testing artifacts were
  removed from the release candidate.
- Hidden console export actions, debug table helpers, and the print
  image `fetch()` fallback were removed to keep the Chrome Web Store
  privacy story aligned with runtime behavior.

### Fixed

- **Content script** listeners are idempotent so programmatic re-inject
  does not stack duplicate `onMessage` handlers.

### Internal

- `getSectionRoot` now accepts either a regex (legacy), a string key
  (new) or `{ key, heading }` (mixed). All section extractors were
  migrated to the mixed form.
- New `sectionVisibleText(sec)` helper clones a section, removes
  control nodes (buttons, role=button, svg, script, style, the
  expandable-text-button overlay) and returns normalized text. Used
  by the About extractor and reusable for any free-text section.
- `stripSeeMore` accepts the eight locale variants we have observed
  (`see more`, `show more`, `show all`, English/Spanish/Portuguese
  variants, `… more`).

## [1.0.2] — 2024

- Initial public release on the Chrome Web Store.
