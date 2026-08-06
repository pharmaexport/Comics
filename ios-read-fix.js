(() => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  let catalog = [];
  let opening = false;

  fetch('./catalog.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : [])
    .then(data => { catalog = Array.isArray(data) ? data : []; })
    .catch(() => {});

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

  async function openEpub(item) {
    if (opening) return;
    opening = true;
    showReader(item.title, 'Ouverture de l’EPUB…', 'Téléchargement sécurisé pour Safari.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(item.url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Téléchargement refusé (${response.status})`);
      const blob = await response.blob();
      if (blob.size < 1000) throw new Error('Le fichier reçu est vide.');

      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
      if (!isZip) throw new Error('Google Drive n’a pas renvoyé un EPUB valide.');

      const safeName = `${String(item.title || 'livre').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.epub`;
      const file = new File([blob], safeName, { type: 'application/epub+zip' });
      const input = document.getElementById('sourceFile');
      if (!input) throw new Error('Le sélecteur de fichier du lecteur est absent.');

      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      const detail = error?.name === 'AbortError'
        ? 'Le téléchargement a dépassé 30 secondes.'
        : (error?.message || 'Safari n’a pas pu ouvrir ce livre.');
      showReader(item.title, 'Impossible d’ouvrir ce livre', detail);
    } finally {
      clearTimeout(timer);
      opening = false;
    }
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const item = catalog.find(entry => entry.id === card.dataset.id);
    if (!item || String(item.format).toLowerCase() !== 'epub') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openEpub(item);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const item = catalog.find(entry => entry.id === card.dataset.id);
    if (!item || String(item.format).toLowerCase() !== 'epub') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openEpub(item);
  }, true);
})();
