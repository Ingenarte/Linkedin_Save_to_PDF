// -------------------------
// LinkedIn ATS - popup.js
// -------------------------

const SETTINGS_KEY = 'lnp_settings_v1';

const DEFAULT_SETTINGS = {
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
  interests: true,
  // Dark mode (popup UI only). Print/PDF output stays light to keep
  // recruiter-friendly defaults.
  darkMode: false,
};

// -------------------------
// Dark mode
// -------------------------
function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', !!enabled);
}

// -------------------------
// Storage helpers
// -------------------------
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (obj) => {
      resolve({ ...DEFAULT_SETTINGS, ...(obj[SETTINGS_KEY] || {}) });
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}

// -------------------------
// Tabs (Main / Settings / Info)
// -------------------------
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const views = {
    main: document.getElementById('view-main'),
    settings: document.getElementById('view-settings'),
    info: document.getElementById('view-info'),
  };

  // Reflect the active view as a body class so CSS can show/hide
  // tab-specific UI (e.g. the dark-mode switch only on Settings).
  const setBodyView = (view) => {
    document.body.classList.remove('view-main', 'view-settings', 'view-info');
    if (view) document.body.classList.add('view-' + view);
  };

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');

      Object.values(views).forEach((v) => {
        v.classList.remove('is-active');
        v.setAttribute('aria-hidden', 'true');
      });

      const view = btn.dataset.view;
      const el = views[view];
      el.classList.add('is-active');
      el.setAttribute('aria-hidden', 'false');
      setBodyView(view);
    });
  });

  // Initialize body class from the currently-selected tab so the CSS
  // gating works on first paint.
  const initiallySelected = document.querySelector(
    '.tab-btn[aria-selected="true"]',
  );
  setBodyView(initiallySelected?.dataset.view || 'main');
}

// -------------------------
// Active tab messaging (robust)
// -------------------------
function isLinkedInProfileUrl(url) {
  return /^https:\/\/([a-z]+\.)?linkedin\.com\/(in|profile)\//i.test(url || '');
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

function humanizeProfileSlug(slug) {
  return String(slug || 'LinkedIn profile')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const MSG_OPEN_PROFILE_TAB =
  'Open a LinkedIn profile tab to use this extension.';

/** Same file list and order as `content_scripts` in manifest.json (for re-inject). */
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
  'src/content/interests.js',
  'src/content/content.js',
];

function isContentScriptUnavailableMessage(s) {
  return /Content script not available in this tab\.?/i.test(String(s || ''));
}

function isWrongProfileTabMessage(s) {
  return /Open a LinkedIn profile tab and try again\.?/i.test(String(s || ''));
}

function setNeedProfileTabStatus(statusEl) {
  if (!statusEl) return;
  statusEl.removeAttribute('role');
  statusEl.textContent = MSG_OPEN_PROFILE_TAB;
}

function setContentScriptReloadHintStatus(statusEl) {
  if (!statusEl) return;
  statusEl.setAttribute('role', 'alert');
  statusEl.innerHTML =
    '<strong style="color:#c00;display:block;text-align:center">LinkedIn tab needs a refresh for this extension. Reload the tab, then try again.</strong>';
}

/** Returns suggested clearDelay ms when handled, or null. */
function applyExportErrorToStatus(statusEl, err) {
  const msg = String(err?.message || err || '');
  if (isContentScriptUnavailableMessage(msg)) {
    setContentScriptReloadHintStatus(statusEl);
    return 4000;
  }
  if (isWrongProfileTabMessage(msg)) {
    setNeedProfileTabStatus(statusEl);
    statusEl.setAttribute('role', 'alert');
    return 4000;
  }
  return null;
}

async function pingContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING_LNP' });
    return true;
  } catch (_e) {
    return false;
  }
}

async function tryInjectLnpScripts(tabId) {
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

/**
 * PING the content script; if missing, re-inject the manifest bundle once
 * (user gesture from popup) and PING again.
 */
async function ensureContentReady(tabId) {
  if (await pingContentScript(tabId)) return true;
  const injected = await tryInjectLnpScripts(tabId);
  if (!injected) return false;
  return pingContentScript(tabId);
}

async function getActiveLinkedInTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isLinkedInProfileUrl(tab.url)) {
    throw new Error('Open a LinkedIn profile tab and try again.');
  }
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveLinkedInTab();
  const ready = await ensureContentReady(tab.id);
  if (!ready) {
    throw new Error('Content script not available in this tab.');
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (resp) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        reject(new Error(lastErr.message || 'Unknown messaging error'));
        return;
      }
      resolve(resp);
    });
  });
}

// -------------------------
// Data from content script
// -------------------------
async function getProfileData() {
  const status = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !isLinkedInProfileUrl(tab.url)) {
      setNeedProfileTabStatus(status);
      return {};
    }
    const ready = await ensureContentReady(tab.id);
    if (!ready) {
      setContentScriptReloadHintStatus(status);
      return {};
    }
    const resp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'EXTRACT_PROFILE', quick: true },
        (r) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) reject(new Error(lastErr.message));
          else resolve(r);
        },
      );
    });
    if (status) {
      status.textContent = '';
      status.removeAttribute('role');
    }
    return resp || {};
  } catch (_err) {
    setContentScriptReloadHintStatus(status);
    return {};
  }
}

// -------------------------
// Preview
// -------------------------
async function renderPreview(data) {
  const settings = await loadSettings();

  const preview = document.getElementById('preview');
  if (preview) preview.hidden = false;

  // Header lines
  const nameEl = document.getElementById('pv-name');
  const headlineEl = document.getElementById('pv-headline');
  const metaEl = document.getElementById('pv-meta');

  if (settings.profileHeader) {
    if (nameEl) {
      nameEl.textContent = data?.name || '';
      nameEl.style.display = data?.name ? '' : 'none';
    }
    if (headlineEl) {
      headlineEl.textContent = data?.headline || '';
      headlineEl.style.display = data?.headline ? '' : 'none';
    }
    if (metaEl) {
      const parts = [
        data?.location,
        data?.slug ? `/in/${data.slug}` : '',
        data?.lastUpdatedISO
          ? `Exported: ${new Date(data.lastUpdatedISO).toLocaleString()}`
          : '',
      ].filter(Boolean);
      metaEl.textContent = parts.join(' · ');
      metaEl.style.display = parts.length ? '' : 'none';
    }
  } else {
    if (nameEl) nameEl.style.display = 'none';
    if (headlineEl) headlineEl.style.display = 'none';
    if (metaEl) metaEl.style.display = 'none';
  }

  // Contact block
  const contactUl = document.getElementById('pv-contact');
  const contactSection = contactUl && contactUl.closest('.preview__block');

  if (settings.contact) {
    if (contactSection) contactSection.hidden = false;
    if (contactUl) {
      contactUl.innerHTML = '';
      const c = data?.contact || {};
      const links = [];
      if (c.publicProfile) links.push(c.publicProfile);
      if (Array.isArray(c.websites)) links.push(...c.websites);
      links.forEach((href) => {
        if (!href) return;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = href;
        li.appendChild(a);
        contactUl.appendChild(li);
      });
    }
  } else {
    if (contactSection) contactSection.hidden = true;
  }
}

async function updateProfileBadge(data = {}) {
  const badge = document.getElementById('profileBadge');
  const avatarEl = badge?.querySelector('.profile-badge__avatar');
  const nameEl = document.getElementById('profileBadgeName');
  const urlEl = document.getElementById('profileBadgeUrl');
  const stateEl = document.getElementById('profileBadgeState');
  if (!badge || !nameEl || !urlEl || !stateEl) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const route = getLinkedInProfileRoute(tab?.url);
    if (!route) {
      badge.hidden = true;
      return;
    }

    const displayName =
      data?.header?.name ||
      data?.name ||
      humanizeProfileSlug(route.slug) ||
      'LinkedIn profile';
    badge.classList.toggle('profile-badge--ready', !route.isDetailsPage);
    badge.classList.toggle('profile-badge--route', route.isDetailsPage);
    nameEl.textContent = displayName;
    urlEl.textContent = `linkedin.com/in/${route.slug}`;
    stateEl.textContent = route.isDetailsPage ? 'goes to profile' : 'on profile';
    if (avatarEl) {
      const imageUrl = data?.profileImage || data?.header?.profileImage;
      if (imageUrl) {
        avatarEl.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, '\\"')}")`;
        avatarEl.classList.add('profile-badge__avatar--image');
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.classList.remove('profile-badge__avatar--image');
      }
    }
    badge.hidden = false;
  } catch (_e) {
    badge.classList.remove('profile-badge--ready', 'profile-badge--route');
    badge.hidden = true;
  }
}

// -------------------------
// Settings form
// -------------------------

function enforcePhotoDependency(form) {
  const chkHeader = form.elements.namedItem('profileHeader');
  const chkPhoto = form.elements.namedItem('withPhoto');
  if (!chkHeader || !chkPhoto) return;

  const enabled = !!chkHeader.checked;
  chkPhoto.disabled = !enabled;
  if (!enabled) chkPhoto.checked = false;
}

async function initSettingsForm() {
  const form = document.getElementById('settingsForm');
  const statusEl = document.getElementById('settingsStatus');
  const resetBtn = document.getElementById('resetBtn');

  const s = await loadSettings();
  for (const [key, val] of Object.entries(s)) {
    const input = form.elements.namedItem(key);
    if (input && input.type === 'checkbox') input.checked = !!val;
  }

  // Initial dependency: disable photo when header is off.
  enforcePhotoDependency(form);

  // When the user toggles "Profile Header", keep photo in sync.
  const chkHeader = form.elements.namedItem('profileHeader');

  // Note: dark mode is no longer a Settings checkbox. The header
  // switch (#headerDarkToggle) handles it independently — see
  // initHeaderDarkToggle().

  async function persistFormSettings(message = 'Saved.') {
    // Preserve darkMode (driven by the header switch, not this form).
    const current = await loadSettings();
    const next = { ...DEFAULT_SETTINGS, darkMode: !!current.darkMode };
    Array.from(form.elements).forEach((el) => {
      if (el.name && el.type === 'checkbox' && el.name !== 'darkMode') {
        next[el.name] = el.checked;
      }
    });

    if (!next.profileHeader) next.withPhoto = false;
    await saveSettings(next);
    statusEl.textContent = message;
    const data = await getProfileData();
    await updateProfileBadge(data);
    await renderPreview(data);
    setTimeout(() => (statusEl.textContent = ''), 1500);
  }

  form.addEventListener('change', async (e) => {
    const target = e.target;
    if (!target || target.type !== 'checkbox' || !target.name) return;
    if (target.name === 'profileHeader') enforcePhotoDependency(form);
    await persistFormSettings();
  });

  resetBtn.addEventListener('click', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS });
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      const input = form.elements.namedItem(key);
      if (input && input.type === 'checkbox') input.checked = !!val;
    }
    applyDarkMode(DEFAULT_SETTINGS.darkMode);
    const headerToggle = document.getElementById('headerDarkToggle');
    if (headerToggle) headerToggle.checked = !!DEFAULT_SETTINGS.darkMode;
    statusEl.textContent = 'Defaults restored.';
    const data = await getProfileData();
    await updateProfileBadge(data);
    await renderPreview(data);
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });
}

// Wires the header iOS-style switch. Persists the dark-mode flag
// immediately (no Save button required) and applies the body class
// for live preview.
async function initHeaderDarkToggle() {
  const toggle = document.getElementById('headerDarkToggle');
  if (!toggle) return;
  try {
    const s = await loadSettings();
    toggle.checked = !!s.darkMode;
    applyDarkMode(s.darkMode);
  } catch {}
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    applyDarkMode(enabled);
    try {
      const s = await loadSettings();
      await saveSettings({ ...s, darkMode: enabled });
    } catch (e) {
      console.error('[popup] persist darkMode failed:', e);
    }
  });
}

// -------------------------
// Footer (version from manifest)
// -------------------------
function initFooterVersion() {
  const versionEl = document.getElementById('footer-version');
  if (!versionEl) return;
  try {
    const m = chrome.runtime.getManifest && chrome.runtime.getManifest();
    if (m && m.version) versionEl.textContent = m.version;
  } catch (_e) {
    // chrome.runtime.getManifest is unavailable in odd test contexts;
    // leaving the placeholder is acceptable.
  }
}

function setMainExportButtonsDisabled(disabled) {
  const one = document.getElementById('exportPdf1PageBtn');
  const full = document.getElementById('exportPdfFullProfileBtn');
  if (one) one.disabled = !!disabled;
  if (full) full.disabled = !!disabled;
}

// -------------------------
// Export
// -------------------------

// Extracts the /in/<slug> identifier from a LinkedIn URL. Needed by the
// deep-export orchestrator to construct /details/<section>/ URLs for
// the same profile the user is currently viewing.
function sluggify(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/in\/([^\/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch (_e) {
    return undefined;
  }
}

// Sends a message to the background service worker and resolves with
// the response, rejecting on chrome.runtime.lastError.
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'Background message failed'));
        return;
      }
      resolve(resp);
    });
  });
}

async function getDeepExportJob(jobId) {
  const resp = await sendToBackground({
    type: 'GET_DEEP_EXPORT_JOB',
    jobId,
  });
  if (!resp?.ok) throw new Error(resp?.error || 'Deep export job lookup failed');
  return resp.job || null;
}

async function waitForDeepExportJob(jobId, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : 120000;
  const pollMs = typeof options.pollMs === 'number' ? options.pollMs : 800;
  const onProgress =
    typeof options.onProgress === 'function' ? options.onProgress : null;
  const started = Date.now();
  let lastPhase = '';

  while (Date.now() - started < timeoutMs) {
    const job = await getDeepExportJob(jobId);
    if (job) {
      const phaseKey = [
        job.status,
        job.phase,
        job.section,
        job.error,
        job.cancelRequested,
        job.nonce,
      ].join('|');
      if (phaseKey !== lastPhase) {
        lastPhase = phaseKey;
        if (onProgress) onProgress(job);
      }
      if (job.status === 'complete') return job;
      if (job.status === 'cancelled') return job;
      if (job.status === 'failed') {
        throw new Error(job.error || 'Deep export failed');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error('Deep export job timed out');
}

const DEEP_EXPORT_COUNTDOWN_START_SEC = 40;

let activeDeepExportJobId = null;
let deepExportCancelRequested = false;
let stopActiveDeepExportUi = null;

function deepExportPhaseMessage(msg) {
  if (!msg || msg.type !== 'DEEP_EXPORT_PROGRESS') return '';
  const { phase, label, ok, error, weight } = msg;
  const weightSuffix = weight ? ` (${weight})` : '';
  switch (phase) {
    case 'base_profile_reading':
      return 'Reading profile from the open tab...';
    case 'base_profile_done':
      return 'Base profile captured. Opening same-profile detail tabs...';
    case 'section_opening':
      return `Opening details: ${label || 'section'}${weightSuffix}…`;
    case 'section_reading':
      return `Reading: ${label || 'section'}${weightSuffix}…`;
    case 'section_failed':
      return `${label || 'Section'} could not be loaded. Continuing...`;
    case 'merging':
      return 'Merging profile data...';
    case 'opening_print_preview':
      return 'Opening print preview...';
    case 'cancelled':
      return 'Full Profile export cancelled.';
    case 'complete': {
      if (msg.skipPrint && ok) {
        return 'Full Profile export complete.';
      }
      if (
        ok &&
        msg.sectionsPlanned > 0 &&
        (!msg.improvedSections || msg.improvedSections.length === 0)
      ) {
        return (
          'Full Profile export finished, but selected detail tabs did not add more data than the open profile tab.'
        );
      }
      return ok ? 'Done.' : `Failed: ${error || 'Unknown error'}`;
    }
    default:
      return '';
  }
}

function setDeepExportCountdownText(secondsLeft) {
  const el = document.getElementById('deepExportCountdown');
  if (!el) return;
  if (secondsLeft > 0) {
    el.textContent = `Estimated time remaining: ${secondsLeft}s`;
  } else {
    el.textContent =
      'Still working... Large Experience or Education sections can take longer.';
  }
}

function requestDeepExportConfirmation() {
  const modal = document.getElementById('deepExportConfirmModal');
  const confirmBtn = document.getElementById('confirmDeepExportBtn');
  const cancelBtn = document.getElementById('cancelDeepConfirmBtn');
  if (!modal || !confirmBtn || !cancelBtn) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.hidden = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeydown);
      resolve(value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onKeydown = (event) => {
      if (event.key === 'Escape') finish(false);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeydown);
    modal.hidden = false;
    confirmBtn.focus();
  });
}

function setDeepExportRunningUi(running) {
  const fullBtn = document.getElementById('exportPdfFullProfileBtn');
  const cancelBtn = document.getElementById('cancelDeepExportBtn');
  if (fullBtn) {
    fullBtn.classList.toggle('btn--danger', !!running);
    const title = fullBtn.querySelector('.action-button__title');
    if (title) {
      title.textContent = running
        ? 'Export Full Profile PDF - Running'
        : 'Export Full Profile PDF';
    } else {
      fullBtn.textContent = running
        ? 'Export Full Profile PDF - Running'
        : 'Export Full Profile PDF';
    }
  }
  if (cancelBtn) {
    cancelBtn.hidden = !running;
    cancelBtn.disabled = !running;
    cancelBtn.textContent = 'Cancel Full Profile Export';
  }
}

async function cancelActiveDeepExport() {
  const cancelBtn = document.getElementById('cancelDeepExportBtn');
  const stepEl = document.getElementById('deepExportStep');
  deepExportCancelRequested = true;
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
  }
  if (stepEl) stepEl.textContent = 'Cancelling Full Profile export...';
  const resp = await sendToBackground({
    type: 'CANCEL_DEEP_EXPORT',
    jobId: activeDeepExportJobId || undefined,
  });
  if (!resp?.ok) {
    throw new Error(resp?.error || 'Could not cancel deep export');
  }
  if (!resp.job) {
    if (!activeDeepExportJobId) return;
    throw new Error('No active deep export job found to cancel');
  }
  activeDeepExportJobId = resp.job.jobId || activeDeepExportJobId;
  if (stepEl) stepEl.textContent = 'Full Profile export cancelled.';
  stopActiveDeepExportUi?.();
}

function teardownDeepExportUi() {
  setMainExportButtonsDisabled(false);
  setDeepExportRunningUi(false);
  activeDeepExportJobId = null;
  deepExportCancelRequested = false;
  stopActiveDeepExportUi = null;
  const panel = document.getElementById('deepExportPanel');
  if (panel) panel.hidden = true;
  const stepEl = document.getElementById('deepExportStep');
  const cdEl = document.getElementById('deepExportCountdown');
  if (stepEl) stepEl.textContent = '';
  if (cdEl) cdEl.textContent = '';
}

/**
 * @param {boolean} deep When true, run full-profile (deep) export via background.
 */
async function startExport(deep) {
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const useDeep = !!deep;

  // How long to keep the final status line visible before clearing.
  let clearDelay = 1500;
  let deepCountdownTimer = null;
  let deepCountdownSec = DEEP_EXPORT_COUNTDOWN_START_SEC;
  let deepPort = null;

  const stopDeepCountdown = () => {
    if (deepCountdownTimer != null) {
      clearInterval(deepCountdownTimer);
      deepCountdownTimer = null;
    }
  };

  const disconnectDeepPort = () => {
    try {
      deepPort?.disconnect();
    } catch (_e) {
      // ignore
    }
    deepPort = null;
  };
  if (useDeep) {
    stopActiveDeepExportUi = () => {
      stopDeepCountdown();
      disconnectDeepPort();
      progress?.setAttribute('aria-hidden', 'true');
      setDeepExportRunningUi(false);
      if (status) {
        status.removeAttribute('role');
        status.textContent = 'Full Profile export cancelled.';
      }
    };
  }

  try {
    const settings = await loadSettings();
    if (useDeep) {
      const confirmed = await requestDeepExportConfirmation();
      if (!confirmed) return;
      deepExportCancelRequested = false;
    }

    status.textContent = useDeep ? '' : 'Extracting profile...';
    progress?.setAttribute('aria-hidden', 'false');

    let resp;
    let stepEl = null;
    if (useDeep) {
      const panel = document.getElementById('deepExportPanel');
      stepEl = document.getElementById('deepExportStep');
      if (panel) panel.hidden = false;
      setDeepExportRunningUi(true);
      if (stepEl) {
        stepEl.textContent =
          'Preparing Full Profile export. The job will continue if this popup closes.';
      }
      setMainExportButtonsDisabled(true);

      deepPort = chrome.runtime.connect({ name: 'lnpDeepExport' });
      deepCountdownSec = DEEP_EXPORT_COUNTDOWN_START_SEC;
      setDeepExportCountdownText(deepCountdownSec);
      deepCountdownTimer = setInterval(() => {
        deepCountdownSec = Math.max(0, deepCountdownSec - 1);
        setDeepExportCountdownText(deepCountdownSec);
      }, 1000);

      deepPort.onMessage.addListener((msg) => {
        if (msg?.type !== 'DEEP_EXPORT_PROGRESS') return;
        const line = deepExportPhaseMessage(msg);
        if (line && stepEl) stepEl.textContent = line;
      });

      // Route through the background orchestrator so it can drive
      // multiple tabs. The content script must already be alive in the
      // active tab for the base extraction step.
      const tab = await getActiveLinkedInTab();
      const ready = await ensureContentReady(tab.id);
      if (!ready) {
        throw new Error('Content script not available in this tab.');
      }
      const slug = sluggify(tab.url);
      const startResp = await sendToBackground({
        type: 'START_DEEP_EXPORT',
        originalTabId: tab.id,
        slug,
        settings,
      });
      if (!startResp?.ok || !startResp.jobId) {
        throw new Error(startResp?.error || 'Export failed');
      }
      activeDeepExportJobId = startResp.jobId;
      if (deepExportCancelRequested) {
        await cancelActiveDeepExport();
      }
      resp = await waitForDeepExportJob(startResp.jobId, {
        timeoutMs: 120000,
        onProgress: (job) => {
          const line = deepExportPhaseMessage({
            type: 'DEEP_EXPORT_PROGRESS',
            ...job,
          });
          if (line && stepEl) stepEl.textContent = line;
        },
      });
    } else {
      // Classic single-page flow: content script extracts and opens
      // the print preview itself.
      const tab = await getActiveLinkedInTab();
      resp = await sendToBackground({
        type: 'START_SINGLE_PAGE_EXPORT',
        tabId: tab.id,
        settings,
      });
    }

    if (!resp?.ok) {
      if (useDeep && resp?.status === 'cancelled') {
        clearDelay = Math.max(clearDelay, 5000);
        if (stepEl) stepEl.textContent = 'Full Profile export cancelled.';
        status.textContent = 'Full Profile export cancelled.';
        return;
      }
      throw new Error(resp?.error || 'Export failed');
    }

    if (
      useDeep &&
      resp.sectionsPlanned > 0 &&
      (!resp.improvedSections || resp.improvedSections.length === 0)
    ) {
      clearDelay = Math.max(clearDelay, 8000);
      if (stepEl) {
        stepEl.textContent =
          'Full Profile export finished, but selected detail tabs did not add more data than the open profile tab.';
      }
    }

    status.textContent = useDeep ? '' : 'Opening print preview...';
  } catch (err) {
    console.error('[popup] Export error', err);
    const lastErr =
      chrome.runtime.lastError?.message || String(err?.message || err || '');
    const handledDelay = applyExportErrorToStatus(
      status,
      err || new Error(lastErr),
    );
    if (handledDelay != null) {
      clearDelay = Math.max(clearDelay, handledDelay);
    } else {
      status.textContent = `Export failed: ${lastErr}`;
    }
  } finally {
    stopDeepCountdown();
    disconnectDeepPort();
    setTimeout(() => {
      status.textContent = '';
      status.removeAttribute('role');
      progress?.setAttribute('aria-hidden', 'true');
      teardownDeepExportUi();
    }, clearDelay);
  }
}

// -------------------------
// Init
// -------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Apply dark mode BEFORE the first paint to avoid the light-flash.
  // We re-read the same value inside initSettingsForm to seed the
  // checkbox; doing it twice is cheap and avoids a separate listener.
  try {
    const s = await loadSettings();
    applyDarkMode(s.darkMode);
  } catch (_e) {}

  initTabs();
  initFooterVersion();
  await initHeaderDarkToggle();
  await initSettingsForm();

  // Initial preview
  const data = await getProfileData();
  await updateProfileBadge(data);
  await renderPreview(data);

  document
    .getElementById('exportPdf1PageBtn')
    ?.addEventListener('click', () => startExport(false));
  document
    .getElementById('exportPdfFullProfileBtn')
    ?.addEventListener('click', () => startExport(true));
  document
    .getElementById('cancelDeepExportBtn')
    ?.addEventListener('click', () => {
      cancelActiveDeepExport().catch((err) => {
        const status = document.getElementById('status');
        if (status) {
          status.setAttribute('role', 'alert');
          status.textContent = `Cancel failed: ${String(err?.message || err)}`;
        }
      });
    });

});
