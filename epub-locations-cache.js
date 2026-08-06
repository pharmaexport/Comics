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

      const startedAt = performance.now();
      const result = await originalGenerate(...args);
      const generated = typeof locations.save === 'function' ? locations.save() : null;
      saveLocations(catalogId, generated);
      try {
        localStorage.setItem('comics_last_locations_source', 'generated');
        localStorage.setItem('comics_last_locations_ms', String(Math.round(performance.now() - startedAt)));
      } catch {}
      return result;
    };
    return book;
  }

  function cachedEpub(...args) {
    return patchBook(originalEpub.apply(this, args), activeCatalogId());
  }

  Object.assign(cachedEpub, originalEpub);
  window.ePub = cachedEpub;
})();
