(() => {
  const CACHE_NAME = 'comics-metadata-cover-cache-v1';
  const pending = new Map();
  let catalog = [];

  const normalize = value => String(value || '').trim();
  const cacheRequest = id => new Request(`${location.origin}/.metadata-cover/${encodeURIComponent(id)}.jpg`);

  async function getCached(item) {
    if (!('caches' in window)) return '';
    const response = await (await caches.open(CACHE_NAME)).match(cacheRequest(item.id));
    return response ? URL.createObjectURL(await response.blob()) : '';
  }

  async function saveCached(item, blob) {
    if (!('caches' in window) || !blob) return;
    await (await caches.open(CACHE_NAME)).put(
      cacheRequest(item.id),
      new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })
    );
  }

  function candidateQueries(item) {
    const title = normalize(item.title);
    const author = normalize(item.authors).split(/[·,;]/)[0].trim();
    return [
      author ? `${title} ${author}` : title,
      title
    ].filter(Boolean);
  }

  async function searchOpenLibrary(item) {
    for (const query of candidateQueries(item)) {
      const endpoint = new URL('https://openlibrary.org/search.json');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('limit', '8');
      endpoint.searchParams.set('fields', 'key,title,author_name,cover_i,edition_key,isbn');
      const response = await fetch(endpoint, { cache: 'force-cache' });
      if (!response.ok) continue;
      const data = await response.json();
      const docs = Array.isArray(data.docs) ? data.docs : [];
      const titleLower = normalize(item.title).toLocaleLowerCase('fr');
      const authorLower = normalize(item.authors).toLocaleLowerCase('fr');
      const ranked = docs
        .filter(doc => doc.cover_i)
        .map(doc => {
          const docTitle = normalize(doc.title).toLocaleLowerCase('fr');
          const authors = (doc.author_name || []).join(' ').toLocaleLowerCase('fr');
          let score = 0;
          if (docTitle === titleLower) score += 10;
          else if (docTitle.includes(titleLower) || titleLower.includes(docTitle)) score += 5;
          if (authorLower && authors.includes(authorLower.split(/[·,;]/)[0].trim())) score += 6;
          return { doc, score };
        })
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score >= 5) {
        return `https://covers.openlibrary.org/b/id/${ranked[0].doc.cover_i}-L.jpg`;
      }
    }
    return '';
  }

  async function fetchCoverBlob(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Couverture inaccessible (${response.status})`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size < 4000) throw new Error('Couverture invalide');
    return blob;
  }

  function showImage(container, src) {
    const image = container.querySelector('.kindle-cover-image');
    if (!image) return;
    image.src = src;
    image.hidden = false;
    image.onload = () => {
      container.classList.add('cover-ready', 'cover-is-image');
      container.classList.remove('cover-is-canvas', 'cover-failed');
    };
  }

  async function resolveCover(item, container) {
    const cached = await getCached(item);
    if (cached) {
      showImage(container, cached);
      return;
    }

    const url = await searchOpenLibrary(item);
    if (!url) return;
    const blob = await fetchCoverBlob(url);
    await saveCached(item, blob);
    showImage(container, URL.createObjectURL(blob));
  }

  function hydrateVisibleFallbacks() {
    for (const container of document.querySelectorAll('.kindle-cover-art:not(.cover-ready)')) {
      const card = container.closest('.kindle-book-card');
      const item = catalog.find(entry => entry.id === card?.dataset.id);
      if (!item || (item.format || '').toLowerCase() !== 'epub') continue;
      if (pending.has(item.id)) continue;
      const task = resolveCover(item, container)
        .catch(error => console.warn(`Couverture distante indisponible pour ${item.title}`, error))
        .finally(() => pending.delete(item.id));
      pending.set(item.id, task);
    }
  }

  async function start() {
    try {
      const response = await fetch('./catalog.json', { cache: 'no-store' });
      catalog = await response.json();
    } catch {
      return;
    }

    const observer = new MutationObserver(() => {
      clearTimeout(observer.timer);
      observer.timer = setTimeout(hydrateVisibleFallbacks, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setTimeout(hydrateVisibleFallbacks, 700);
    setTimeout(hydrateVisibleFallbacks, 2500);
  }

  start();
})();
