const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPageToSettle(timeout = 9000) {
  const started = Date.now();
  let lastSignature = '';
  let stable = 0;
  while (Date.now() - started < timeout) {
    const signature = `${document.images.length}:${document.body.scrollHeight}:${document.readyState}`;
    stable = signature === lastSignature ? stable + 1 : 0;
    lastSignature = signature;
    if (stable >= 5 && document.readyState === 'complete') break;
    await wait(300);
  }
}

async function autoScroll() {
  let stable = 0;
  let previousHeight = 0;
  window.scrollTo(0, 0);

  for (let step = 0; step < 220; step += 1) {
    window.scrollBy({ top: Math.max(560, innerHeight * 0.86), behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    await wait(180);

    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const atBottom = scrollY + innerHeight >= height - 32;
    stable = height === previousHeight ? stable + 1 : 0;
    previousHeight = height;
    if (atBottom && stable >= 7) break;
  }

  await wait(650);
  window.scrollTo(0, 0);
}

function absoluteUrl(value) {
  try { return new URL(value, location.href).href; }
  catch { return ''; }
}

function bestFromSrcset(value) {
  if (!value) return '';
  return value.split(',')
    .map(item => item.trim()).filter(Boolean)
    .map(entry => {
      const [url, descriptor = ''] = entry.split(/\s+/);
      const score = descriptor.endsWith('w') ? Number.parseInt(descriptor, 10) || 0 : (Number.parseFloat(descriptor) || 0) * 1000;
      return { url, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.url || '';
}

function candidateSources(img) {
  const picture = img.closest('picture');
  const sources = picture ? [...picture.querySelectorAll('source')] : [];
  const attrs = [
    'src', 'data-src', 'data-lazy-src', 'data-original', 'data-image',
    'data-cfsrc', 'data-url', 'data-full', 'data-large-file', 'data-orig-file'
  ];
  const values = [img.currentSrc, ...attrs.map(name => img.getAttribute(name)), bestFromSrcset(img.srcset), bestFromSrcset(img.getAttribute('data-srcset'))];
  for (const source of sources) values.push(bestFromSrcset(source.srcset), bestFromSrcset(source.getAttribute('data-srcset')));
  return values.map(absoluteUrl).filter(Boolean);
}

function urlsFromLinks() {
  const found = [];
  document.querySelectorAll('a[href]').forEach(link => {
    const href = absoluteUrl(link.getAttribute('href'));
    if (/\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(href)) found.push(href);
  });
  return found;
}

function urlsFromScripts() {
  const found = [];
  const imagePattern = /https?:\\?\/\\?\/[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi;
  document.querySelectorAll('script:not([src])').forEach(script => {
    const text = script.textContent || '';
    for (const match of text.matchAll(imagePattern)) found.push(match[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&'));
  });
  return found.map(absoluteUrl).filter(Boolean);
}

function isNoise(url, img = null) {
  const text = `${url} ${img?.alt || ''} ${img?.className || ''} ${img?.id || ''}`.toLowerCase();
  return /logo|avatar|emoji|icon|banner|advert|gravatar|sprite|favicon|rating|flag|social|button|loader|spinner|thumbnail|thumb-|badge|placeholder|pixel|tracking|counter|analytics/i.test(text);
}

function imageScore(img, url, index) {
  const rect = img.getBoundingClientRect();
  const width = img.naturalWidth || rect.width || Number(img.getAttribute('width')) || 0;
  const height = img.naturalHeight || rect.height || Number(img.getAttribute('height')) || 0;
  const area = width * height;
  const ratio = width && height ? height / width : 0;
  let score = 0;

  if (area >= 600000) score += 13;
  else if (area >= 350000) score += 10;
  else if (area >= 150000) score += 5;
  else if (area && area < 30000) score -= 15;
  if (height >= 1000) score += 8;
  else if (height >= 700) score += 5;
  if (width >= 700) score += 4;
  else if (width >= 450) score += 2;
  if (ratio >= 1.05 && ratio <= 4.2) score += 5;
  if (/wp-content\/uploads|\/uploads\/|\/images?\//i.test(url)) score += 4;
  if (img.closest('article,main,.entry-content,.post-content,.reader-content,.entry,.post')) score += 5;
  if (img.closest('header,footer,nav,aside,.related,.comments,.sidebar')) score -= 12;
  return { score, width, height, area, index };
}

function normalizeImageUrl(url) {
  try {
    const parsed = new URL(url);
    ['w', 'width', 'h', 'height', 'quality', 'resize', 'fit', 'crop'].forEach(key => parsed.searchParams.delete(key));
    return `${parsed.origin}${parsed.pathname}`.replace(/-\d+x\d+(?=\.[a-z]{2,5}$)/i, '');
  } catch { return url; }
}

function collectImages() {
  const map = new Map();
  const add = (url, meta) => {
    if (!/^https?:/i.test(url) || isNoise(url)) return;
    const normalized = normalizeImageUrl(url);
    const current = map.get(normalized);
    if (!current || (meta.score || 0) > (current.score || 0) || (meta.area || 0) > (current.area || 0)) map.set(normalized, { url, ...meta });
  };

  [...document.images].forEach((img, index) => {
    for (const url of candidateSources(img)) {
      if (isNoise(url, img)) continue;
      const meta = imageScore(img, url, index);
      if (meta.score >= 5) add(url, meta);
    }
  });

  let syntheticIndex = document.images.length;
  for (const url of [...urlsFromLinks(), ...urlsFromScripts()]) {
    add(url, { score: /wp-content\/uploads|\/uploads\//i.test(url) ? 7 : 4, width: 0, height: 0, area: 0, index: syntheticIndex++ });
  }

  return [...map.values()]
    .sort((a, b) => a.index - b.index || b.score - a.score || b.area - a.area)
    .map(item => item.url);
}

function detectTitle() {
  for (const selector of ['h1.entry-title', '.entry-title', 'article h1', 'main h1', 'h1']) {
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
    await waitForPageToSettle(3500);
    const images = collectImages();
    sendResponse({
      ok: images.length > 0,
      images,
      title: detectTitle(),
      pageUrl: location.href,
      count: images.length,
      diagnostics: {
        documentImages: document.images.length,
        linkedImages: urlsFromLinks().length,
        scriptedImages: urlsFromScripts().length,
        readyState: document.readyState,
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      }
    });
  })().catch(error => sendResponse({ ok: false, message: error.message || 'Analyse impossible.' }));
  return true;
});
