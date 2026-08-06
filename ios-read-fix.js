(() => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  const EPUB_CACHE = 'comics-epub-files-v1';
  const zoomScript = document.createElement('script');
  zoomScript.src = 'ios-pinch-pan.js';
  zoomScript.defer = true;
  document.head.appendChild(zoomScript);

  let catalog = [];
  let opening = false;
  let activeItem = null;

  fetch('./catalog.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : [])
    .then(data => { catalog = Array.isArray(data) ? data : []; })
    .catch(() => {});

  function fullTitle(item) {
    if (!item) return '';
    return [item.title, item.volume ? `Tome ${item.volume}` : '', item.subtitle || '']
      .filter(Boolean)
      .join(' · ');
  }

  function rememberItem(item) {
    if (!item) return;
    activeItem = item;
    try {
      localStorage.setItem('comics_active_catalog_item', JSON.stringify({
        id: item.id,
        title: item.title,
        volume: item.volume || '',
        subtitle: item.subtitle || '',
        authors: item.authors || '',
        format: item.format || '',
        url: item.url || ''
      }));
    } catch {}
    applyTitle(item);
  }

  function applyTitle(item = activeItem) {
    if (!item) return;
    const title = fullTitle(item) || item.title;
    const heading = document.getElementById('comicTitle');
    if (heading && heading.textContent !== title) heading.textContent = title;
    if (document.title !== title) document.title = title;
  }

  try {
    const saved = JSON.parse(localStorage.getItem('comics_active_catalog_item') || 'null');
    if (saved?.title) activeItem = saved;
  } catch {}

  const titleObserver = new MutationObserver(() => {
    if (!activeItem || !document.getElementById('readerView')?.classList.contains('active-view')) return;
    const heading = document.getElementById('comicTitle');
    if (!heading) return;
    const wrong = !heading.textContent.trim()
      || /^download(?:\.pdf|\.epub)?$/i.test(heading.textContent.trim())
      || /^document$/i.test(heading.textContent.trim());
    if (wrong || heading.textContent !== fullTitle(activeItem)) applyTitle(activeItem);
  });
  titleObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  const showReader = (title, message, detail = '') => {
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active-view', view.id === 'readerView'));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'reader'));
    document.body.classList.add('reading-mode');
    const heading = document.getElementById('comicTitle');
    const state = document.getElementById('emptyState');
    if (heading && title) heading.textContent = title;
    if (state) {
      state.hidden = false;
      state.innerHTML = `<strong>${message}</strong>${detail ? `<span>${detail}</span>` : ''}`;
    }
  };

  const cacheKey = item => new Request(`${location.origin}/.epub-cache/${encodeURIComponent(item.id)}.epub`);

  async function hasZipSignature(blob) {
    if (!blob || blob.size < 1000) return false;
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return signature[0] === 0x50 && signature[1] === 0x4b;
  }

  async function cachedBlob(item) {
    if (!('caches' in window)) return null;
    const cache = await caches.open(EPUB_CACHE);
    const key = cacheKey(item);
    const response = await cache.match(key);
    if (!response) return null;
    const blob = await response.blob();
    if (await hasZipSignature(blob)) return blob;
    await cache.delete(key);
    return null;
  }

  async function saveBlob(item, blob) {
    if (!('caches' in window) || !(await hasZipSignature(blob))) return;
    await (await caches.open(EPUB_CACHE)).put(
      cacheKey(item),
      new Response(blob, { headers: { 'Content-Type': 'application/epub+zip' } })
    );
  }

  async function downloadBlob(item, signal) {
    const cached = await cachedBlob(item).catch(() => null);
    if (cached) return { blob: cached, cached: true };

    const response = await fetch(item.url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal
    });
    if (!response.ok) throw new Error(`Téléchargement refusé (${response.status})`);
    const blob = await response.blob();
    if (!(await hasZipSignature(blob))) throw new Error('Google Drive n’a pas renvoyé un EPUB valide.');
    saveBlob(item, blob).catch(() => {});
    return { blob, cached: false };
  }

  async function openEpub(item) {
    if (opening) return;
    opening = true;
    const startedAt = performance.now();
    rememberItem(item);
    showReader(fullTitle(item), 'Ouverture de l’EPUB…', 'Recherche d’une copie locale.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await downloadBlob(item, controller.signal);
      const blob = result.blob;
      showReader(fullTitle(item), 'Préparation de l’EPUB…', result.cached ? 'Copie locale trouvée.' : 'Téléchargement terminé.');

      const safeName = `${String(item.title || 'livre').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.epub`;
      const file = new File([blob], safeName, { type: 'application/epub+zip' });
      const input = document.getElementById('sourceFile');
      if (!input) throw new Error('Le sélecteur de fichier du lecteur est absent.');

      localStorage.setItem('comics_last_catalog_id', item.id);
      localStorage.setItem('comics_last_open_ms', String(Math.round(performance.now() - startedAt)));
      localStorage.setItem('comics_last_open_source', result.cached ? 'cache' : 'network');
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => applyTitle(item), 50);
      setTimeout(() => applyTitle(item), 500);
      setTimeout(() => applyTitle(item), 1800);
    } catch (error) {
      const detail = error?.name === 'AbortError'
        ? 'Le téléchargement a dépassé 30 secondes.'
        : (error?.message || 'Safari n’a pas pu ouvrir ce livre.');
      showReader(fullTitle(item), 'Impossible d’ouvrir ce livre', detail);
    } finally {
      clearTimeout(timer);
      opening = false;
    }
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const item = catalog.find(entry => entry.id === card.dataset.id);
    if (!item) return;
    rememberItem(item);

    if (String(item.format).toLowerCase() !== 'epub') {
      setTimeout(() => applyTitle(item), 0);
      setTimeout(() => applyTitle(item), 300);
      setTimeout(() => applyTitle(item), 1200);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    openEpub(item);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const item = catalog.find(entry => entry.id === card.dataset.id);
    if (!item) return;
    rememberItem(item);
    if (String(item.format).toLowerCase() !== 'epub') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openEpub(item);
  }, true);
})();
