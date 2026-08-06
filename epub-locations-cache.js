(() => {
  const originalEpub = window.ePub;
  if (typeof originalEpub !== 'function') return;

  const CACHE_PREFIX = 'comics_epub_locations_v1:';
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  function activeCatalogId() {
    try {
      const item = JSON.parse(localStorage.getItem('comics_active_catalog_item') || 'null');
      return item?.id ? String(item.id) : '';
    } catch {
      return '';
    }
  }

  function storageKey(id) {
    return `${CACHE_PREFIX}${id}`;
  }

  function loadCachedLocations(id) {
    if (!id) return null;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey(id)) || 'null');
      if (!cached || !Array.isArray(cached.locations) || cached.locations.length === 0) return null;
      if (!cached.savedAt || Date.now() - cached.savedAt > MAX_AGE_MS) {
        localStorage.removeItem(storageKey(id));
        return null;
      }
      return cached.locations;
    } catch {
      return null;
    }
  }

  function saveLocations(id, locations) {
    if (!id || !Array.isArray(locations) || locations.length === 0) return;
    try {
      localStorage.setItem(storageKey(id), JSON.stringify({
        savedAt: Date.now(),
        locations
      }));
    } catch {
      // Safari peut refuser le stockage si le quota est atteint. Le rendu normal continue.
    }
  }

  function patchBook(book, catalogId) {
    const locations = book?.locations;
    if (!locations || typeof locations.generate !== 'function' || locations.__comicsCachePatched) return book;

    const originalGenerate = locations.generate.bind(locations);
    const originalRenderTo = typeof book.renderTo === 'function' ? book.renderTo.bind(book) : null;
    let rendition = null;
    let generationPromise = null;

    if (originalRenderTo) {
      book.renderTo = (...args) => {
        rendition = originalRenderTo(...args);
        return rendition;
      };
    }

    async function refreshCurrentLocation() {
      if (!rendition || typeof rendition.display !== 'function') return;
      try {
        const current = rendition.currentLocation?.();
        const cfi = current?.start?.cfi;
        if (cfi) await rendition.display(cfi);
      } catch {
        // Le livre peut avoir été fermé pendant l’indexation.
      }
    }

    locations.__comicsCachePatched = true;
    locations.generate = async (...args) => {
      const cached = loadCachedLocations(catalogId);
      if (cached && typeof locations.load === 'function') {
        try {
          locations.load(cached);
          localStorage.setItem('comics_last_locations_source', 'cache');
          return locations.save?.() || cached;
        } catch {
          try { localStorage.removeItem(storageKey(catalogId)); } catch {}
        }
      }

      // Sans identifiant de catalogue, conserver strictement le comportement EPUB.js normal.
      if (!catalogId) return originalGenerate(...args);

      if (!generationPromise) {
        const startedAt = performance.now();
        generationPromise = originalGenerate(...args)
          .then(result => {
            const generated = typeof locations.save === 'function' ? locations.save() : null;
            saveLocations(catalogId, generated);
            try {
              localStorage.setItem('comics_last_locations_source', 'generated-background');
              localStorage.setItem('comics_last_locations_ms', String(Math.round(performance.now() - startedAt)));
            } catch {}
            return refreshCurrentLocation().then(() => result);
          })
          .catch(error => {
            console.warn('Indexation EPUB différée indisponible', error);
            try { localStorage.setItem('comics_last_locations_source', 'generation-error'); } catch {}
            return null;
          });
      }

      // Débloque rendition.display() immédiatement. La reprise utilise directement le CFI sauvegardé.
      try {
        localStorage.setItem('comics_last_epub_display_mode', 'before-index');
        localStorage.setItem('comics_last_locations_source', 'generating-background');
      } catch {}
      return [];
    };
    return book;
  }

  function cachedEpub(...args) {
    return patchBook(originalEpub.apply(this, args), activeCatalogId());
  }

  Object.assign(cachedEpub, originalEpub);
  window.ePub = cachedEpub;
})();
