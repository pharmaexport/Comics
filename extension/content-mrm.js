const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPageToSettle(timeout = 5000) {
  const started = Date.now();
  let lastCount = 0;
  let stable = 0;
  while (Date.now() - started < timeout) {
    const count = document.images.length;
    stable = count === lastCount ? stable + 1 : 0;
    lastCount = count;
    if (stable >= 4 && document.readyState === 'complete') break;
    await wait(250);
  }
}

async function autoScroll() {
  let stable = 0;
  let previousHeight = 0;
  window.scrollTo(0, 0);

  for (let step = 0; step < 180; step += 1) {
    window.scrollBy({ top: Math.max(520, innerHeight * 0.82), behavior: 'instant' });
    await wait(170);

    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const atBottom = scrollY + innerHeight >= height - 24;
    stable = height === previousHeight ? stable + 1 : 0;
    previousHeight = height;

    if (atBottom && stable >= 6) break;
  }

  await wait(500);
  window.scrollTo(0, 0);
}

function absoluteUrl(value) {
  try { return new URL(value, location.href).href; }
  catch { return ''; }
}

function bestFromSrcset(value) {
  if (!value) return '';
  const entries = value.split(',').map(item => item.trim()).filter(Boolean);
  const ranked = entries.map(entry => {
    const [url, descriptor = ''] = entry.split(/\s+/);
    const width = Number.parseInt(descriptor, 10) || 0;
    return { url, width };
  }).sort((a, b) => b.width - a.width);
  return ranked[0]?.url || '';
}

function candidateSources(img) {
  const pictureSources = img.closest('picture') ? [...img.closest('picture').querySelectorAll('source')] : [];
  const values = [
    img.currentSrc,
    img.src,
    img.dataset.src,
    img.dataset.lazySrc,
    img.dataset.original,
    img.dataset.image,
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-original'),
    bestFromSrcset(img.getAttribute('data-srcset')),
    bestFromSrcset(img.srcset),
    ...pictureSources.flatMap(source => [bestFromSrcset(source.srcset), bestFromSrcset(source.dataset.srcset)])
  ];
  return values.map(absoluteUrl).filter(Boolean);
}

function isNoise(url, img) {
  const text = `${url} ${img.alt || ''} ${img.className || ''} ${img.id || ''}`.toLowerCase();
  return /logo|avatar|emoji|icon|banner|advert|gravatar|sprite|favicon|rating|flag|social|button|loader|spinner|thumbnail|thumb-|badge|placeholder|pixel|tracking/i.test(text);
}

function imageScore(img, url, index) {
  const rect = img.getBoundingClientRect();
  const width = img.naturalWidth || rect.width || 0;
  const height = img.naturalHeight || rect.height || 0;
  const area = width * height;
  const ratio = width && height ? height / width : 0;
  let score = 0;

  if (area >= 450000) score += 11;
  else if (area >= 280000) score += 8;
  else if (area >= 120000) score += 4;
  else if (area < 30000) score -= 12;

  if (height >= 900) score += 7;
  else if (height >= 700) score += 5;
  if (width >= 700) score += 4;
  else if (width >= 500) score += 3;
  if (ratio >= 1.1 && ratio <= 3.2) score += 5;
  if (/\/images?\//i.test(url)) score += 2;
  if (/wp-content\/uploads/i.test(url)) score += 4;
  if (img.closest('article,main,.entry-content,.post-content,.reader-content,.entry')) score += 4;
  if (img.closest('header,footer,nav,aside,.related,.comments,.sidebar')) score -= 10;
  if (img.loading === 'lazy') score += 1;

  return { score, width, height, area, index };
}

function normalizeImageUrl(url) {
  try {
    const parsed = new URL(url);
    ['w', 'width', 'h', 'height', 'quality', 'resize', 'fit', 'crop'].forEach(key => parsed.searchParams.delete(key));
    return `${parsed.origin}${parsed.pathname}`.replace(/-\d+x\d+(?=\.[a-z]{2,5}$)/i, '');
  } catch {
    return url;
  }
}

function collectImages() {
  const map = new Map();

  [...document.images].forEach((img, index) => {
    for (const url of candidateSources(img)) {
      if (!/^https?:/i.test(url) || isNoise(url, img)) continue;
      const meta = imageScore(img, url, index);
      if (meta.score < 5) continue;

      const normalized = normalizeImageUrl(url);
      const current = map.get(normalized);
      if (!current || meta.score > current.score || meta.area > current.area) {
        map.set(normalized, { url, ...meta });
      }
    }
  });

  return [...map.values()]
    .sort((a, b) => a.index - b.index || b.score - a.score || b.area - a.area)
    .map(item => item.url);
}

function detectTitle() {
  const selectors = ['h1.entry-title', '.entry-title', 'article h1', 'main h1', 'h1'];
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return document.title.replace(/\s*[|–-]\s*MyReadingManga.*$/i, '').trim() || 'MyReadingManga';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'COLLECT_MRM') return;

  (async () => {
    await waitForPageToSettle();
    await autoScroll();
    await waitForPageToSettle(2500);
    const images = collectImages();
    sendResponse({
      ok: images.length > 0,
      images,
      title: detectTitle(),
      pageUrl: location.href,
      count: images.length,
      diagnostics: {
        documentImages: document.images.length,
        readyState: document.readyState,
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      }
    });
  })().catch(error => sendResponse({ ok: false, message: error.message || 'Analyse impossible.' }));

  return true;
});
