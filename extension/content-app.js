(() => {
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.type !== 'COMICS_IMPORT_MRM') return;
    chrome.runtime.sendMessage({ type: 'IMPORT_MRM', url: event.data.url }, response => {
      window.postMessage({
        type: 'COMICS_IMPORT_MRM_RESULT',
        ok: Boolean(response?.ok),
        message: response?.message || chrome.runtime.lastError?.message || 'Échec de l’import.'
      }, '*');
    });
  });

  window.postMessage({ type: 'COMICS_EXTENSION_READY' }, '*');
})();
