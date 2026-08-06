import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const PDF_URL = 'https://psv4.vkuserphoto.ru/s/v1/d/MMmE-TeR6bPMu1hdn3N5p-Zqkr_biSz3JIcwUtiE_t4OuJt82gPMdjvkMaS4J3-ENLtaSUqYx5CoNgQOZWt1jkG6SkHdT8j_YgHxnvvXyWD1rNWG/Fantasmes_-_Tome_3_-_Les_Jeux_interdits.pdf';
const STORAGE_KEY = 'comics_reader_state_v3';
const $ = id => document.getElementById(id);

const stage = $('panelStage');
const canvas = $('pdfCanvas');
const context = canvas.getContext('2d');
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

let pdf = null;
let currentPage = 1;
let zoom = 1;
let renderTask = null;
let hideTimer = null;
let immersive = false;
let touchStart = null;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let lastTap = 0;
let direction = 'ltr';
let state = loadState();

function loadState() {
  try { return { page: 1, bookmarks: [], theme: 'dark', direction: 'ltr', autoHide: 'on', ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { page: 1, bookmarks: [], theme: 'dark', direction: 'ltr', autoHide: 'on' }; }
}
function saveState() { state.page = currentPage; state.direction = direction; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function titleFromUrl(url) { const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Bande dessinée'); return name.replace(/\.pdf$/i, '').replace(/_+-_+/g, ' – ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function setChromeVisible(visible) {
  document.body.classList.toggle('chrome-hidden', !visible);
  clearTimeout(hideTimer);
  if (visible && state.autoHide === 'on' && document.querySelector('#readerView.active-view')) hideTimer = setTimeout(() => setChromeVisible(false), 2800);
}
function toggleChrome() { setChromeVisible(document.body.classList.contains('chrome-hidden')); }

function updateControls() {
  const count = pdf?.numPages || 0;
  pageNumber.value = String(currentPage);
  pageNumber.max = String(count || 1);
  pageCount.textContent = String(count);
  pageSlider.max = String(count || 1);
  pageSlider.value = String(currentPage);
  $('previousButton').disabled = !pdf || currentPage <= 1;
  $('nextButton').disabled = !pdf || currentPage >= count;
  zoomRange.value = String(Math.round(zoom * 100));
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  const bookmarked = state.bookmarks.includes(currentPage);
  bookmarkButton.textContent = bookmarked ? '♥' : '♡';
  bookmarkButton.setAttribute('aria-pressed', String(bookmarked));
  $('cardProgress').max = count || 1;
  $('cardProgress').value = currentPage;
  $('cardProgressText').textContent = count ? `Page ${currentPage} sur ${count}` : 'Chargement…';
  saveState();
}

async function renderPage({ resetScroll = true } = {}) {
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
    if (resetScroll) stage.scrollTo({ top: 0, left: Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2), behavior: 'instant' });
  } catch (error) { if (error?.name !== 'RenderingCancelledException') throw error; }
  finally { renderTask = null; }
  updateControls();
}

async function fitWidth() {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const base = page.getViewport({ scale: 1 });
  zoom = Math.max(.5, Math.min(3, (stage.clientWidth - 4) / base.width));
  await renderPage();
}
async function goToPage(value) { if (!pdf) return; currentPage = Math.max(1, Math.min(pdf.numPages, Number(value) || 1)); await fitWidth(); setChromeVisible(true); }
function changePage(delta) { goToPage(currentPage + (direction === 'rtl' ? -delta : delta)); }

async function renderCover() {
  if (!pdf || !coverCanvas) return;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 260 / base.width });
  coverCanvas.width = viewport.width; coverCanvas.height = viewport.height;
  await page.render({ canvasContext: coverCanvas.getContext('2d'), viewport }).promise;
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active-view', el.id === `${view}View`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.body.classList.toggle('reading-mode', view === 'reader');
  if (view === 'reader') { setChromeVisible(true); setTimeout(fitWidth, 60); }
  else { setChromeVisible(true); if (immersive) exitImmersive(); }
  if (view === 'bookmarks') renderBookmarks();
}

function renderBookmarks() {
  bookmarkList.innerHTML = '';
  if (!state.bookmarks.length) { bookmarkList.innerHTML = '<div class="empty-card"><strong>Aucun marque-page</strong><span>Ajoutez une page pendant la lecture.</span></div>'; return; }
  [...state.bookmarks].sort((a,b)=>a-b).forEach(page => {
    const button = document.createElement('button');
    button.className = 'bookmark-card';
    button.innerHTML = `<span>Page ${page}</span><small>Fantasmes – Tome 3</small><b>Ouvrir →</b>`;
    button.onclick = () => { switchView('reader'); goToPage(page); };
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
  setTimeout(fitWidth, 80);
}
function exitImmersive() {
  immersive = false;
  document.body.classList.remove('ios-immersive');
  fullscreenButton.textContent = 'Plein écran';
  setChromeVisible(true);
  setTimeout(fitWidth, 80);
}
async function toggleFullscreen() {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (immersive) { exitImmersive(); return; }
  await enterImmersive();
}

async function loadPdf() {
  try {
    const title = titleFromUrl(PDF_URL);
    $('comicTitle').textContent = title; document.title = title;
    pdf = await pdfjsLib.getDocument({ url: PDF_URL }).promise;
    currentPage = Math.max(1, Math.min(pdf.numPages, Number(state.page) || 1));
    direction = state.direction;
    $('directionSelect').value = direction;
    $('themeSelect').value = state.theme;
    $('autoHideSelect').value = state.autoHide;
    document.documentElement.dataset.theme = state.theme;
    await fitWidth();
    renderCover(); renderBookmarks();
  } catch (error) {
    console.error(error);
    emptyState.innerHTML = '<strong>Impossible de charger le PDF</strong><span>Le serveur distant bloque peut-être le téléchargement.</span>';
  }
}

document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => switchView(button.dataset.view));
$('backButton').onclick = () => switchView('library');
$('openCurrentComic').onclick = () => switchView('reader');
$('previousButton').onclick = () => changePage(-1);
$('nextButton').onclick = () => changePage(1);
pageNumber.onchange = () => goToPage(pageNumber.value);
pageSlider.oninput = () => { pageNumber.value = pageSlider.value; };
pageSlider.onchange = () => goToPage(pageSlider.value);
zoomRange.oninput = () => { zoom = Number(zoomRange.value) / 100; renderPage({ resetScroll: false }); };
$('zoomInButton').onclick = () => { zoom = Math.min(3, zoom + .2); renderPage({ resetScroll:false }); };
$('zoomOutButton').onclick = () => { zoom = Math.max(.5, zoom - .2); renderPage({ resetScroll:false }); };
$('fitButton').onclick = fitWidth;
bookmarkButton.onclick = () => { state.bookmarks = state.bookmarks.includes(currentPage) ? state.bookmarks.filter(p => p !== currentPage) : [...state.bookmarks, currentPage]; updateControls(); renderBookmarks(); };
fullscreenButton.onclick = toggleFullscreen;
$('themeSelect').onchange = e => { state.theme = e.target.value; document.documentElement.dataset.theme = state.theme; saveState(); };
$('directionSelect').onchange = e => { direction = e.target.value; saveState(); };
$('autoHideSelect').onchange = e => { state.autoHide = e.target.value; saveState(); setChromeVisible(true); };
$('resetProgressButton').onclick = () => { currentPage = 1; state.bookmarks = []; saveState(); renderBookmarks(); goToPage(1); };

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran';
  if (!document.fullscreenElement && immersive) exitImmersive();
  setTimeout(fitWidth, 80);
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
  if (event.touches.length === 2) { pinchStartDistance = distance(event.touches); pinchStartZoom = zoom; touchStart = null; event.preventDefault(); }
  else if (event.touches.length === 1) touchStart = { x:event.touches[0].clientX, y:event.touches[0].clientY, time:Date.now() };
}, { passive:false });
stage.addEventListener('touchmove', event => {
  if (event.touches.length === 2 && pinchStartDistance) {
    zoom = Math.max(.5, Math.min(3, pinchStartZoom * distance(event.touches) / pinchStartDistance));
    renderPage({ resetScroll:false }); event.preventDefault();
  }
}, { passive:false });
stage.addEventListener('touchend', event => {
  if (pinchStartDistance) { pinchStartDistance = 0; return; }
  if (!touchStart || event.changedTouches.length !== 1) return;
  const end = event.changedTouches[0];
  const dx = end.clientX - touchStart.x;
  const dy = end.clientY - touchStart.y;
  const elapsed = Date.now() - touchStart.time;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) && elapsed < 650 && zoom <= 1.15) changePage(dx < 0 ? 1 : -1);
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
    const now = Date.now();
    if (now - lastTap < 320) { zoom = zoom < 1.6 ? 2 : 1; renderPage(); lastTap = 0; }
    else { lastTap = now; setTimeout(() => { if (lastTap === now) toggleChrome(); }, 330); }
  }
  touchStart = null;
});

window.addEventListener('resize', () => { clearTimeout(window.__resizeTimer); window.__resizeTimer = setTimeout(fitWidth, 180); });
document.body.classList.add('reading-mode');
updateControls(); loadPdf(); setChromeVisible(true);
