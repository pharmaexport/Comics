(() => {
  const LOCATION_CACHE_PREFIX = 'comics_epub_locations_v1:';
  const warmed = new Set();

  const hash = value => {
    let h = 2166136261;
    const text = String(value || 'epub');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  };

  // EPUB.js calcule normalement toutes les positions avant le premier affichage.
  // On restaure un index déjà calculé, sinon on affiche d’abord le livre et
  // on génère l’index pendant une période d’inactivité.
  if (typeof window.ePub === 'function' && !window.ePub.__comicsFastWrapped) {
    const originalEpub = window.ePub;
    const fastEpub = function(input, options) {
      const book = originalEpub(input, options);
      const sourceKey = typeof input === 'string' ? input : `buffer:${input?.byteLength || Date.now()}`;
      const cacheKey = `${LOCATION_CACHE_PREFIX}${hash(sourceKey)}`;

      const patchLocations = () => {
        const locations = book.locations;
        if (!locations || locations.__comicsFastPatched) return;
        locations.__comicsFastPatched = true;

        const originalGenerate = locations.generate.bind(locations);
        let generationPromise = null;
        const saved = localStorage.getItem(cacheKey);

        if (saved) {
          try { locations.load(saved); } catch { localStorage.removeItem(cacheKey); }
        }

        locations.generate = async (...args) => {
          if (locations.length?.() > 1) return locations._locations || [];

          if (!generationPromise) {
            generationPromise = new Promise(resolve => {
              const run = async () => {
                try {
                  await originalGenerate(...args);
                  const serialized = locations.save?.();
                  if (serialized) localStorage.setItem(cacheKey, serialized);
                  window.dispatchEvent(new CustomEvent('comics-epub-index-ready', {
                    detail: { count: locations.length?.() || 0 }
                  }));
                } catch (error) {
                  console.warn('Index EPUB différé indisponible', error);
                } finally {
                  resolve(locations._locations || []);
                }
              };
              if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2500 });
              else setTimeout(run, 120);
            });
          }

          // Ne bloque jamais le premier affichage.
          return locations._locations || [];
        };
      };

      Promise.resolve(book.ready).then(patchLocations).catch(() => {});
      patchLocations();
      return book;
    };

    Object.assign(fastEpub, originalEpub);
    fastEpub.__comicsFastWrapped = true;
    window.ePub = fastEpub;
  }

  function warmUrl(url) {
    if (!url || warmed.has(url) || !/^https?:/i.test(url)) return;
    warmed.add(url);
    try {
      const parsed = new URL(url, location.href);
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = parsed.origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    } catch {}

    // Une petite requête Range amorce DNS, TLS et cache sans télécharger le livre entier.
    fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-65535' },
      cache: 'force-cache',
      mode: 'cors',
      credentials: 'omit'
    }).catch(() => {});
  }

  function bookUrlFromCard(card) {
    const id = card?.dataset?.id;
    if (!id) return '';
    try {
      const catalog = JSON.parse(sessionStorage.getItem('comics_catalog_snapshot') || '[]');
      return catalog.find(item => item.id === id)?.url || '';
    } catch { return ''; }
  }

  // Au toucher, le réseau démarre avant la fin du geste et avant le gestionnaire de clic.
  document.addEventListener('pointerdown', event => {
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const url = bookUrlFromCard(card);
    if (url) warmUrl(url);
  }, { capture: true, passive: true });

  // Affiche immédiatement le lecteur et un état de chargement visible.
  document.addEventListener('click', event => {
    const card = event.target.closest('.kindle-book-card');
    if (!card) return;
    const readerView = document.getElementById('readerView');
    const emptyState = document.getElementById('emptyState');
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active-view', view === readerView));
    document.body.classList.add('reading-mode');
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.innerHTML = '<strong>Ouverture rapide…</strong><span>Reprise de la dernière page.</span>';
    }
  }, { capture: true });

  // Prépare seulement les deux premiers livres visibles, sans saturer le réseau mobile.
  const observer = new IntersectionObserver(entries => {
    let budget = 2;
    for (const entry of entries) {
      if (!entry.isIntersecting || budget <= 0) continue;
      const url = bookUrlFromCard(entry.target);
      if (url) { warmUrl(url); budget -= 1; }
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '180px' });

  const watchCards = () => document.querySelectorAll('.kindle-book-card').forEach(card => observer.observe(card));
  new MutationObserver(() => {
    clearTimeout(watchCards.timer);
    watchCards.timer = setTimeout(watchCards, 200);
  }).observe(document.body, { childList: true, subtree: true });
  setTimeout(watchCards, 700);
})();
