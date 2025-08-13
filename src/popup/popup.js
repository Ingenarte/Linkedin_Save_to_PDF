// Popup logic: show a LinkedIn-blue progress animation while working,
// and display "Refresh tab or restart Chrome" when we can't proceed.

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
function isLinkedInProfile(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith('linkedin.com') &&
      (u.pathname.startsWith('/in/') || u.pathname.startsWith('/profile/'))
    );
  } catch {
    return false;
  }
}

const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

function showProgress(on) {
  if (!progressEl) return;
  progressEl.setAttribute('aria-hidden', on ? 'false' : 'true');
}
function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
}

document.getElementById('exportBtn')?.addEventListener('click', async () => {
  setStatus('Reading LinkedIn page…');
  showProgress(true);

  const tab = await getActiveTab();
  if (!tab?.id || !isLinkedInProfile(tab.url)) {
    showProgress(false);
    setStatus('Refresh tab or restart Chrome', true);
    return;
  }

  // Ask the content script to extract the profile
  chrome.tabs.sendMessage(
    tab.id,
    { type: 'EXTRACT_PROFILE', tabUrl: tab.url },
    async (data) => {
      if (chrome.runtime.lastError || !data) {
        showProgress(false);
        setStatus('Refresh tab or restart Chrome', true);
        return;
      }
      if (!data.name) {
        showProgress(false);
        setStatus('Refresh tab or restart Chrome', true);
        return;
      }

      // Success: store and open print view
      const nonce = `profile-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      await chrome.storage.local.set({ [nonce]: data });
      const printUrl = chrome.runtime.getURL(
        `src/print/print.html?nonce=${encodeURIComponent(nonce)}`
      );
      await chrome.tabs.create({ url: printUrl });

      // Hide progress after opening print tab
      showProgress(false);
      setStatus('');
    }
  );
});
