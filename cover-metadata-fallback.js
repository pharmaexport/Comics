(() => {
  const CACHE_NAME = 'comics-metadata-cover-cache-v2';
  const pending = new Map();
  let catalog = [];

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const fold = value => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
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
    const volume = normalize(item.volume);
    const subtitle = normalize(item.subtitle);
    const queries = [
      [title, subtitle, volume ? `tome ${volume}` : '', author].filter(Boolean).join(' '),
      [title, author].filter(Boolean).join(' '),
      [title, subtitle].filter(Boolean).join(' '),
      title
    ];
    return [...new Set(queries.filter(Boolean))];
  }

  function rankCandidate(item, title, authors = '', subtitle = '') {
    const wantedTitle = fold(item.title);
    const wantedAuthor = fold(normalize(item.authors).split(/[·,;]/)[0]);
    const wantedSubtitle = fold(item.subtitle);
    const candidateTitle = fold(title);
    const candidateAuthors = fold(authors);
    const candidateSubtitle = fold(subtitle);
    let score = 0;

    if (candidateTitle === wantedTitle) score += 12;
    else if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) score += 7;
    else {
      const wantedWords = wantedTitle.split(/\s+/).filter(word => word.length > 2);
      const hits = wantedWords.filter(word => candidateTitle.includes(word)).length;
      score += Math.min(5, hits);
    }

    if (wantedAuthor && candidateAuthors.includes(wantedAuthor)) score += 7;
    if (wantedSubtitle && (candidateTitle.includes(wantedSubtitle) || candidateSubtitle.includes(wantedSubtitle))) score += 3;
    if (item.volume && new RegExp(`(?:tome|vol(?:ume)?|t)\\s*0?${Number(item.volume) || item.volume}`, 'i').test(`${title} ${subtitle}`)) score += 2;
    return score;
  }

  async function searchOpenLibrary(item) {
    for (const query of candidateQueries(item)) {
      const endpoint = new URL('https://openlibrary.org/search.json');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('limit', '12');
      endpoint.searchParams.set('fields', 'key,title,subtitle,author_name,cover_i,edition_key,isbn');
      const response = await fetch(endpoint, { cache: 'force-cache' });
      if (!response.ok) continue;
      const data = await response.json();
      const ranked = (Array.isArray(data.docs) ? data.docs : [])
        .filter(doc => doc.cover_i)
        .map(doc => ({
          url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          score: rankCandidate(item, doc.title, (doc.author_name || []).join(' '), doc.subtitle || '')
        }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score >= 6) return ranked[0].url;
    }
    return '';
  }

  async function searchGoogleBooks(item) {
    for (const query of candidateQueries(item)) {
      const endpoint = new URL('https://www.googleapis.com/books/v1/volumes');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('maxResults', '20');
      endpoint.searchParams.set('printType', 'books');
      const response = await fetch(endpoint, { cache: 'force-cache' });
      if (!response.ok) continue;
      const data = await response.json();
      const ranked = (Array.isArray(data.items) ? data.items : [])
        .map(entry => entry.volumeInfo || {})
        .filter(info => info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail)
        .map(info => ({
          url: (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail).replace(/^http:/, 'https:').replace('&zoom=1', '&zoom=2'),
          score: rankCandidate(item, info.title, (info.authors || []).join(' '), info.subtitle || '')
        }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score >= 6) return ranked[0].url;
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

    const candidates = [];
    if (item.cover) candidates.push(item.cover);
    if (item.driveFileId) candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(item.driveFileId)}&sz=w1000`);
    const openLibrary = await searchOpenLibrary(item).catch(() => '');
    if (openLibrary) candidates.push(openLibrary);
    const googleBooks = await searchGoogleBooks(item).catch(() => '');
    if (googleBooks) candidates.push(googleBooks);

    for (const url of [...new Set(candidates.filter(Boolean))]) {
      try {
        const blob = await fetchCoverBlob(url);
        await saveCached(item, blob);
        showImage(container, URL.createObjectURL(blob));
        return;
      } catch (error) {
        console.warn(`Échec de la couverture ${url}`, error);
      }
    }
  }

  function hydrateVisibleFallbacks() {
    for (const container of document.querySelectorAll('.kindle-cover-art:not(.cover-ready)')) {
      const card = container.closest('.kindle-book-card');
      const item = catalog.find(entry => entry.id === card?.dataset.id);
      if (!item || pending.has(item.id)) continue;
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
      observer.timer = setTimeout(hydrateVisibleFallbacks, 220);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setTimeout(hydrateVisibleFallbacks, 500);
    setTimeout(hydrateVisibleFallbacks, 1800);
    setTimeout(hydrateVisibleFallbacks, 5000);
  }

  start();
})();
