(() => {
  const TIMEOUT_MS = 25000;
  let startedAt = 0;
  let activeFormat = '';
  let timer = 0;
  let completed = true;

  const byId = id => document.getElementById(id);
  const isVisible = element => element && !element.hidden && element.getClientRects().length > 0;

  function setLoadingControls() {
    const pageNumber = byId('pageNumber');
    const pageCount = byId('pageCount');
    const slider = byId('pageSlider');
    const previous = byId('previousButton');
    const next = byId('nextButton');
    if (pageNumber) pageNumber.value = '1';
    if (pageCount && (!pageCount.textContent.trim() || pageCount.textContent.trim() === '0')) pageCount.textContent = '…';
    if (slider) { slider.value = '1'; slider.max = '1'; slider.disabled = true; }
    if (previous) previous.disabled = true;
    if (next) next.disabled = true;
  }

  function begin(format = '') {
    clearTimeout(timer);
    startedAt = performance.now();
    activeFormat = String(format || '').toLowerCase();
    completed = false;
    setLoadingControls();
    try {
      localStorage.setItem('comics_last_render_state', 'loading');
      localStorage.setItem('comics_last_render_format', activeFormat || 'unknown');
    } catch {}
    timer = window.setTimeout(showTimeout, TIMEOUT_MS);
  }

  function firstRenderReady() {
    const canvas = byId('pdfCanvas');
    const epub = byId('epubViewer');
    if (activeFormat === 'pdf') return isVisible(canvas) && canvas.width > 0 && canvas.height > 0;
    if (activeFormat === 'epub') return isVisible(epub) && Boolean(epub.querySelector('iframe, .epub-view, [class*="epub"]'));
    return (isVisible(canvas) && canvas.width > 0 && canvas.height > 0)
      || (isVisible(epub) && epub.childElementCount > 0);
  }

  function finish() {
    if (completed || !startedAt || !firstRenderReady()) return;
    completed = true;
    clearTimeout(timer);
    const elapsed = Math.round(performance.now() - startedAt);
    const slider = byId('pageSlider');
    if (slider) slider.disabled = false;
    try {
      localStorage.setItem('comics_last_first_render_ms', String(elapsed));
      localStorage.setItem('comics_last_render_state', 'ready');
    } catch {}
  }

  function showTimeout() {
    if (completed || firstRenderReady()) return finish();
    completed = true;
    const state = byId('emptyState');
    if (state) {
      state.hidden = false;
      state.innerHTML = '<strong>Le chargement prend trop de temps</strong><span>Revenez à la bibliothèque puis relancez le livre. Vérifiez aussi la connexion réseau.</span>';
    }
    const pageCount = byId('pageCount');
    if (pageCount && pageCount.textContent.trim() === '0') pageCount.textContent = '—';
    try {
      localStorage.setItem('comics_last_first_render_ms', String(TIMEOUT_MS));
      localStorage.setItem('comics_last_render_state', 'timeout');
    } catch {}
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const badge = card.querySelector('.kindle-format');
    begin(badge?.textContent || '');
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id !== 'sourceFile') return;
    const file = event.target.files?.[0];
    begin(file?.name?.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf');
  }, true);

  const observer = new MutationObserver(() => {
    if (completed) return;
    const count = byId('pageCount');
    if (count && count.textContent.trim() === '0') count.textContent = '…';
    requestAnimationFrame(finish);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['hidden', 'style', 'class'] });
})();
