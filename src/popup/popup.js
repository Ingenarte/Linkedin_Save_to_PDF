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
};

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
    });
  });
}

// -------------------------
// Active tab messaging (robust)
// -------------------------
function isLinkedInProfileUrl(url) {
  return /^https:\/\/([a-z]+\.)?linkedin\.com\/(in|profile)\//i.test(url || '');
}

async function getActiveLinkedInTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isLinkedInProfileUrl(tab.url)) {
    throw new Error('Open a LinkedIn profile tab and try again.');
  }
  return tab;
}

// Optional ping to verify the content script is alive.
// If you prefer, you may inject files here with chrome.scripting as a fallback.
async function ensureContentReady(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING_LNP' });
    return true;
  } catch (_e) {
    // If needed, you can inject content scripts here with chrome.scripting.executeScript.
    // For now, just return false so the caller can surface a helpful error.
    return false;
  }
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
  try {
    const resp = await sendToActiveTab({ type: 'EXTRACT_PROFILE' });
    return resp || {};
  } catch (err) {
    console.error('[popup] getProfileData error:', err);
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

  // Aplica dependencia inicial (deshabilita foto si header está off)
  enforcePhotoDependency(form);

  // Reacciona cuando el usuario cambia "Profile Header"
  const chkHeader = form.elements.namedItem('profileHeader');
  if (chkHeader) {
    chkHeader.addEventListener('change', () => enforcePhotoDependency(form));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = { ...DEFAULT_SETTINGS };
    Array.from(form.elements).forEach((el) => {
      if (el.name && el.type === 'checkbox') next[el.name] = el.checked;
    });

    if (!next.profileHeader) next.withPhoto = false;
    await saveSettings(next);
    statusEl.textContent = 'Saved.';
    const data = await getProfileData();
    await renderPreview(data);
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });

  resetBtn.addEventListener('click', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS });
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      const input = form.elements.namedItem(key);
      if (input && input.type === 'checkbox') input.checked = !!val;
    }
    statusEl.textContent = 'Defaults restored.';
    const data = await getProfileData();
    await renderPreview(data);
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });
}

// -------------------------
// Export
// -------------------------
async function startExport() {
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');

  // control de limpieza diferida del mensaje
  let clearDelay = 1500;

  try {
    status.textContent = 'Extracting profile...';
    progress?.setAttribute('aria-hidden', 'false');

    const settings = await loadSettings();

    const resp = await sendToActiveTab({
      type: 'START_EXPORT',
      settings,
    });

    if (!resp?.ok) {
      throw new Error(resp?.error || 'START_EXPORT failed');
    }

    status.textContent = 'Opening print preview...';
  } catch (err) {
    console.error('[popup] Export error', err);
    const lastErr = chrome.runtime.lastError?.message || String(err || '');

    // Detecta el caso solicitado
    const isContentMissing = /Content script not available in this tab\./i.test(
      lastErr
    );

    if (isContentMissing) {
      // Mensaje centrado, rojo y negrita
      status.setAttribute('role', 'alert');
      status.innerHTML =
        '<strong style="color:#c00;display:block;text-align:center">Refresh tab or restart browser</strong>';
      clearDelay = 4000; // deja el mensaje visible un poco mas
    } else {
      status.textContent = `Export failed: ${lastErr}`;
    }
  } finally {
    setTimeout(() => {
      status.textContent = '';
      progress?.setAttribute('aria-hidden', 'true');
    }, clearDelay);
  }
}

// -------------------------
// Init
// -------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await initSettingsForm();

  // Initial preview
  const data = await getProfileData();
  await renderPreview(data);

  // Export button
  const exportBtn = document.getElementById('exportBtn');
  exportBtn?.addEventListener('click', startExport);
});
