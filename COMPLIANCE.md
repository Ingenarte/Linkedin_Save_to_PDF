# Compliance review

> **Audience.** Chrome Web Store reviewers, LinkedIn legal/operations,
> and security-conscious end users.
>
> **Scope.** Version 1.3.0 of `LinkedIn Save to PDF (Ingenarte)`
> (Manifest V3, MV3). This document explains why each design choice
> stays within the LinkedIn User Agreement and the Chrome Web Store
> Developer Program Policies.

---

## 1. What the extension does

It exposes a single, user-initiated action: **"Export to PDF"** in the
extension popup. When the user clicks it on a LinkedIn profile they
are already viewing:

1. The content script reads the **already-rendered DOM** of the active
   tab — the same data the user sees on screen.
2. The data is **structured** (name, headline, location, About,
   Experience, Education, Skills, …) so it can be laid out in a
   recruiter-friendly print template.
3. The result is opened in a local print preview page bundled with the
   extension (`src/print/print.html`). The user prints to PDF using
   Chrome's native dialog. Nothing leaves the device.

There is no background polling, no off-LinkedIn navigation, no
analytics, no telemetry, no third-party SDK, and no programmatic
`fetch()` or `XMLHttpRequest` data collection.

## 2. Single purpose (Chrome Web Store §1)

The extension's single purpose is "save the LinkedIn profile I am
currently viewing as a printable PDF". Every code path serves that
purpose:

| Code path                              | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `src/content/*.js`                     | Reads DOM of the active LinkedIn profile.        |
| `src/print/*`                          | Renders the structured data as a print page.     |
| `src/popup/*`                          | UI for which sections to include, dark mode, version. |
| `src/background.js` (deep export)      | Visits `/details/<section>/` of the same profile to recover entries truncated on the main page. |

There is no functionality unrelated to the single purpose.

## 3. LinkedIn User Agreement

LinkedIn's User Agreement (§8 — "Don'ts") prohibits automated scraping
and bulk data collection. We addressed each restriction directly:

### 3.1 "Don't scrape or copy data without authorization"

The extension only reads DOM content that **the authenticated user has
already chosen to load** in their browser, by visiting a profile.
LinkedIn rendered that content in response to the user's own request;
the extension performs no additional data fetching beyond that.

The reorganization of the user's *own* visible data — for personal
record keeping, CV creation, archival print — is the kind of personal
copy that web browsers and reader-mode extensions have always
performed. Comparable extensions (Pocket, Reader Mode, Print Friendly,
etc.) operate on the same legal basis.

### 3.2 "Don't use bots, scrapers or other automated means"

There is **no automation that the user did not initiate**:

- The popup action requires a click. Browsers count this as a user
  activation gesture.
- After the click, no further extension code runs unless the user
  clicks again.
- The extension does not poll, does not run on a schedule, does not
  open profiles other than the one the user is on.

### 3.3 "Don't access LinkedIn programmatically (other than through the API)"

The extension does NOT call any LinkedIn HTTP endpoint programmatically.
It only reads the DOM that LinkedIn already rendered into the user's tab.
No `fetch()`, no `XMLHttpRequest`, no `chrome.webRequest`. The DOM
contents are LinkedIn's response to a normal browser navigation that
the user themselves performed. If the user includes the profile photo,
the print page renders the image URL already present in that DOM as a
normal browser image resource.

### 3.4 Deep export

When the user confirms Full Profile export, the background service
worker opens the same profile's
`/details/<section>/` sub-pages, **one at a time**, throttled to
~1.2 s between tabs, with a hard timeout per tab. This mirrors what a
human user would do when clicking through "Show all" links. The
throttling is enforced in `src/background.js` (`INTER_TAB_THROTTLE_MS`,
`TAB_LOAD_TIMEOUT_MS`, `PING_RETRY_COUNT`).

Constraints baked into the orchestrator (`src/background.js`, lines
1–22):

- **User-initiated only.** Triggered exclusively by an explicit popup
  click that already classifies as user activation.
- **Same-profile only.** Sub-page URLs are derived from the slug of
  the active tab; the orchestrator never crawls other profiles.
- **Serial fetch with throttle.** No parallel tab creation, no bursty
  network patterns.
- **Hard bounded.** Per-tab timeout (15 s) + global tab limit (≤ 7
  sub-pages, one per supported section).
- **Local only.** Output is written to `chrome.storage.local` under a
  short-lived nonce and cleared by the print view.

If LinkedIn finds even this opt-in flow undesirable, users can disable
it from Settings; the classic single-page flow remains fully
functional.

## 4. Chrome Web Store Developer Program Policies

### 4.1 Permissions (least privilege)

| Permission                        | Justification                                                                |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `storage`                         | Persist user settings (sections to include, dark mode) in `chrome.storage.sync`; pass extracted data and bounded deep-export job status to the print page via short-lived `chrome.storage.local` keys. |
| `activeTab`                       | Read the DOM of the LinkedIn tab the user is currently on, only after the user interacts with the popup. |
| `scripting`                       | On explicit **Export to PDF** from the popup, may re-inject the same manifest-declared content-script files into the active LinkedIn tab when `PING_LNP` fails, such as when the tab was opened before install or update. Same isolated-world code as static injection; no arbitrary remote code. |
| `tabs`                            | Create, observe, activate, and close the user-initiated deep-export detail tabs; restore focus to the original profile tab; and validate that created tabs remain on the expected same-profile LinkedIn detail URLs. |
| `host_permissions: linkedin.com/*`| Required for the content script to attach to LinkedIn profile pages and for the deep-export orchestrator to read sub-page URLs of the same profile. |

We deliberately do NOT request:

- `webRequest` (network interception).
- `notifications` (a previously no-op call was removed before this release).
- `cookies`, `<all_urls>`, `clipboardWrite`, etc.

### 4.2 User data handling (Limited Use, no remote code)

- **No remote code.** All JavaScript ships inside the extension
  package. The release package does not inject page-world testing hooks
  or load JavaScript from remote origins.
- **No data leaves the device.** There is no programmatic data upload
  to any origin we control or to any third-party. Data flows are:
  `LinkedIn DOM → content script → background SW → chrome.storage.local
  → print page → Chrome PDF dialog → user's filesystem`.
- **Short-lived storage.** The nonce key written to
  `chrome.storage.local` is consumed and removed by the print page.
  No persistent profile data is retained.
- **Settings only.** `chrome.storage.sync` stores a single object
  (`lnp_settings_v1`) of user-toggle booleans. No PII.

### 4.3 Deceptive behavior

- The popup advertises the same single purpose stated above.
- Listings and screenshots show the same export flow that ships.
- No bait-and-switch updates: every release lists its changes in
  `CHANGELOG.md`.

### 4.4 Spam and placement (§4)

- The extension does not auto-open new tabs except as part of the
  user-initiated deep export, and those tabs are immediately closed.
- It does not modify or inject content into any other site.

## 5. Privacy disclosure

`PRIVACY.md` and `PRIVACY.html` are bundled with the extension and
linked from the Chrome Web Store listing. They restate the "no remote
code, no data leaves the device" guarantee. Version 1.3.0 makes no
changes to the data we collect (zero) or the data we transmit (zero).

## 6. Code transparency

The full source — including this compliance document — lives at
<https://github.com/Ingenarte/Linkedin_Save_to_PDF>. Every release tag
on GitHub matches the Chrome Web Store package, so reviewers can
diff one against the other.

The repository is kept release-focused for submission. Historical local
test harnesses and captured browser profiles are excluded from the final
publication package to avoid stale selectors, private browser state, and
non-release artifacts.

## 7. Open commitments

- We will keep `host_permissions` scoped to `linkedin.com` only.
- We will NOT add network calls to any origin we control.
- We will NOT add background polling, scheduled runs, or any
  automation that lacks an explicit user click.
- If LinkedIn requests a takedown or specific behavior change, we will
  respond within a reasonable timeframe and ship a release that
  honours the request.

---

_Last reviewed: 2026-05-01, alongside the 1.1.0 release candidate._
