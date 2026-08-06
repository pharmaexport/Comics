const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function autoScroll() {
  let stable = 0;
  let previousHeight = 0;
  window.scrollTo(0, 0);

  for (let step = 0; step < 140; step += 1) {
    window.scrollBy({ top: Math.max(520, innerHeight * 0.82), behavior: 'instant' });
    await wait(160);

    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const atBottom = scrollY + innerHeight >= height - 24;
    stable = height === previousHeight ? stable + 1 : 0;
    previousHeight = height;

    if (atBottom && stable >= 4) break;
  }

  await wait(350);
  window.scrollTo(0, 0);
}

function absoluteUrl(value) {
  try { return new URL(value, location.href).href; }
  catch { return ''; }
}

function candidateSources(img) {
  const values = [
    img.currentSrc,
    img.src,
    img.dataset.src,
    img.dataset.lazySrc,
    img.dataset.original,
    img.dataset.image,
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-original'),
    img.getAttribute('data-srcset')?.split(',').pop()?.trim().split(/\s+/)[0],
    img.srcset?.split(',').pop()?.trim().split(/\s+/)[0]
  ];
  return values.map(absoluteUrl).filter(Boolean);
}

function isNoise(url, img) {
  const text = `${url} ${img.alt || ''} ${img.className || ''} ${img.id || ''}`.toLowerCase();
  return /logo|avatar|emoji|icon|banner|advert|gravatar|sprite|favicon|rating|flag|social|button|loader|spinner|thumbnail|thumb-/i.test(text);
}

function imageScore(img, url, index) {
  const rect = img.getBoundingClientRect();
  const width = img.naturalWidth || rect.width || 0;
  const height = img.naturalHeight || rect.height || 0;
  const area = width * height;
  const ratio = width && height ? height / width : 0;
  let score = 0;

  if (area >= 280000) score += 8;
  else if (area >= 120000) score += 4;
  else if (area < 30000) score -= 10;

  if (height >= 700) score += 5;
  if (width >= 500) score += 3;
  if (ratio >= 1.15 && ratio <= 2.4) score += 4;
  if (/\/images?\//i.test(url)) score += 2;
  if (/wp-content\/uploads/i.test(url)) score += 3;
  if (img.closest('article,main,.entry-content,.post-content,.reader-content')) score += 3;
  if (img.closest('header,footer,nav,aside')) score -= 8;

  return { score, width, height, area, index };
}

function collectImages() {
  const map = new Map();

  [...document.images].forEach((img, index) => {
    for (const url of candidateSources(img)) {
      if (!/^https?:/i.test(url) || isNoise(url, img)) continue;
      const meta = imageScore(img, url, index);
      if (meta.score < 4) continue;

      const normalized = url.replace(/([?&])(w|width|h|height|quality|resize)=[^&]+/gi, '$1').replace(/[?&]$/, '');
      const current = map.get(normalized);
      if (!current || meta.score > current.score) map.set(normalized, { url, ...meta });
    }
  });

  return [...map.values()]
    .sort((a, b) => a.index - b.index || b.score - a.score)
    .map(item => item.url);
}

function detectTitle() {
  const selectors = ['h1.entry-title', 'article h1', 'main h1', 'h1'];
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return document.title.replace(/\s*[|–-]\s*MyReadingManga.*$/i, '').trim() || 'MyReadingManga';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'COLLECT_MRM') return;

  (async () => {
    await autoScroll();
    const images = collectImages();
    sendResponse({
      ok: images.length > 0,
      images,
      title: detectTitle(),
      pageUrl: location.href,
      count: images.length
    });
  })().catch(error => sendResponse({ ok: false, message: error.message || 'Analyse impossible.' }));

  return true;
});
