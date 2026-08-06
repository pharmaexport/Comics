async function autoScroll() {
  let last = -1;
  for (let i = 0; i < 80; i += 1) {
    window.scrollBy(0, Math.max(500, innerHeight * 0.85));
    await new Promise(r => setTimeout(r, 180));
    const now = document.documentElement.scrollHeight;
    if (scrollY + innerHeight >= now - 10 && now === last) break;
    last = now;
  }
  window.scrollTo(0, 0);
}

function collectImages() {
  const seen = new Set();
  return [...document.images]
    .map(img => img.currentSrc || img.src || img.dataset.src || img.dataset.lazySrc || '')
    .filter(Boolean)
    .map(src => new URL(src, location.href).href)
    .filter(src => /^https?:/i.test(src))
    .filter(src => !/logo|avatar|emoji|icon|banner|advert|gravatar|sprite/i.test(src))
    .filter(src => !seen.has(src) && seen.add(src));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'COLLECT_MRM') return;
  (async () => {
    await autoScroll();
    const images = collectImages();
    const title = (document.querySelector('h1')?.textContent || document.title || 'MyReadingManga').trim();
    sendResponse({ ok: images.length > 0, images, title, pageUrl: location.href });
  })().catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});
