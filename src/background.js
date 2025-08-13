chrome.runtime.onInstalled.addListener(() => {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'public/icons/icon128.png',
    title: 'LinkedIn Save to PDF',
    message:
      'Please refresh LinkedIn tabs or restart Chrome to activate the extension.',
  });
});
