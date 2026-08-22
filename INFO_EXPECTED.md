# Expected export content (design checklist)

**Purpose:** Maintainer and QA reference for what the extension is **designed** to put into the print/PDF view when extraction succeeds. This is not a guarantee that every field appears for every profile (LinkedIn DOM, locale, privacy, and extractor limits vary).

**Settings:** User toggles are stored in `chrome.storage.sync` under `lnp_settings_v1`. Defaults match `DEFAULT_SETTINGS` in `src/popup/popup.js` and `DEFAULT_EXPORT_SETTINGS` in `src/background.js` (export keys only; `darkMode` is popup UI-only).

**Code references:** `src/print/print-main.js` (gating), `src/print/print-render-header.js`, `src/print/print-render-sections.js`, `src/content/content.js` (`extractAll`), `src/background.js` (deep orchestration).

---

## 1. Single-page export (“Export 1 page”)

Single-page flow runs one full `EXTRACT_PROFILE` on the active profile tab, then opens the print view with that payload. Below: when each toggle is **enabled**, the print pipeline **intends** to render the listed items (if present in the extracted payload).

**Always appended (not toggle-gated):** A footer with author and repository links (`print-main.js`).

1. **`profileHeader` — Profile Header (name, headline, location, export date)**  
   - Display name as heading; link to public profile URL when `contact.publicProfile` or derivable slug exists.  
   - Headline line when `headline` is non-empty.  
   - Meta line: location (if any), public path link `/in/{slug}` (if slug present), and `Exported: …` (local datetime) when `lastUpdatedISO` is set.  
   - *Gating note:* Header is shown when `settings.profileHeader !== false` (default-on even if the key is missing).

2. **`withPhoto` — Include profile photo**  
   - Only when **both** this toggle is on **and** `profileImage` URL exists after extraction: a fixed-size profile image in the header block (`print-render-header.js`).

3. **`contact` — Contact**  
   - Section title “Contact”.  
   - Public profile link (from tab-derived URL), when `contact.publicProfile` is set.  
   - Email line (`mailto` target text) when `contact.email` is set.  
   - Bullet list of external website URLs (up to what extraction collected), each as a link (`print-render-sections.js` / `content.js` enrichment).

4. **`about` — Summary (About)**  
   - Section title “Summary”.  
   - Full about text as a paragraph when `about` is non-empty.

5. **`experience` — Experience**  
   - Section title “Experience”.  
   - Per role (only rows with printable text after assembly): job title; meta line combining date range, optional duration, optional location; optional description paragraph; optional bullet list (`print-render-sections.js`).

6. **`education` — Education**  
   - Section title “Education”.  
   - Per school: school name; meta line with degree (if any) and date range; only rows with non-empty printable text.

7. **`projects` — Projects**  
   - Section title “Projects”.  
   - Per item: title and associated organization line; optional date meta line; optional external URL link; optional description paragraph.

8. **`certifications` — Certifications**  
   - Section title “Certifications”.  
   - Per row: combined name and issuer line; optional “Issued …” meta line when an issue date exists.  
   - If rows exist but none produce printable text, a fallback explanatory sentence is shown.

9. **`skills` — Top Skills**  
   - Section title “Top Skills”.  
   - Bulleted list of skill strings when `skills` array is non-empty.

10. **`languages` — Languages**  
    - Section title “Languages”.  
    - Per entry: language name and optional proficiency line.

11. **`honors` — Honors & Awards**  
    - Section title “Honors & Awards”.  
    - Per item: title and issuer combined line; optional date meta line.

12. **`publications` — Publications**  
    - Section title “Publications”.  
    - Per item: title and source combined line; optional date; optional description paragraph.

---

## 2. Deep export (“Full profile” / deep)

Deep export still ends in the **same** print pipeline as single-page (`openPrintView` → `print-main.js` with merged `data` + `settings`). Expectations below describe **what deep mode adds or changes** relative to using only the main profile tab.

### 2.1 Pipeline (high level)

- **Base:** The background script requests `EXTRACT_PROFILE` on the **original** profile tab (`content.js` `extractAll`) — same payload shape as single-page, including expand/scroll behavior for that tab.  
- **Deep passes:** For each section name returned by `plannedDeepSections(settings)` in **fixed order** — `experience` → `education` → `projects` → `certifications` → `skills` → `languages` → `honors` → `publications` — the service worker opens the matching LinkedIn `/details/<slug>/` URL (see `DEEP_SECTION_SLUGS` in `src/background.js`), runs `EXTRACT_SECTION` with a time budget for scroll/expand, then merges the result into the working payload when merge rules say the deep slice is at least as good as the base slice (`shouldApplyDeepMerge`, except languages — see below).  
- **Print:** The merged object is stored and passed to `print.html`; toggles in Section 1 still **gate** which sections render.

### 2.2 Per deep-capable toggle (when ON)

*Intent:* richer or equally long list data than the main card alone, because the dedicated detail layout often exposes full virtualized lists and fuller row text.

1. **`experience`** — Deep may replace `experiences` when the `/details/experience/` extract is merged in; expect **more roles and/or fuller fields** (title, dates, duration, location, description, bullets) than a truncated main-profile list.  
2. **`education`** — Same idea for `education` via `/details/education/`.  
3. **`projects`** — Same idea for `projects` via `/details/projects/`.  
4. **`certifications`** — Same for `certifications` via `/details/certifications/`.  
5. **`skills`** — Same for `skills` via `/details/skills/`.  
6. **`languages`** — **Special case:** Base and deep language arrays are **union-merged** by normalized language key (`mergeLanguageLists`); deep can add or fill proficiency without dropping base-only rows when the merge grows the combined list.  
7. **`honors`** — Same replacement/merge pattern as other array sections via `/details/honors/`.  
8. **`publications`** — Same via `/details/publications/`.

### 2.3 Toggles with no dedicated deep tab

The orchestrator does **not** open `/details/` URLs for: **`profileHeader`**, **`withPhoto`**, **`contact`**, or **`about`**. For those, deep export expectations match **single-page**: whatever `EXTRACT_PROFILE` captured on the main tab, still subject to the same print toggles.

### 2.4 Non-goals

Missing rows, empty sections, or layout quirks on specific LinkedIn builds are **out of scope** for this document; treat failures as bugs or extractor gaps against the intent above, not as violations of a legal spec.

---

## Verification checklist (doc vs code)

| Item | Source |
|------|--------|
| Twelve export section toggles + footer note | `src/popup/popup.html`, `print-main.js` |
| Header default-on | `settings.profileHeader !== false` in `print-main.js` |
| Eight deep slugs and merge order | `DEEP_SECTION_SLUGS`, `plannedDeepSections` in `src/background.js` |
| Languages union merge | `mergeLanguageLists` in `src/background.js` |
