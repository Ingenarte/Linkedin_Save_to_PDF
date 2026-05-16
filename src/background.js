// src/background.js
// Service worker. Handles two concerns:
//   1. Post-install UX hint (surface the refresh requirement).
//   2. Deep-export orchestration: when the user opts into deep export from
//      the popup, this worker opens each /in/<slug>/details/<section>/
//      sub-page in a background tab, asks the content script to extract
//      the full section payload, closes the tab, then merges the result
//      with the base extraction and opens the print preview.
//
// Compliance constraints honored:
//   - User-initiated only. The orchestrator is only triggered by an
//     explicit popup click that already classifies as user activation.
//   - Same-profile only. The orchestrator derives target URLs from the
//     profile slug of the active tab and never crawls other profiles.
//   - Serial fetch with throttle. No parallel tab creation, no bursty
//     network patterns, so the extension mimics a normal user clicking
//     through the details pages at a human pace.
//   - Hard bounded. A per-tab timeout plus a global abort keep the
//     orchestrator from running away under unexpected DOM states.
//   - Local only. Collected data is written to chrome.storage.local with
//     a short-lived nonce and is cleared by the print view, never leaving
//     the device.

// --------------------------------------------------------------------
// Post-install hint
// --------------------------------------------------------------------
// We deliberately do NOT request the `notifications` permission. The
// popup already surfaces a friendlier hint when the content script is
// missing (e.g. on a previously-loaded LinkedIn tab), so adding a
// permission just for a one-shot toast would not be proportionate to
// the user benefit. Keeping the permission surface minimal is one of
// the explicit Chrome Web Store reviewer asks (see COMPLIANCE.md).

// --------------------------------------------------------------------
// Deep-export orchestrator
// --------------------------------------------------------------------

// Which sections support a dedicated /details/<slug>/ sub-page with a
// full-list layout. Sections not listed here fall back to the base
// extraction result.
const DEEP_SECTION_SLUGS = {
  experience: 'experience',
  education: 'education',
  certifications: 'certifications',
  skills: 'skills',
  languages: 'languages',
  honors: 'honors',
  publications: 'publications',
};

// Per-section timeout and throttle. Tab load stays bounded; the
// content script uses budgetMs so each /details/ page does not spend
// tens of seconds scrolling.
const TAB_LOAD_TIMEOUT_MS = 12000;
const POST_LOAD_SETTLE_MS = 200;
// Virtualized SDUI lists (experience, education) need more time before
// scroll+extract when the tab was created in the background (we avoid
// activating that tab so the user's DevTools / focus stay on the profile).
const POST_LOAD_SETTLE_LIST_HEAVY_MS = 900;
// Hard caps for expand+extract per deep tab. Heavy virtualized sections
// keep a larger ceiling; compact sections should not pay that cost.
const DEEP_SECTION_EXTRACT_BUDGET_MS = 5200;
const INTER_TAB_THROTTLE_MS = 500;
const INTER_TAB_THROTTLE_HEAVY_MS = 800;
const PING_RETRY_COUNT = 6;
const PING_RETRY_DELAY_MS = 200;
const SINGLE_PAGE_ROOT_SETTLE_MS = 900;
const SINGLE_PAGE_ROOT_TIMEOUT_MS = 15000;
const DEEP_JOB_STORAGE_PREFIX = 'lnp_deep_job_';
const DEEP_JOB_TTL_MS = 15 * 60 * 1000;

/** Same file list and order as `content_scripts` in manifest.json. */
const LNP_CONTENT_SCRIPT_FILES = [
  'src/content/ns.js',
  'src/content/utils.js',
  'src/content/jsonld.js',
  'src/content/header.js',
  'src/content/contact.js',
  'src/content/about.js',
  'src/content/experience.js',
  'src/content/education.js',
  'src/content/certifications.js',
  'src/content/publications.js',
  'src/content/skills.js',
  'src/content/languages.js',
  'src/content/honors.js',
  'src/content/content.js',
];

// Human-readable labels for deep-export progress (popup UI, English).
const DEEP_SECTION_LABELS = {
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  skills: 'Skills',
  languages: 'Languages',
  honors: 'Honors & awards',
  publications: 'Publications',
};

const DEEP_SECTION_TIMING = {
  experience: { budgetMs: 5200, settleMs: 900, postPingMs: 250, retrySettleMs: 650, weight: 'full list' },
  // education: higher settle + budget so headless/GPU-less Chromium (e.g. Linode)
  // has time to hydrate all SDUI rows before scroll extraction starts.
  education: { budgetMs: 9000, settleMs: 1800, postPingMs: 400, retrySettleMs: 1500, weight: 'full list' },
  // skills: virtualized full list — needs the education-class budget so the
  // background/active tab hydrates ALL rows before extraction. 5200/900 was
  // still too short (flaky 2-vs-10 between runs).
  skills: { budgetMs: 9000, settleMs: 1800, postPingMs: 400, retrySettleMs: 1500, weight: 'full list' },
  // certifications: 2026 /details/certifications/ lazy-renders the 2nd+ certs,
  // so a background tab with only 900ms settle saw just the 1st cert (Luca,
  // Franco). Match the education-class budget so all rows hydrate first.
  certifications: { budgetMs: 9000, settleMs: 1800, postPingMs: 400, retrySettleMs: 1500, weight: 'full list' },
  languages: { budgetMs: 2200, settleMs: 150, postPingMs: 0, retrySettleMs: 0, weight: 'fast' },
  honors: { budgetMs: 2400, settleMs: 150, postPingMs: 0, retrySettleMs: 0, weight: 'fast' },
  publications: { budgetMs: 2400, settleMs: 150, postPingMs: 0, retrySettleMs: 0, weight: 'fast' },
};

function deepSectionTiming(section) {
  return (
    DEEP_SECTION_TIMING[section] || {
      budgetMs: DEEP_SECTION_EXTRACT_BUDGET_MS,
      settleMs: POST_LOAD_SETTLE_MS,
      postPingMs: 0,
      retrySettleMs: 0,
      weight: 'standard',
    }
  );
}

/** Last popup port connected with name `lnpDeepExport` (progress UI). */
let deepExportProgressPort = null;
const deepExportJobs = new Map();
const cancelledDeepRunTokens = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lnpDeepExport') return;
  deepExportProgressPort = port;
  port.onDisconnect.addListener(() => {
    if (deepExportProgressPort === port) deepExportProgressPort = null;
  });
});

function emitDeepExportProgress(payload) {
  try {
    if (deepExportProgressPort)
      deepExportProgressPort.postMessage({
        type: 'DEEP_EXPORT_PROGRESS',
        ...payload,
      });
  } catch (_e) {
    // Popup may have closed; ignore.
  }
}

function createDeepJobId() {
  return `deep_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function createDeepRunToken() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function deepJobStorageKey(jobId) {
  return `${DEEP_JOB_STORAGE_PREFIX}${jobId}`;
}

function publicDeepJobState(job) {
  if (!job) return null;
  const {
    jobId,
    status,
    phase,
    section,
    label,
    weight,
    ok,
    error,
    cancelRequested,
    currentTabId,
    nonce,
    improvedSections,
    sectionsPlanned,
    plannedSections,
    skipPrint,
    merged,
    createdAt,
    updatedAt,
  } = job;
  return {
    jobId,
    status,
    phase,
    section,
    label,
    weight,
    ok,
    error,
    cancelRequested: !!cancelRequested,
    currentTabId,
    nonce,
    improvedSections: improvedSections || [],
    sectionsPlanned: sectionsPlanned || 0,
    plannedSections: plannedSections || [],
    skipPrint: !!skipPrint,
    merged: skipPrint ? merged : undefined,
    createdAt,
    updatedAt,
  };
}

function isDeepJobCancelled(job) {
  return (
    !!job?.cancelRequested ||
    job?.status === 'cancelled' ||
    (job?.runToken && cancelledDeepRunTokens.has(job.runToken))
  );
}

function createDeepExportCancelledError() {
  const err = new Error('Deep export cancelled');
  err.code = 'LNP_DEEP_EXPORT_CANCELLED';
  return err;
}

function throwIfDeepJobCancelled(job) {
  if (isDeepJobCancelled(job)) throw createDeepExportCancelledError();
}

function assertDeepJobActive(job, runToken) {
  if (runToken && job?.runToken !== runToken) throw createDeepExportCancelledError();
  throwIfDeepJobCancelled(job);
}

function isDeepExportCancelledError(error) {
  return (
    error?.code === 'LNP_DEEP_EXPORT_CANCELLED' ||
    String(error?.message || error) === 'Deep export cancelled'
  );
}

async function cancelDeepJob(jobId) {
  const job = (jobId && deepExportJobs.get(jobId)) || findLatestActiveDeepJob();
  if (!job) {
    if (!jobId) return null;
    const stored = await readDeepJob(jobId);
    if (!stored) return null;
    const cancelled = {
      ...stored,
      status: 'cancelled',
      phase: 'cancelled',
      ok: false,
      cancelRequested: true,
      error: 'Deep export cancelled',
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ [deepJobStorageKey(jobId)]: cancelled });
    emitDeepExportProgress(cancelled);
    return cancelled;
  }

  job.cancelRequested = true;
  job.cancelledAt = Date.now();
  if (job.runToken) cancelledDeepRunTokens.add(job.runToken);
  await closeTrackedDeepTabs(job);
  await updateDeepJob(job, {
    status: 'cancelled',
    phase: 'cancelled',
    ok: false,
    error: 'Deep export cancelled',
  });
  return publicDeepJobState(job);
}

async function persistDeepJob(job) {
  job.updatedAt = Date.now();
  deepExportJobs.set(job.jobId, job);
  await chrome.storage.local.set({
    [deepJobStorageKey(job.jobId)]: publicDeepJobState(job),
  });
}

async function readDeepJob(jobId) {
  if (!jobId) return null;
  const inMemory = deepExportJobs.get(jobId);
  if (inMemory) return publicDeepJobState(inMemory);
  const stored = await chrome.storage.local.get(deepJobStorageKey(jobId));
  return stored[deepJobStorageKey(jobId)] || null;
}

async function updateDeepJob(job, patch) {
  Object.assign(job, patch);
  await persistDeepJob(job);
  emitDeepExportProgress(publicDeepJobState(job));
}

async function pruneOldDeepJobs() {
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const stale = Object.entries(all || {})
      .filter(([key, value]) => {
        if (!key.startsWith(DEEP_JOB_STORAGE_PREFIX)) return false;
        const updatedAt = Number(value?.updatedAt || value?.createdAt || 0);
        return !updatedAt || now - updatedAt > DEEP_JOB_TTL_MS;
      })
      .map(([key]) => key);
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch (_e) {
    // Job pruning is opportunistic and must never block export.
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cancellableSleep(ms, job, stepMs = 100) {
  const deadline = Date.now() + Math.max(0, ms);
  while (Date.now() < deadline) {
    throwIfDeepJobCancelled(job);
    await sleep(Math.min(stepMs, deadline - Date.now()));
  }
  throwIfDeepJobCancelled(job);
}

function findLatestActiveDeepJob() {
  let latest = null;
  for (const job of deepExportJobs.values()) {
    if (!job || isDeepJobCancelled(job)) continue;
    if (job.status !== 'queued' && job.status !== 'running') continue;
    if (!latest || (job.updatedAt || 0) > (latest.updatedAt || 0)) {
      latest = job;
    }
  }
  return latest;
}

async function closeTrackedDeepTabs(job) {
  const tabIds = new Set(
    [job?.currentTabId, ...(Array.isArray(job?.openedTabIds) ? job.openedTabIds : [])]
      .filter((tabId) => typeof tabId === 'number'),
  );
  for (const tabId of tabIds) {
    await safeRemoveTab(tabId);
  }
  if (job) {
    job.currentTabId = undefined;
    job.openedTabIds = [];
  }
}

function normalizeAdNoiseText(value) {
  return String(value || '')
    .replace(/[’]/g, "'")
    .replace(/^[\s\-–—·•:]+|[\s\-–—·•:]+$/g, '')
    .replace(/[\s\-–—·•:?!.,;()]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isLinkedInAdNoiseValue(value) {
  if (typeof value !== 'string') return false;
  const text = normalizeAdNoiseText(value);
  return (
    text === 'why am i seeing this ad' ||
    text === 'manage your ad preferences' ||
    text === "i don't want to see this ad in my feed" ||
    text === "i don't want to see this ad" ||
    text === 'i dont want to see this ad in my feed' ||
    text === 'i dont want to see this ad' ||
    text.includes('why am i seeing this ad') ||
    text.includes('manage your ad preferences') ||
    text.includes("i don't want to see this ad") ||
    text.includes('i dont want to see this ad')
  );
}

function sanitizeExportPayload(value) {
  if (value == null) return value;
  if (typeof value === 'string') return isLinkedInAdNoiseValue(value) ? undefined : value;
  if (Array.isArray(value)) {
    const items = value
      .map(sanitizeExportPayload)
      .filter((item) => {
        if (item == null) return false;
        if (typeof item === 'object' && !Array.isArray(item)) {
          return Object.keys(item).length > 0;
        }
        return true;
      });
    return items.length ? items : undefined;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const clean = sanitizeExportPayload(child);
      if (clean !== undefined) out[key] = clean;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function buildDetailsUrl(slug, sectionSlug) {
  const safeSlug = encodeURIComponent(slug).replace(/%2F/gi, '/');
  return `https://www.linkedin.com/in/${safeSlug}/details/${sectionSlug}/`;
}

function getLinkedInProfileRoute(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/in\/([^\/?#]+)(?:\/(.*))?$/i);
    if (!match) return null;
    const slug = decodeURIComponent(match[1]);
    const rest = match[2] || '';
    return {
      slug,
      rootUrl: `https://${parsed.host}/in/${encodeURIComponent(slug)}/`,
      isDetailsPage: /^details(?:\/|$)/i.test(rest),
    };
  } catch (_e) {
    return null;
  }
}

// Sends a message to a tab and returns the response, mapping the
// chrome.runtime.lastError protocol into a real rejection.
function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'sendMessage failed'));
          return;
        }
        resolve(resp);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/** Full-width busy banner on the profile tab (main frame only) during deep export. */
function sendMessageToTabMainFrame(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'sendMessage failed'));
          return;
        }
        resolve(resp);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function notifyDeepExportPageBusyOverlay(tabId, action) {
  if (tabId == null) return;
  await sendMessageToTabMainFrame(tabId, {
    type: 'DEEP_EXPORT_BUSY_OVERLAY',
    action,
  });
}

function sendMessageToTabWithTimeout(tabId, message, timeoutMs) {
  return Promise.race([
    sendMessageToTab(tabId, message),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `tabs.sendMessage timed out after ${timeoutMs}ms (content script stuck or wrong extension build — reload the LinkedIn tab and chrome://extensions for this repo).`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

// Probes the content script with PING_LNP until it responds or the
// retry budget is exhausted. Covers the brief window between "tab
// complete" and the content script registering its onMessage listener.
async function waitForContentScript(tabId) {
  let lastErr;
  for (let i = 0; i < PING_RETRY_COUNT; i++) {
    try {
      const resp = await sendMessageToTab(tabId, { type: 'PING_LNP' });
      if (resp && resp.ok) return true;
    } catch (e) {
      lastErr = e;
    }
    await sleep(PING_RETRY_DELAY_MS);
  }
  throw lastErr || new Error('Content script did not respond');
}

async function tryInjectContentScripts(tabId) {
  if (!chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: LNP_CONTENT_SCRIPT_FILES,
    });
    return true;
  } catch (_e) {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    await waitForContentScript(tabId);
    return true;
  } catch (_e) {
    const injected = await tryInjectContentScripts(tabId);
    if (!injected) throw _e;
    await waitForContentScript(tabId);
    return true;
  }
}

async function waitForTabAtUrl(tabId, expectedUrlPrefix, timeoutMs) {
  const started = Date.now();
  let lastTab;
  while (Date.now() - started < timeoutMs) {
    lastTab = await chrome.tabs.get(tabId);
    try {
      assertExpectedTabUrl(lastTab, expectedUrlPrefix);
      if (lastTab.status === 'complete') return lastTab;
    } catch (_e) {
      // Keep polling while LinkedIn finishes route changes or redirects.
    }
    await sleep(250);
  }
  const finalUrl = lastTab?.url ? ` Current URL: ${lastTab.url.split('?')[0]}` : '';
  throw new Error(`Profile root navigation timed out.${finalUrl}`);
}

/**
 * Serialize extension export work per tab (single-page PDF, deep export kickoff, …).
 * Overlapping automation / UI paths on the same LinkedIn tab cause Chrome messaging
 * failures ("The message port closed before a response was received").
 */
const lnpSerializedTabChains = new Map();

function enqueueSerializedTabWork(tabId, task) {
  const key = String(tabId);
  const tail = lnpSerializedTabChains.get(key) || Promise.resolve();
  const job = tail.catch(() => {}).then(() => task());
  lnpSerializedTabChains.set(key, job);
  void job.finally(() => {
    if (lnpSerializedTabChains.get(key) === job) {
      lnpSerializedTabChains.delete(key);
    }
  });
  return job;
}

function runSinglePageExportSerialized(tabId, settings) {
  return enqueueSerializedTabWork(tabId, () => runSinglePageExport(tabId, settings));
}

async function runSinglePageExport(tabId, settings) {
  const tab = await chrome.tabs.get(tabId);
  const route = getLinkedInProfileRoute(tab?.url);
  if (!route) {
    throw new Error('Open a LinkedIn profile tab and try again.');
  }
  if (route.isDetailsPage) {
    await chrome.tabs.update(tabId, { url: route.rootUrl });
    await waitForTabAtUrl(tabId, route.rootUrl, SINGLE_PAGE_ROOT_TIMEOUT_MS);
    await sleep(SINGLE_PAGE_ROOT_SETTLE_MS);
  }
  await ensureContentScript(tabId);
  const resp = await sendMessageToTabWithTimeout(
    tabId,
    {
      type: 'START_EXPORT',
      settings,
    },
    120000,
  );
  if (!resp || !resp.ok || !resp.nonce) {
    throw new Error(String(resp?.error || 'START_EXPORT failed'));
  }

  const printUrl = chrome.runtime.getURL(
    `src/print/print.html?nonce=${encodeURIComponent(resp.nonce)}`,
  );
  await new Promise((resolve, reject) => {
    chrome.tabs.create({ url: printUrl, active: true }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
  return resp;
}

async function normalizeProfileRootTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const route = getLinkedInProfileRoute(tab?.url);
  if (!route) {
    throw new Error('Open a LinkedIn profile tab and try again.');
  }
  if (route.isDetailsPage) {
    await chrome.tabs.update(tabId, { url: route.rootUrl });
    await waitForTabAtUrl(tabId, route.rootUrl, SINGLE_PAGE_ROOT_TIMEOUT_MS);
    await sleep(SINGLE_PAGE_ROOT_SETTLE_MS);
  }
  await ensureContentScript(tabId);
  return {
    tabId,
    slug: route.slug,
    rootUrl: route.rootUrl,
  };
}

function assertExpectedTabUrl(tab, expectedUrlPrefix) {
  const finalUrl = (tab && tab.url) || '';
  // Normalize trailing slashes before comparing so LinkedIn's canonical
  // redirects ("/details/education" vs "/details/education/") match.
  const norm = (u) => u.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (
    expectedUrlPrefix &&
    finalUrl &&
    !norm(finalUrl).startsWith(norm(expectedUrlPrefix))
  ) {
    throw new Error(`Unexpected navigation: ${finalUrl.split('?')[0]}`);
  }
}

// Resolves when the tab finishes loading (status === 'complete') or
// rejects after the timeout. Uses the stored tab URL (available because
// host_permissions covers linkedin.com) to verify we did not land on
// an auth wall or an unrelated URL.
function waitForTabComplete(tabId, expectedUrlPrefix) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Tab load timeout'));
    }, TAB_LOAD_TIMEOUT_MS);

    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      try {
        assertExpectedTabUrl(tab, expectedUrlPrefix);
      } catch (e) {
        reject(e);
        return;
      }
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) return;
      if (tab?.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      try {
        assertExpectedTabUrl(tab, expectedUrlPrefix);
        resolve(tab);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function safeRemoveTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_e) {
    // Tab may already be gone (user closed it, navigation redirect);
    // ignore since there is nothing to clean up.
  }
}

// Opens a details sub-page in a background tab, extracts the requested
// section, closes the tab, and returns the extractor output. Any
// failure is isolated so the caller can fall back to the base value.
//
// baseListLenHint: profile-tab list length before deep fetch. When the
// details tab stays in the background, virtualized lists often under-count;
// we then activate that tab once and re-run EXTRACT_SECTION on the same tab.
async function fetchDeepSection(
  slug,
  section,
  originalTabId,
  baseListLenHint = 0,
  job,
  runToken,
) {
  const sectionSlug = DEEP_SECTION_SLUGS[section];
  if (!sectionSlug) return undefined;

  const url = buildDetailsUrl(slug, sectionSlug);
  const expectedPrefix = url;
  const label = DEEP_SECTION_LABELS[section] || section;
  // Full-list / many-row sections whose /details/ page legitimately holds
  // MORE than the main-profile preview, and which a BACKGROUND tab lazy-renders
  // incompletely. These must get an active-tab re-extract (Chromium throttles
  // layout/visibility in background tabs, so the 2nd+ rows never render until
  // the tab is visible). certifications & skills were missing here — that is
  // why Luca/Franco deep kept only the 1st cert and skills was flaky.
  const listSection =
    section === 'experience' ||
    section === 'education' ||
    section === 'skills' ||
    section === 'certifications';
  const activeRetrySection = listSection || section === 'languages';
  const timing = deepSectionTiming(section);

  let tabId;
  try {
    assertDeepJobActive(job, runToken);
    const openingPatch = {
      phase: 'section_opening',
      section,
      label,
      weight: timing.weight,
    };
    if (job) await updateDeepJob(job, openingPatch);
    else emitDeepExportProgress(openingPatch);
    const created = await chrome.tabs.create({ url, active: false });
    tabId = created.id;
    if (typeof tabId !== 'number') {
      throw new Error('Failed to allocate tab');
    }
    if (job) {
      const openedTabIds = Array.isArray(job.openedTabIds)
        ? [...job.openedTabIds, tabId]
        : [tabId];
      await updateDeepJob(job, { currentTabId: tabId, openedTabIds });
    }
    assertDeepJobActive(job, runToken);
    await waitForTabComplete(tabId, expectedPrefix);
    assertDeepJobActive(job, runToken);
    await cancellableSleep(timing.settleMs, job);
    await ensureContentScript(tabId);
    if (timing.postPingMs > 0) await cancellableSleep(timing.postPingMs, job);
    assertDeepJobActive(job, runToken);

    const readingPatch = {
      phase: 'section_reading',
      section,
      label,
      weight: timing.weight,
    };
    if (job) await updateDeepJob(job, readingPatch);
    else emitDeepExportProgress(readingPatch);

    const runExtract = () =>
      sendMessageToTab(tabId, {
        type: 'EXTRACT_SECTION',
        section,
        budgetMs: timing.budgetMs,
      });

    const resp = await runExtract();
    assertDeepJobActive(job, runToken);
    if (!resp || !resp.ok) {
      throw new Error(resp?.error || 'EXTRACT_SECTION returned no data');
    }
    let value = resp.value;
    let vlen = Array.isArray(value) ? value.length : 0;
    const hint =
      typeof baseListLenHint === 'number' ? baseListLenHint : 0;
    // List sections ALWAYS get one active-tab re-extract (background-tab render
    // is unreliable, and a truncated bg result often equals the small preview
    // hint so a "<" check would skip the retry). The retry keeps the LARGER of
    // the two results, so an unnecessary retry is harmless. Non-list sections
    // (languages) keep the conservative hint-based condition.
    const needsRetry =
      activeRetrySection &&
      (listSection || (hint > 0 && (vlen === 0 || vlen < hint)));

    if (needsRetry) {
      try {
        await chrome.tabs.update(tabId, { active: true });
        await cancellableSleep(timing.retrySettleMs || 650, job);
      } catch (_e) {
        /* ignore */
      }
      assertDeepJobActive(job, runToken);
      try {
        const resp2 = await runExtract();
        assertDeepJobActive(job, runToken);
        if (resp2 && resp2.ok) {
          const v2 = resp2.value;
          const v2len = Array.isArray(v2) ? v2.length : 0;
          if (v2len > vlen) {
            value = v2;
            vlen = v2len;
          }
        }
      } catch (_e2) {
        // Keep the original background-tab result when the retry cannot improve it.
      }
    }

    return value;
  } catch (e) {
    if (isDeepExportCancelledError(e) || isDeepJobCancelled(job)) {
      throw createDeepExportCancelledError();
    }
    const failedPatch = {
      phase: 'section_failed',
      section,
      label,
      error: String(e?.message || e),
    };
    if (job) await updateDeepJob(job, failedPatch);
    else emitDeepExportProgress(failedPatch);
    return undefined;
  } finally {
    if (typeof originalTabId === 'number') {
      try {
        await chrome.tabs.update(originalTabId, { active: true });
      } catch (_e) {
        /* original tab may be closed */
      }
    }
    if (typeof tabId === 'number') {
      await safeRemoveTab(tabId);
    }
    if (job && job.currentTabId === tabId) {
      const openedTabIds = Array.isArray(job.openedTabIds)
        ? job.openedTabIds.filter((id) => id !== tabId)
        : [];
      await updateDeepJob(job, { currentTabId: undefined, openedTabIds });
    }
  }
}

// Sections to deep-fetch, gated by the user's Settings toggles. Order
// is deterministic so timing/rate patterns stay predictable.
function plannedDeepSections(settings) {
  const order = [
    'experience',
    'education',
    'certifications',
    'skills',
    'languages',
    'honors',
    'publications',
  ];
  return order.filter((s) => !!settings?.[s]);
}

// Keeps a deep value only when it provides richer data than the base
// extract. We treat "richer" as "more entries" for array-shaped payloads
// and "non-empty" for scalars.
function isRicher(deepValue, baseValue) {
  if (deepValue == null) return false;
  if (Array.isArray(deepValue)) {
    if (!Array.isArray(baseValue)) return deepValue.length > 0;
    return deepValue.length > baseValue.length;
  }
  if (typeof deepValue === 'string') {
    return deepValue.length > (baseValue?.length || 0);
  }
  return true;
}

/** Length-like metric for merge diagnostics (arrays = count, strings = length). */
function payloadEntryCount(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') return value.length;
  return 1;
}

/**
 * Whether to replace merged[key] with the deep /details/<section>/ extract.
 * For arrays, we prefer the dedicated tab when it ties the profile tab on
 * count — same length often means richer row data on /details/ (print would
 * otherwise keep summary rows that lack name/issuer and look empty).
 */
function shouldApplyDeepMerge(deepValue, baseValue) {
  if (deepValue == null) return false;
  if (Array.isArray(deepValue)) {
    if (deepValue.length === 0) return false;
    if (!Array.isArray(baseValue)) return true;
    const baseLen = baseValue.length;
    const deepLen = deepValue.length;
    if (isRicher(deepValue, baseValue)) return true;
    if (baseLen === 0) return true;
    if (deepLen === baseLen) return true;
    return false;
  }
  return isRicher(deepValue, baseValue);
}

function languageMergeKey(item) {
  return String(item?.language || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mergeLanguageLists(baseValue, deepValue) {
  const merged = [];
  const byLanguage = new Map();
  const add = (item, preferExisting) => {
    const key = languageMergeKey(item);
    if (!key) return;
    const current = byLanguage.get(key);
    if (current && preferExisting) return;
    const next = {
      ...current,
      ...item,
      language: item.language || current?.language,
      proficiency: item.proficiency || current?.proficiency,
    };
    byLanguage.set(key, next);
  };

  if (Array.isArray(baseValue)) {
    for (const item of baseValue) add(item, true);
  }
  if (Array.isArray(deepValue)) {
    for (const item of deepValue) add(item, false);
  }
  for (const item of byLanguage.values()) merged.push(item);
  return merged.length ? merged : undefined;
}

// Runs the full orchestration. Returns the merged payload ready to be
// handed off to the print pipeline.
async function runDeepExport({ originalTabId, slug, settings, job, runToken }) {
  if (job) {
    await updateDeepJob(job, { phase: 'base_profile_reading' });
  } else {
    emitDeepExportProgress({ phase: 'base_profile_reading' });
  }
  // 1. Base extraction from the active profile tab.
  const base = await sendMessageToTab(originalTabId, {
    type: 'EXTRACT_PROFILE',
    tabUrl: undefined,
  });
  assertDeepJobActive(job, runToken);
  if (job) {
    await updateDeepJob(job, { phase: 'base_profile_done' });
  } else {
    emitDeepExportProgress({ phase: 'base_profile_done' });
  }
  const merged = { ...(base || {}) };

  if (!slug) {
    return {
      merged,
      improvedSections: [],
      sectionsPlanned: 0,
      plannedSections: [],
    };
  }

  // 2. Deep fetch each requested section, serially, with throttle.
  const sections = plannedDeepSections(settings);
  const improvedSections = [];
  for (let i = 0; i < sections.length; i++) {
    assertDeepJobActive(job, runToken);
    const section = sections[i];
    const key = sectionPayloadKey(section);
    const baseLenHint = payloadEntryCount(merged[key]);
    const deepValue = await fetchDeepSection(
      slug,
      section,
      originalTabId,
      baseLenHint,
      job,
      runToken,
    );
    assertDeepJobActive(job, runToken);
    const baseLen = payloadEntryCount(merged[key]);
    const deepLen = payloadEntryCount(deepValue);
    if (key === 'languages') {
      const languageMerge = mergeLanguageLists(merged[key], deepValue);
      const mergedLen = payloadEntryCount(languageMerge);
      if (languageMerge && mergedLen > baseLen) {
        merged[key] = languageMerge;
        improvedSections.push(section);
      }
      continue;
    }
    // certifications & skills: keep whichever of base vs deep is LONGER.
    // The section-title junk row ("Licenses & certifications") is already
    // filtered out of every path, so the base count is valid. The /details/
    // deep extract is normally richer (Luca GMAT+FCE, Franco Odoo+JSConf,
    // Martin 3) and wins; but a flaky/throttled deep that truncates (e.g.
    // Linode background tab dropping paul-dc's Cambridge cert) must NOT
    // clobber a valid base — so a shorter deep is ignored.
    const deepNonEmpty = Array.isArray(deepValue) && deepValue.length > 0;
    if (section === 'certifications' || section === 'skills') {
      const baseArr = Array.isArray(merged[key]) ? merged[key] : [];
      if (deepNonEmpty && deepValue.length >= baseArr.length) {
        merged[key] = deepValue;
        improvedSections.push(section);
      }
    } else if (shouldApplyDeepMerge(deepValue, merged[key])) {
      merged[key] = deepValue;
      improvedSections.push(section);
    }
    if (i < sections.length - 1) {
      const throttleMs =
        section === 'experience' || section === 'education'
          ? INTER_TAB_THROTTLE_HEAVY_MS
          : INTER_TAB_THROTTLE_MS;
      await cancellableSleep(throttleMs, job);
      assertDeepJobActive(job, runToken);
    }
  }

  assertDeepJobActive(job, runToken);
  if (job) {
    await updateDeepJob(job, {
      phase: 'merging',
      improvedSections,
      sectionsPlanned: sections.length,
      plannedSections: [...sections],
    });
  } else {
    emitDeepExportProgress({ phase: 'merging' });
  }
  merged.lastUpdatedISO = new Date().toISOString();
  return {
    merged,
    improvedSections,
    sectionsPlanned: sections.length,
    plannedSections: [...sections],
  };
}

// Maps deep-export section identifiers to the payload key used by the
// print pipeline. Most identifiers already match, but a couple differ
// (e.g. the "experience" section is serialized as "experiences").
function sectionPayloadKey(section) {
  switch (section) {
    case 'experience':
      return 'experiences';
    default:
      return section;
  }
}

// Writes the final payload to storage under a nonce and opens the
// print view. Mirrors the non-deep flow already present in content.js.
async function openPrintView(data, settings, job, runToken) {
  const nonce = `lnp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await chrome.storage.local.set({ [nonce]: { data, settings } });
  assertDeepJobActive(job, runToken);
  const printUrl = chrome.runtime.getURL(
    `src/print/print.html?nonce=${encodeURIComponent(nonce)}`,
  );
  await chrome.tabs.create({ url: printUrl, active: true });
  return nonce;
}

async function runDeepExportJob(job) {
  const runToken = job.runToken;
  const overlayTabId = job.originalTabId;
  try {
    assertDeepJobActive(job, runToken);
    await updateDeepJob(job, { status: 'running', phase: 'starting' });
    await notifyDeepExportPageBusyOverlay(overlayTabId, 'show').catch(() => {});
    const {
      merged,
      improvedSections,
      sectionsPlanned,
      plannedSections,
    } = await runDeepExport({
      originalTabId: job.originalTabId,
      slug: job.slug,
      settings: job.settings || {},
      job,
      runToken,
    });
    const sanitizedMerged = sanitizeExportPayload(merged) || {};

    const skipPrint = !!job.skipPrint;
    if (skipPrint) {
      assertDeepJobActive(job, runToken);
      await updateDeepJob(job, {
        status: 'complete',
        phase: 'complete',
        ok: true,
        merged: sanitizedMerged,
        improvedSections,
        sectionsPlanned,
        plannedSections: plannedSections || [],
      });
      return;
    }

    assertDeepJobActive(job, runToken);
    await updateDeepJob(job, {
      phase: 'opening_print_preview',
      improvedSections,
      sectionsPlanned,
      plannedSections: plannedSections || [],
    });
    assertDeepJobActive(job, runToken);
    const nonce = await openPrintView(
      sanitizedMerged,
      job.settings || {},
      job,
      runToken,
    );
    assertDeepJobActive(job, runToken);
    await updateDeepJob(job, {
      status: 'complete',
      phase: 'complete',
      ok: true,
      nonce,
      improvedSections,
      sectionsPlanned,
      plannedSections: plannedSections || [],
    });
  } catch (e) {
    if (isDeepExportCancelledError(e) || isDeepJobCancelled(job)) {
      await closeTrackedDeepTabs(job);
      await updateDeepJob(job, {
        status: 'cancelled',
        phase: 'cancelled',
        ok: false,
        error: 'Deep export cancelled',
      });
      return;
    }
    console.error('[lnp] deep export job failed', e);
    await updateDeepJob(job, {
      status: 'failed',
      phase: 'complete',
      ok: false,
      error: String(e?.message || e),
      improvedSections: [],
      sectionsPlanned: 0,
    });
  } finally {
    await notifyDeepExportPageBusyOverlay(overlayTabId, 'hide').catch(() => {});
  }
}

// --------------------------------------------------------------------
// Export settings (sync with popup DEFAULT_SETTINGS + lnp_settings_v1)
// --------------------------------------------------------------------
const DEFAULT_EXPORT_SETTINGS = {
  profileHeader: true,
  contact: true,
  withPhoto: true,
  about: true,
  experience: true,
  education: true,
  certifications: true,
  skills: true,
  languages: true,
  honors: true,
  publications: true,
};

const SETTINGS_STORAGE_KEY = 'lnp_settings_v1';

async function loadExportSettings() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (obj) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve({ ...DEFAULT_EXPORT_SETTINGS, ...(obj[SETTINGS_STORAGE_KEY] || {}) });
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Forces every export section checkbox to ON in sync storage so the popup,
 * print pipeline, and deep-export planner match full-profile automation.
 * Preserves non-export keys already stored under lnp_settings_v1 (e.g. darkMode).
 */
async function persistAllExportSectionTogglesOn() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (obj) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        const prev = obj[SETTINGS_STORAGE_KEY] || {};
        const next = { ...prev };
        for (const k of Object.keys(DEFAULT_EXPORT_SETTINGS)) {
          next[k] = true;
        }
        next.profileHeader = true;
        next.withPhoto = true;
        chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: next }, () => {
          const err2 = chrome.runtime.lastError;
          if (err2) reject(new Error(err2.message));
          else resolve();
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function assertAllExportSectionTogglesOn(settings) {
  const merged = { ...DEFAULT_EXPORT_SETTINGS, ...(settings || {}) };
  const off = Object.keys(DEFAULT_EXPORT_SETTINGS).filter((k) => !merged[k]);
  if (off.length) {
    throw new Error(
      `Full-info automation requires all section toggles ON; off: ${off.join(', ')}`,
    );
  }
}

function isLinkedInProfileUrlForCommand(url) {
  return /^https:\/\/([a-z0-9.-]+\.)?linkedin\.com\/(in|profile)\//i.test(
    String(url || ''),
  );
}

async function startDeepExportCore(originalTabId, slugHint, settingsInput, skipPrint) {
  await pruneOldDeepJobs();
  const rootProfile = await normalizeProfileRootTab(originalTabId);
  let settings = settingsInput;
  if (
    settings == null ||
    (typeof settings === 'object' && Object.keys(settings).length === 0)
  ) {
    settings = await loadExportSettings();
  }
  const now = Date.now();
  const job = {
    jobId: createDeepJobId(),
    runToken: createDeepRunToken(),
    status: 'queued',
    phase: 'queued',
    originalTabId: rootProfile.tabId,
    slug: rootProfile.slug || slugHint,
    settings,
    skipPrint: !!skipPrint,
    cancelRequested: false,
    currentTabId: undefined,
    openedTabIds: [],
    improvedSections: [],
    sectionsPlanned: 0,
    plannedSections: [],
    createdAt: now,
    updatedAt: now,
  };
  await persistDeepJob(job);
  void runDeepExportJob(job);
  return job;
}

function startDeepExportCoreSerialized(originalTabId, slugHint, settingsInput, skipPrint) {
  return enqueueSerializedTabWork(originalTabId, () =>
    startDeepExportCore(originalTabId, slugHint, settingsInput, skipPrint),
  );
}

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !isLinkedInProfileUrlForCommand(tab.url)) {
        console.warn(
          '[lnp] keyboard export skipped — active tab is not a LinkedIn profile',
          tab?.url,
        );
        return;
      }
      if (command === 'lnp-export-single-page') {
        const settings = await loadExportSettings();
        await runSinglePageExportSerialized(tab.id, settings);
      } else if (command === 'lnp-export-full-profile') {
        const settings = await loadExportSettings();
        await startDeepExportCoreSerialized(tab.id, undefined, settings, false);
      }
    } catch (e) {
      console.error('[lnp] commands.onCommand failed', command, e);
    }
  })();
});

// --------------------------------------------------------------------
// Message router
// --------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GET_DEEP_EXPORT_JOB') {
    (async () => {
      try {
        sendResponse({ ok: true, job: await readDeepJob(msg.jobId) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === 'CANCEL_DEEP_EXPORT') {
    (async () => {
      try {
        const job = await cancelDeepJob(msg.jobId);
        sendResponse({ ok: true, job });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === 'START_SINGLE_PAGE_EXPORT') {
    const keepAlive = setInterval(() => {
      try {
        chrome.runtime.getPlatformInfo(() => {});
      } catch (_e) {
        /* ignore */
      }
    }, 4000);
    (async () => {
      try {
        const resp = await runSinglePageExportSerialized(
          msg.tabId,
          msg.settings || {},
        );
        sendResponse(resp || { ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      } finally {
        clearInterval(keepAlive);
      }
    })();
    return true;
  }

  if (msg?.type !== 'START_DEEP_EXPORT') return false;

  (async () => {
    try {
      const job = await startDeepExportCoreSerialized(
        msg.originalTabId,
        msg.slug,
        msg.settings,
        msg.skipPrint,
      );
      sendResponse({ ok: true, jobId: job.jobId, job: publicDeepJobState(job) });
    } catch (e) {
      console.error('[lnp] START_DEEP_EXPORT failed', e);
      emitDeepExportProgress({
        phase: 'complete',
        ok: false,
        error: String(e?.message || e),
        improvedSections: [],
        sectionsPlanned: 0,
      });
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true; // keep the channel open only for the quick job acknowledgement
});

// Playwright/CDP: content cannot use chrome.commands. `runtime.sendMessage` from
// content is capped (~60s) before the port closes; long exports use `connect`.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lnp-full-info-automation') return;
  const keepAlive = setInterval(() => {
    try {
      chrome.runtime.getPlatformInfo(() => {});
    } catch (_e) {
      /* ignore */
    }
  }, 4000);
  const stopKeepAlive = () => {
    clearInterval(keepAlive);
  };
  let started = false;
  port.onMessage.addListener((msg) => {
    if (started) return;
    if (!msg || msg.type !== 'LNP_AUTOMATION_EXPORT') return;
    started = true;
    void (async () => {
      try {
        const tabId = port.sender?.tab?.id;
        if (!tabId) {
          port.postMessage({ ok: false, error: 'No sender tab' });
          return;
        }
        const tab = await chrome.tabs.get(tabId);
        if (!isLinkedInProfileUrlForCommand(tab.url)) {
          port.postMessage({
            ok: false,
            error: 'Active tab is not a LinkedIn profile URL',
          });
          return;
        }
        // Align stored popup toggles with automation (all sections ON), then verify.
        await persistAllExportSectionTogglesOn();
        let settings;
        if (msg.exportSettings && typeof msg.exportSettings === 'object') {
          settings = { ...DEFAULT_EXPORT_SETTINGS, ...msg.exportSettings };
        } else {
          settings = await loadExportSettings();
          Object.assign(settings, DEFAULT_EXPORT_SETTINGS);
        }
        assertAllExportSectionTogglesOn(settings);
        if (msg.mode === 'single') {
          await runSinglePageExportSerialized(tabId, settings);
          port.postMessage({ ok: true });
        } else if (msg.mode === 'deep') {
          await startDeepExportCoreSerialized(tabId, undefined, settings, false);
          // Brief yield so the service worker finishes microtasks before replying;
          // some Chrome builds dropped the port if postMessage fired in the same turn
          // as persistDeepJob + storage callbacks.
          await new Promise((r) => setTimeout(r, 50));
          port.postMessage({ ok: true });
        } else {
          port.postMessage({ ok: false, error: 'Invalid automation mode' });
        }
      } catch (e) {
        try {
          port.postMessage({ ok: false, error: String(e?.message || e) });
        } catch (_postErr) {
          /* ignore */
        }
      } finally {
        // Do not call port.disconnect() from the service worker: it can race with
        // postMessage delivery and surface as "The message port closed before a response
        // was received" in the content script. The tab end disconnects after handling.
        setTimeout(stopKeepAlive, 250);
      }
    })();
  });
});
