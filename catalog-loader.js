(() => {
  const grid = document.getElementById('libraryGrid');
  const continueRow = document.getElementById('continueReading');
  const search = document.getElementById('librarySearch');
  const filters = document.getElementById('libraryFilters');
  const sourceUrl = document.getElementById('sourceUrl');
  const openUrlButton = document.getElementById('openUrlButton');
  if (!grid || !continueRow || !search || !sourceUrl || !openUrlButton) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const COVER_CACHE = 'comics-cover-cache-v2';
  let catalog = [];
  let activeFilter = 'all';
  let pdfjsPromise = null;
  const renderedCovers = new Set();

  const progressFor = id => {
    try {
      const all = JSON.parse(localStorage.getItem('comics_catalog_progress') || '{}');
      return all[id] || { page: 0, total: 0, percent: 0 };
    } catch { return { page: 0, total: 0, percent: 0 }; }
  };

  function openItem(item) {
    sourceUrl.value = item.url;
    localStorage.setItem('comics_last_catalog_id', item.id);
    openUrlButton.click();
  }

  function immediateCoverUrl(item) {
    if (item.cover) return item.cover;
    if (item.driveFileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(item.driveFileId)}&sz=w720`;
    return '';
  }

  function coverMarkup(item) {
    const initials = (item.title || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    const directCover = immediateCoverUrl(item);
    return `
      <div class="kindle-cover-art" data-seed="${escapeHtml(item.id)}">
        <canvas class="kindle-cover-canvas" data-cover-id="${escapeHtml(item.id)}" aria-label="Couverture de ${escapeHtml(item.title)}"></canvas>
        <img class="kindle-cover-image" data-cover-id="${escapeHtml(item.id)}" alt="Couverture de ${escapeHtml(item.title)}"${directCover ? ` src="${escapeHtml(directCover)}"` : ' hidden'}>
        <div class="kindle-cover-fallback"><span>${escapeHtml(initials)}</span><small>${escapeHtml(item.volume ? `TOME ${item.volume}` : item.format.toUpperCase())}</small></div>
      </div>`;
  }

  function cardMarkup(item, compact = false) {
    const progress = progressFor(item.id);
    const label = progress.percent > 0 ? `Reprendre à ${Math.round(progress.percent)} %` : 'Lire';
    return `
      <article class="kindle-book-card${compact ? ' compact' : ''}" tabindex="0" data-id="${escapeHtml(item.id)}">
        <div class="kindle-cover-wrap">
          ${coverMarkup(item)}
          <span class="kindle-format">${escapeHtml((item.format || 'pdf').toUpperCase())}</span>
          ${progress.percent > 0 ? `<div class="cover-progress"><i style="width:${Math.min(100, progress.percent)}%"></i></div>` : ''}
        </div>
        <div class="kindle-book-meta">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.volume ? `Tome ${item.volume} · ${item.subtitle || ''}` : item.subtitle || '')}</p>
          ${item.authors ? `<small>${escapeHtml(item.authors)}</small>` : ''}
          <button type="button" class="kindle-read-button">${label}</button>
        </div>
      </article>`;
  }

  async function pdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then(module => {
        module.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        return module;
      });
    }
    return pdfjsPromise;
  }

  function showCover(container, type) {
    container.classList.add('cover-ready');
    container.classList.toggle('cover-is-image', type === 'image');
    container.classList.toggle('cover-is-canvas', type === 'canvas');
  }

  function cacheKey(item) {
    return new Request(`${location.origin}/.cover-cache/${encodeURIComponent(item.id)}.jpg`);
  }

  async function loadCachedCover(item, container) {
    if (!('caches' in window)) return false;
    const response = await (await caches.open(COVER_CACHE)).match(cacheKey(item));
    if (!response) return false;
    const image = container.querySelector('.kindle-cover-image');
    if (!image) return false;
    image.src = URL.createObjectURL(await response.blob());
    image.hidden = false;
    showCover(container, 'image');
    return true;
  }

  async function saveCanvasCover(item, canvas) {
    if (!('caches' in window)) return;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84));
    if (!blob) return;
    await (await caches.open(COVER_CACHE)).put(cacheKey(item), new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
  }

  async function renderPdfCover(item, container) {
    const canvas = container.querySelector('.kindle-cover-canvas');
    if (!canvas) return;
    const module = await pdfjs();
    const document = await module.getDocument({ url: item.url }).promise;
    try {
      const page = await document.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = Math.max(360, Math.round(container.clientWidth * Math.min(devicePixelRatio || 1, 2)));
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
      showCover(container, 'canvas');
      saveCanvasCover(item, canvas).catch(() => {});
    } finally {
      await document.destroy();
    }
  }

  async function renderEpubCover(item, container) {
    const image = container.querySelector('.kindle-cover-image');
    if (!image || typeof window.ePub !== 'function') return;
    if (image.src) {
      try {
        await image.decode();
        image.hidden = false;
        showCover(container, 'image');
        return;
      } catch {}
    }
    const book = window.ePub(item.url);
    try {
      await book.ready;
      const coverUrl = await book.coverUrl();
      if (!coverUrl) return;
      image.src = coverUrl;
      await image.decode();
      image.hidden = false;
      showCover(container, 'image');
    } finally {
      setTimeout(() => { try { book.destroy(); } catch {} }, 1000);
    }
  }

  async function hydrateCover(item, container) {
    const key = `${item.id}:${container.closest('.kindle-book-card')?.classList.contains('compact') ? 'compact' : 'grid'}`;
    if (renderedCovers.has(key)) return;
    renderedCovers.add(key);
    try {
      if (await loadCachedCover(item, container)) return;
      if ((item.format || '').toLowerCase() === 'epub') await renderEpubCover(item, container);
      else await renderPdfCover(item, container);
    } catch (error) {
      console.warn(`Couverture indisponible pour ${item.title}`, error);
      container.classList.add('cover-failed');
    }
  }

  function hydrateAllCovers(container) {
    const jobs = [...container.querySelectorAll('.kindle-cover-art')].map(cover => ({
      cover,
      item: catalog.find(entry => entry.id === cover.closest('.kindle-book-card')?.dataset.id)
    })).filter(job => job.item);
    let index = 0;
    const worker = async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        await hydrateCover(job.item, job.cover);
      }
    };
    Promise.all([worker(), worker(), worker()]).catch(() => {});
  }

  function bindCards(container) {
    container.querySelectorAll('.kindle-book-card').forEach(card => {
      const item = catalog.find(entry => entry.id === card.dataset.id);
      if (!item) return;
      card.addEventListener('click', () => openItem(item));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openItem(item);
        }
      });
      const image = card.querySelector('.kindle-cover-image[src]');
      if (image) {
        image.addEventListener('load', () => showCover(image.closest('.kindle-cover-art'), 'image'), { once: true });
        image.addEventListener('error', () => { image.hidden = true; }, { once: true });
      }
    });
    requestAnimationFrame(() => hydrateAllCovers(container));
  }

  function render() {
    renderedCovers.clear();
    const query = search.value.trim().toLocaleLowerCase('fr');
    const filtered = catalog.filter(item => {
      const text = `${item.title} ${item.subtitle || ''} ${item.authors || ''} ${item.volume || ''}`.toLocaleLowerCase('fr');
      const matchesSearch = !query || text.includes(query);
      const progress = progressFor(item.id);
      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'reading' && progress.percent > 0 && progress.percent < 100)
        || (activeFilter === 'unread' && !progress.percent)
        || (activeFilter === 'finished' && progress.percent >= 100);
      return matchesSearch && matchesFilter;
    });

    const inProgress = catalog.filter(item => {
      const progress = progressFor(item.id);
      return progress.percent > 0 && progress.percent < 100;
    });

    continueRow.innerHTML = inProgress.length
      ? inProgress.map(item => cardMarkup(item, true)).join('')
      : '<div class="kindle-empty"><strong>Aucune lecture en cours</strong><span>Ouvrez un album pour le retrouver ici.</span></div>';

    grid.innerHTML = filtered.length
      ? filtered.map(item => cardMarkup(item)).join('')
      : '<div class="kindle-empty"><strong>Aucun livre trouvé</strong><span>Essayez une autre recherche ou un autre filtre.</span></div>';

    bindCards(continueRow);
    bindCards(grid);
    document.getElementById('libraryCount').textContent = `${catalog.length} livre${catalog.length > 1 ? 's' : ''}`;
  }

  search.addEventListener('input', render);
  filters?.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  });

  fetch('./catalog.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
      return response.json();
    })
    .then(data => {
      catalog = Array.isArray(data) ? data : [];
      render();
    })
    .catch(error => {
      console.error('Impossible de charger le catalogue', error);
      grid.innerHTML = '<div class="kindle-empty"><strong>Catalogue indisponible</strong><span>Rechargez la page pour réessayer.</span></div>';
    });
})();
