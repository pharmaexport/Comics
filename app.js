import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const PDF_URL = 'https://psv4.vkuserphoto.ru/s/v1/d/MMmE-TeR6bPMu1hdn3N5p-Zqkr_biSz3JIcwUtiE_t4OuJt82gPMdjvkMaS4J3-ENLtaSUqYx5CoNgQOZWt1jkG6SkHdT8j_YgHxnvvXyWD1rNWG/Fantasmes_-_Tome_3_-_Les_Jeux_interdits.pdf';
const STORAGE_KEY = 'comics_reader_state_v2';

const $ = id => document.getElementById(id);
const stage = $('panelStage');
const canvas = $('pdfCanvas');
const context = canvas.getContext('2d');
const coverCanvas = $('coverCanvas');
const emptyState = $('emptyState');
const previousButton = $('previousButton');
const nextButton = $('nextButton');
const pageNumber = $('pageNumber');
const pageCount = $('pageCount');
const pageProgress = $('pageProgress');
const progressText = $('progressText');
const cardProgress = $('cardProgress');
const cardProgressText = $('cardProgressText');
const zoomRange = $('zoomRange');
const zoomValue = $('zoomValue');
const bookmarkButton = $('bookmarkButton');
const bookmarkList = $('bookmarkList');
const fullscreenButton = $('fullscreenButton');
const helpButton = $('helpButton');
const helpPanel = $('helpPanel');

let pdf = null;
let currentPage = 1;
let zoom = 1;
let renderTask = null;
let startDistance = 0;
let startZoom = 1;
let direction = 'ltr';
let state = loadState();

function loadState() {
  try {
    return { page: 1, bookmarks: [], theme: 'dark', direction: 'ltr', ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { page: 1, bookmarks: [], theme: 'dark', direction: 'ltr' };
  }
}

function saveState() {
  state.page = currentPage;
  state.direction = direction;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function titleFromUrl(url) {
  const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Bande dessinée');
  return filename.replace(/\.pdf$/i, '').replace(/_+-_+/g, ' – ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function updateControls() {
  const count = pdf?.numPages || 0;
  const progress = count ? currentPage / count : 0;
  previousButton.disabled = !pdf || currentPage <= 1;
  nextButton.disabled = !pdf || currentPage >= count;
  pageNumber.value = String(currentPage);
  pageNumber.max = String(count || 1);
  pageCount.textContent = String(count);
  pageProgress.max = count || 1;
  pageProgress.value = currentPage;
  progressText.textContent = `${Math.round(progress * 100)} %`;
  cardProgress.max = count || 1;
  cardProgress.value = currentPage;
  cardProgressText.textContent = count ? `Page ${currentPage} sur ${count}` : 'Chargement…';
  zoomRange.value = String(Math.round(zoom * 100));
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  const bookmarked = state.bookmarks.includes(currentPage);
  bookmarkButton.textContent = bookmarked ? '♥' : '♡';
  bookmarkButton.setAttribute('aria-pressed', String(bookmarked));
  saveState();
}

async function renderPage() {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: zoom });
  const ratio = window.devicePixelRatio || 1;
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
    stage.scrollTo({ top: 0, left: 0 });
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') throw error;
  } finally {
    renderTask = null;
  }
  updateControls();
}

async function renderCover() {
  if (!pdf || !coverCanvas) return;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = 260 / base.width;
  const viewport = page.getViewport({ scale });
  coverCanvas.width = viewport.width;
  coverCanvas.height = viewport.height;
  await page.render({ canvasContext: coverCanvas.getContext('2d'), viewport }).promise;
}

async function fitPage() {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1 });
  zoom = Math.max(0.5, Math.min(3, Math.min((stage.clientWidth - 24) / viewport.width, (stage.clientHeight - 24) / viewport.height)));
  await renderPage();
}

async function goToPage(page) {
  if (!pdf) return;
  currentPage = Math.max(1, Math.min(pdf.numPages, Number(page) || 1));
  await renderPage();
}

function changePage(delta) {
  goToPage(currentPage + (direction === 'rtl' ? -delta : delta));
}

function renderBookmarks() {
  bookmarkList.innerHTML = '';
  if (!state.bookmarks.length) {
    bookmarkList.innerHTML = '<div class="empty-card"><strong>Aucun marque-page</strong><span>Ajoutez une page avec le bouton ♡ pendant la lecture.</span></div>';
    return;
  }
  [...state.bookmarks].sort((a, b) => a - b).forEach(page => {
    const button = document.createElement('button');
    button.className = 'bookmark-card';
    button.innerHTML = `<span>Page ${page}</span><small>Fantasmes – Tome 3</small><b>Ouvrir →</b>`;
    button.addEventListener('click', () => { switchView('reader'); goToPage(page); });
    bookmarkList.appendChild(button);
  });
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active-view', section.id === `${view}View`));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'bookmarks') renderBookmarks();
}

async function loadPdf() {
  try {
    const title = titleFromUrl(PDF_URL);
    $('comicTitle').textContent = title;
    document.title = title;
    pdf = await pdfjsLib.getDocument({ url: PDF_URL }).promise;
    currentPage = Math.max(1, Math.min(pdf.numPages, Number(state.page) || 1));
    direction = state.direction || 'ltr';
    $('directionSelect').value = direction;
    $('themeSelect').value = state.theme || 'dark';
    document.documentElement.dataset.theme = state.theme || 'dark';
    await fitPage();
    renderCover();
    renderBookmarks();
  } catch (error) {
    console.error(error);
    emptyState.innerHTML = '<strong>Impossible de charger le PDF</strong><span>Le serveur distant bloque peut-être le téléchargement depuis ce site.</span>';
    canvas.hidden = true;
  }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('openCurrentComic').addEventListener('click', () => switchView('reader'));
$('openCurrentComic').addEventListener('keydown', event => { if (event.key === 'Enter') switchView('reader'); });
previousButton.addEventListener('click', () => changePage(-1));
nextButton.addEventListener('click', () => changePage(1));
pageNumber.addEventListener('change', () => goToPage(pageNumber.value));
zoomRange.addEventListener('input', () => { zoom = Number(zoomRange.value) / 100; renderPage(); });
$('zoomInButton').addEventListener('click', () => { zoom = Math.min(3, zoom + 0.2); renderPage(); });
$('zoomOutButton').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.2); renderPage(); });
$('fitButton').addEventListener('click', fitPage);
bookmarkButton.addEventListener('click', () => {
  state.bookmarks = state.bookmarks.includes(currentPage) ? state.bookmarks.filter(page => page !== currentPage) : [...state.bookmarks, currentPage];
  updateControls();
  renderBookmarks();
});
$('themeSelect').addEventListener('change', event => { state.theme = event.target.value; document.documentElement.dataset.theme = state.theme; saveState(); });
$('directionSelect').addEventListener('change', event => { direction = event.target.value; saveState(); });
$('resetProgressButton').addEventListener('click', () => { currentPage = 1; state.bookmarks = []; saveState(); renderBookmarks(); goToPage(1); });
fullscreenButton.addEventListener('click', async () => { if (!document.fullscreenElement) await stage.requestFullscreen(); else await document.exitFullscreen(); });
document.addEventListener('fullscreenchange', () => { fullscreenButton.textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran'; fitPage(); });
helpButton.addEventListener('click', () => { const open = helpPanel.hidden; helpPanel.hidden = !open; helpButton.setAttribute('aria-expanded', String(open)); });

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); changePage(1); }
  else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); changePage(-1); }
  else if (event.key === '+' || event.key === '=') $('zoomInButton').click();
  else if (event.key === '-') $('zoomOutButton').click();
  else if (event.key.toLowerCase() === 'f') fullscreenButton.click();
});

function touchDistance(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}
stage.addEventListener('touchstart', event => {
  if (event.touches.length === 2) { startDistance = touchDistance(event.touches); startZoom = zoom; event.preventDefault(); }
}, { passive: false });
stage.addEventListener('touchmove', event => {
  if (event.touches.length === 2 && startDistance) { zoom = Math.max(0.5, Math.min(3, startZoom * touchDistance(event.touches) / startDistance)); renderPage(); event.preventDefault(); }
}, { passive: false });
stage.addEventListener('touchend', () => { startDistance = 0; });

window.addEventListener('resize', () => { clearTimeout(window.__pdfResizeTimer); window.__pdfResizeTimer = setTimeout(fitPage, 180); });

updateControls();
loadPdf();
