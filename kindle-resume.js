(() => {
  const KEY = 'comics_catalog_progress';
  const LAST_ID = 'comics_last_catalog_id';
  const pageInput = document.getElementById('pageNumber');
  const pageCount = document.getElementById('pageCount');
  const sourceUrl = document.getElementById('sourceUrl');
  const emptyState = document.getElementById('emptyState');
  if (!pageInput || !pageCount || !sourceUrl) return;

  let restoring = false;
  let lastSavedPage = 0;
  let saveTimer = null;

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  }

  function activeId() {
    return localStorage.getItem(LAST_ID) || sourceUrl.value || 'document-courant';
  }

  function saveProgress() {
    if (restoring) return;
    const id = activeId();
    const page = Math.max(1, Number(pageInput.value) || 1);
    const total = Math.max(0, Number(pageCount.textContent) || 0);
    if (!id || !total || page === lastSavedPage) return;
    lastSavedPage = page;
    const all = readAll();
    all[id] = {
      page,
      total,
      percent: Math.min(100, Math.max(0, (page / total) * 100)),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('comics-progress-updated', { detail: { id, ...all[id] } }));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 180);
  }

  async function restoreProgress(id) {
    const saved = readAll()[id];
    if (!saved?.page || saved.page <= 1) return;
    restoring = true;
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.innerHTML = `<strong>Reprise de la lecture…</strong><span>Retour à la page ${saved.page}.</span>`;
    }

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const total = Number(pageCount.textContent) || 0;
      if (total > 0) {
        const target = Math.min(total, Math.max(1, Number(saved.page) || 1));
        pageInput.value = String(target);
        pageInput.dispatchEvent(new Event('change', { bubbles: true }));
        lastSavedPage = target;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    restoring = false;
  }

  function prepareOpen(card) {
    const id = card?.dataset?.id;
    if (!id) return;
    localStorage.setItem(LAST_ID, id);
    setTimeout(() => restoreProgress(id), 80);
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('.kindle-book-card');
    if (card) prepareOpen(card);
  }, true);

  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.kindle-book-card')) {
      prepareOpen(event.target.closest('.kindle-book-card'));
    }
  }, true);

  pageInput.addEventListener('change', scheduleSave);
  document.getElementById('previousButton')?.addEventListener('click', () => setTimeout(scheduleSave, 250));
  document.getElementById('nextButton')?.addEventListener('click', () => setTimeout(scheduleSave, 250));
  document.getElementById('pageSlider')?.addEventListener('change', () => setTimeout(scheduleSave, 250));

  const observer = new MutationObserver(scheduleSave);
  observer.observe(pageInput, { attributes: true, attributeFilter: ['value'] });
  observer.observe(pageCount, { childList: true, characterData: true, subtree: true });

  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress();
  });
})();
