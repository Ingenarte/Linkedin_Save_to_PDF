# Changelog

All notable changes to this extension will be documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

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
