// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-journal',
    title: 'Save to Research Journal',
    contexts: ['selection'],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-journal') return;

  // Store the captured data for the popup to read
  await chrome.storage.local.set({
    pendingCapture: {
      quote: info.selectionText || '',
      pageTitle: tab?.title || '',
      pageUrl: tab?.url || '',
      timestamp: new Date().toISOString(),
    },
  });

  // Open the popup
  chrome.action.openPopup();
});