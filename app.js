import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const DEFAULT_SOURCE = 'https://psv4.vkuserphoto.ru/s/v1/d/_w-CWu7zJ7U_ICtNHN23zIO8D5c6s7pjS7zc5idDusdxbu7juvDEIu6P48rNcZyf4rBQ4cIGHkOMigLxAHJvBIhsifRgGyEqWyzZhQzrU3WjcS_i/Eternum_-_01_-_Le_sarcophage_Christophe_Bec_-_Jaouen.pdf';
const STORAGE_KEY = 'comics_reader_state_v4';
const $ = id => document.getElementById(id);

const stage = $('panelStage');
const canvas = $('pdfCanvas');
const context = canvas.getContext('2d');
const epubViewer = $('epubViewer');
const reader = $('immersiveReader');
const emptyState = $('emptyState');
const pageNumber = $('pageNumber');
const pageCount = $('pageCount');
const pageSlider = $('pageSlider');
const zoomRange = $('zoomRange');
const zoomValue = $('zoomValue');
const bookmarkButton = $('bookmarkButton');
const fullscreenButton = $('fullscreenButton');
const bookmarkList = $('bookmarkList');
const coverCanvas = $('coverCanvas');
const sourceUrl = $('sourceUrl');
const sourceFile = $('sourceFile');

let source = DEFAULT_SOURCE;
let format = 'pdf';
let pdf = null;
let book = null;
let rendition = null;
let currentPage = 1;
let totalPositions = 0;
let zoom = 1;
let fontSize = 100;
let renderTask = null;
let hideTimer = null;
let immersive = false;
let touchStart = null;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let lastTap = 0;
let direction = 'ltr';
let objectUrl = null;
let state = loadState();

function loadState() {
  try {
    return { page: 1, epubLocation: null, bookmarks: [], theme: 'dark', direction: 'ltr', autoHide: 'on', ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { page: 1, epubLocation: null, bookmarks: [], theme: 'dark', direction: 'ltr', autoHide: 'on' };
  }
}

function saveState() {
  if (format === 'pdf') state.page = currentPage;
  state.direction = direction;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function filenameFromSource(value) {
  if (value instanceof File) return value.name;
  try { return decodeURIComponent(new URL(value, location.href).pathname.split('/').pop() || 'Document'); }
  catch { return 'Document'; }
}

function titleFromSource(value) {
  return filenameFromSource(value)
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/_+-_+/g, ' – ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectFormat(value) {
  const name = filenameFromSource(value).toLowerCase();
  if (name.endsWith('.epub') || (value instanceof File && value.type === 'application/epub+zip')) return 'epub';
  return 'pdf';
}

function setChromeVisible(visible) {
  document.body.classList.toggle('chrome-hidden', !visible);
  clearTimeout(hideTimer);
  if (visible && state.autoHide === 'on' && document.querySelector('#readerView.active-view')) {
    hideTimer = setTimeout(() => setChromeVisible(false), 2800);
  }
}

function toggleChrome() {
  setChromeVisible(document.body.classList.contains('chrome-hidden'));
}

function setDocumentMeta(value) {
  const title = titleFromSource(value);
  $('comicTitle').textContent = title;
  document.title = title;
  $('libraryTitle').textContent = title;
  $('librarySubtitle').textContent = format === 'epub' ? 'Livre EPUB' : 'Bande dessinée PDF';
  $('formatBadge').textContent = format.toUpperCase();
  $('positionLabel').textContent = format === 'epub' ? 'Position' : 'Page';
}

function updateControls() {
  const count = format === 'pdf' ? (pdf?.numPages || 0) : totalPositions;
  pageNumber.value = String(currentPage);
  pageNumber.max = String(count || 1);
  pageCount.textContent = String(count || 0);
  pageSlider.max = String(count || 1);
  pageSlider.value = String(Math.min(currentPage, count || 1));
  $('previousButton').disabled = currentPage <= 1;
  $('nextButton').disabled = count > 0 && currentPage >= count;

  const scale = format === 'epub' ? fontSize : Math.round(zoom * 100);
  zoomRange.min = format === 'epub' ? '70' : '25';
  zoomRange.max = format === 'epub' ? '200' : '400';
  zoomRange.step = format === 'epub' ? '5' : '5';
  zoomRange.value = String(scale);
  zoomValue.textContent = `${scale}%`;
  $('fitButton').textContent = format === 'epub' ? 'Taille normale' : 'Ajuster à la largeur';

  const bookmarkKey = format === 'epub' ? `epub:${currentPage}` : `pdf:${currentPage}`;
  const bookmarked = state.bookmarks.includes(bookmarkKey);
  bookmarkButton.textContent = bookmarked ? '♥' : '♡';
  bookmarkButton.setAttribute('aria-pressed', String(bookmarked));

  $('cardProgress').max = count || 1;
  $('cardProgress').value = currentPage;
  $('cardProgressText').textContent = count ? `${format === 'epub' ? 'Position' : 'Page'} ${currentPage} sur ${count}` : 'Chargement…';
  saveState();
}

async function renderPdfPage({ resetScroll = true } = {}) {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: zoom });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  if (renderTask) renderTask.cancel();
  renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
  try {
    await renderTask.promise;
    canvas.hidden = false;
    emptyState.hidden = true;
    if (resetScroll) stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') throw error;
  } finally {
    renderTask = null;
  }
  updateControls();
}

function availableReaderWidth() {
  const styles = getComputedStyle(stage);
  return Math.max(1, stage.getBoundingClientRect().width
    - parseFloat(styles.paddingLeft || '0') - parseFloat(styles.paddingRight || '0')
    - parseFloat(styles.borderLeftWidth || '0') - parseFloat(styles.borderRightWidth || '0'));
}

async function fitWidth() {
  if (format === 'epub') {
    fontSize = 100;
    rendition?.themes.fontSize('100%');
    updateControls();
    return;
  }
  if (!pdf) return;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const page = await pdf.getPage(currentPage);
  const base = page.getViewport({ scale: 1 });
  zoom = Math.max(.25, Math.min(4, availableReaderWidth() / base.width));
  await renderPdfPage();
}

async function goToPosition(value) {
  const requested = Math.max(1, Number(value) || 1);
  if (format === 'pdf') {
    if (!pdf) return;
    currentPage = Math.min(pdf.numPages, requested);
    await fitWidth();
  } else if (book && rendition) {
    currentPage = Math.min(totalPositions || requested, requested);
    if (book.locations?.length()) {
      const cfi = book.locations.cfiFromLocation(currentPage - 1);
      if (cfi) await rendition.display(cfi);
    }
  }
  setChromeVisible(true);
}

async function changePage(delta) {
  const step = direction === 'rtl' ? -delta : delta;
  if (format === 'pdf') return goToPosition(currentPage + step);
  if (!rendition) return;
  if (step > 0) await rendition.next(); else await rendition.prev();
  setChromeVisible(true);
}

async function renderCover() {
  if (format !== 'pdf' || !pdf || !coverCanvas) return;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 260 / base.width });
  coverCanvas.width = viewport.width;
  coverCanvas.height = viewport.height;
  await page.render({ canvasContext: coverCanvas.getContext('2d'), viewport }).promise;
}

async function cleanupDocument() {
  if (renderTask) { try { renderTask.cancel(); } catch {} }
  renderTask = null;
  if (pdf) { try { await pdf.destroy(); } catch {} }
  pdf = null;
  if (rendition) { try { rendition.destroy(); } catch {} }
  rendition = null;
  if (book) { try { book.destroy(); } catch {} }
  book = null;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  canvas.hidden = true;
  epubViewer.hidden = true;
  epubViewer.innerHTML = '';
}

async function loadPdf(input) {
  const taskSource = input instanceof File ? { data: await input.arrayBuffer() } : { url: input };
  pdf = await pdfjsLib.getDocument(taskSource).promise;
  currentPage = Math.max(1, Math.min(pdf.numPages, Number(state.page) || 1));
  totalPositions = pdf.numPages;
  canvas.hidden = false;
  epubViewer.hidden = true;
  await fitWidth();
  renderCover();
}

async function loadEpub(input) {
  if (typeof window.ePub !== 'function') throw new Error('Le moteur EPUB.js n’est pas chargé.');
  const sourceData = input instanceof File ? await input.arrayBuffer() : input;
  book = window.ePub(sourceData);
  await book.ready;

  epubViewer.hidden = false;
  canvas.hidden = true;
  rendition = book.renderTo(epubViewer, {
    width: '100%',
    height: '100%',
    spread: 'none',
    flow: 'paginated',
    manager: 'default'
  });
  rendition.themes.default({
    body: { color: '#eef4ff !important', background: '#111827 !important', 'font-family': 'system-ui, sans-serif !important', padding: '4% !important' },
    'a, h1, h2, h3, p, span': { color: 'inherit !important' },
    img: { 'max-width': '100% !important', height: 'auto !important' }
  });
  rendition.themes.fontSize(`${fontSize}%`);

  rendition.on('relocated', location => {
    state.epubLocation = location.start.cfi;
    if (book.locations?.length()) {
      currentPage = Math.max(1, book.locations.locationFromCfi(location.start.cfi) + 1);
      totalPositions = book.locations.length();
    }
    emptyState.hidden = true;
    updateControls();
  });

  emptyState.innerHTML = '<strong>Préparation de l’EPUB…</strong><span>Création des positions de lecture.</span>';
  emptyState.hidden = false;
  await book.locations.generate(1200);
  totalPositions = Math.max(1, book.locations.length());
  const start = state.epubLocation || undefined;
  await rendition.display(start);
  currentPage = start ? Math.max(1, book.locations.locationFromCfi(start) + 1) : 1;
  emptyState.hidden = true;
  updateControls();
}

async function openDocument(input) {
  try {
    await cleanupDocument();
    source = input;
    format = detectFormat(input);
    setDocumentMeta(input);
    emptyState.innerHTML = `<strong>Chargement du ${format.toUpperCase()}…</strong>`;
    emptyState.hidden = false;
    if (format === 'epub') await loadEpub(input); else await loadPdf(input);
    switchView('reader');
  } catch (error) {
    console.error(error);
    emptyState.hidden = false;
    emptyState.innerHTML = `<strong>Impossible de charger le ${format.toUpperCase()}</strong><span>${error?.message || 'Le fichier est inaccessible ou invalide.'}</span>`;
  }
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active-view', el.id === `${view}View`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.body.classList.toggle('reading-mode', view === 'reader');
  if (view === 'reader') { setChromeVisible(true); if (format === 'pdf') setTimeout(fitWidth, 60); }
  else { setChromeVisible(true); if (immersive) exitImmersive(); }
  if (view === 'bookmarks') renderBookmarks();
}

function renderBookmarks() {
  bookmarkList.innerHTML = '';
  if (!state.bookmarks.length) {
    bookmarkList.innerHTML = '<div class="empty-card"><strong>Aucun marque-page</strong><span>Ajoutez une position pendant la lecture.</span></div>';
    return;
  }
  state.bookmarks.forEach(key => {
    const [kind, value] = key.split(':');
    const button = document.createElement('button');
    button.className = 'bookmark-card';
    button.innerHTML = `<span>${kind === 'epub' ? 'Position' : 'Page'} ${value}</span><small>${$('comicTitle').textContent}</small><b>Ouvrir →</b>`;
    button.onclick = () => { switchView('reader'); goToPosition(value); };
    bookmarkList.appendChild(button);
  });
}

async function enterImmersive() {
  try {
    if (reader.requestFullscreen) { await reader.requestFullscreen(); return; }
    if (reader.webkitRequestFullscreen) { reader.webkitRequestFullscreen(); return; }
  } catch {}
  immersive = true;
  document.body.classList.add('ios-immersive');
  fullscreenButton.textContent = 'Quitter';
  setChromeVisible(false);
  if (format === 'pdf') setTimeout(fitWidth, 80);
  else setTimeout(() => rendition?.resize(stage.clientWidth, stage.clientHeight), 80);
}

function exitImmersive() {
  immersive = false;
  document.body.classList.remove('ios-immersive');
  fullscreenButton.textContent = 'Plein écran';
  setChromeVisible(true);
  if (format === 'pdf') setTimeout(fitWidth, 80);
  else setTimeout(() => rendition?.resize(stage.clientWidth, stage.clientHeight), 80);
}

async function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (immersive) return exitImmersive();
  return enterImmersive();
}

document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => switchView(button.dataset.view));
$('backButton').onclick = () => switchView('library');
$('openCurrentComic').onclick = () => switchView('reader');
$('previousButton').onclick = () => changePage(-1);
$('nextButton').onclick = () => changePage(1);
pageNumber.onchange = () => goToPosition(pageNumber.value);
pageSlider.oninput = () => { pageNumber.value = pageSlider.value; };
pageSlider.onchange = () => goToPosition(pageSlider.value);
zoomRange.oninput = () => {
  if (format === 'epub') { fontSize = Number(zoomRange.value); rendition?.themes.fontSize(`${fontSize}%`); updateControls(); }
  else { zoom = Number(zoomRange.value) / 100; renderPdfPage({ resetScroll: false }); }
};
$('zoomInButton').onclick = () => {
  if (format === 'epub') { fontSize = Math.min(200, fontSize + 10); rendition?.themes.fontSize(`${fontSize}%`); updateControls(); }
  else { zoom = Math.min(4, zoom + .2); renderPdfPage({ resetScroll: false }); }
};
$('zoomOutButton').onclick = () => {
  if (format === 'epub') { fontSize = Math.max(70, fontSize - 10); rendition?.themes.fontSize(`${fontSize}%`); updateControls(); }
  else { zoom = Math.max(.25, zoom - .2); renderPdfPage({ resetScroll: false }); }
};
$('fitButton').onclick = fitWidth;
bookmarkButton.onclick = () => {
  const key = `${format}:${currentPage}`;
  state.bookmarks = state.bookmarks.includes(key) ? state.bookmarks.filter(item => item !== key) : [...state.bookmarks, key];
  updateControls(); renderBookmarks();
};
fullscreenButton.onclick = toggleFullscreen;
$('openUrlButton').onclick = () => { const value = sourceUrl.value.trim(); if (value) openDocument(value); };
sourceUrl.onkeydown = event => { if (event.key === 'Enter') $('openUrlButton').click(); };
sourceFile.onchange = () => { const file = sourceFile.files?.[0]; if (file) openDocument(file); };
$('themeSelect').onchange = e => { state.theme = e.target.value; document.documentElement.dataset.theme = state.theme; saveState(); };
$('directionSelect').onchange = e => { direction = e.target.value; saveState(); };
$('autoHideSelect').onchange = e => { state.autoHide = e.target.value; saveState(); setChromeVisible(true); };
$('resetProgressButton').onclick = () => { currentPage = 1; state.page = 1; state.epubLocation = null; state.bookmarks = []; saveState(); renderBookmarks(); goToPosition(1); };

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran';
  setTimeout(() => format === 'pdf' ? fitWidth() : rendition?.resize(stage.clientWidth, stage.clientHeight), 80);
});

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); changePage(1); }
  else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); changePage(-1); }
  else if (event.key === '+' || event.key === '=') $('zoomInButton').click();
  else if (event.key === '-') $('zoomOutButton').click();
  else if (event.key.toLowerCase() === 'f') toggleFullscreen();
  else if (event.key === 'Escape' && immersive) exitImmersive();
});

function distance(touches) { return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY); }
stage.addEventListener('touchstart', event => {
  if (event.touches.length === 2) {
    pinchStartDistance = distance(event.touches);
    pinchStartZoom = format === 'epub' ? fontSize / 100 : zoom;
    touchStart = null;
    event.preventDefault();
  } else if (event.touches.length === 1) {
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() };
  }
}, { passive: false });

stage.addEventListener('touchmove', event => {
  if (event.touches.length === 2 && pinchStartDistance) {
    const factor = pinchStartZoom * distance(event.touches) / pinchStartDistance;
    if (format === 'epub') {
      fontSize = Math.max(70, Math.min(200, Math.round(factor * 100)));
      rendition?.themes.fontSize(`${fontSize}%`);
      updateControls();
    } else {
      zoom = Math.max(.25, Math.min(4, factor));
      renderPdfPage({ resetScroll: false });
    }
    event.preventDefault();
  }
}, { passive: false });

stage.addEventListener('touchend', event => {
  if (pinchStartDistance) { pinchStartDistance = 0; return; }
  if (!touchStart || event.changedTouches.length !== 1) return;
  const end = event.changedTouches[0];
  const dx = end.clientX - touchStart.x;
  const dy = end.clientY - touchStart.y;
  const elapsed = Date.now() - touchStart.time;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) && elapsed < 650) changePage(dx < 0 ? 1 : -1);
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
    const now = Date.now();
    if (now - lastTap < 320) {
      if (format === 'epub') { fontSize = fontSize < 130 ? 150 : 100; rendition?.themes.fontSize(`${fontSize}%`); updateControls(); }
      else { zoom = zoom < 1.6 ? 2 : 1; renderPdfPage(); }
      lastTap = 0;
    } else {
      lastTap = now;
      setTimeout(() => { if (lastTap === now) toggleChrome(); }, 330);
    }
  }
  touchStart = null;
});

window.addEventListener('resize', () => {
  clearTimeout(window.__resizeTimer);
  window.__resizeTimer = setTimeout(() => format === 'pdf' ? fitWidth() : rendition?.resize(stage.clientWidth, stage.clientHeight), 180);
});

sourceUrl.value = DEFAULT_SOURCE;
direction = state.direction;
$('directionSelect').value = direction;
$('themeSelect').value = state.theme;
$('autoHideSelect').value = state.autoHide;
document.documentElement.dataset.theme = state.theme;
document.body.classList.add('reading-mode');
updateControls();
openDocument(DEFAULT_SOURCE);
setChromeVisible(true);
