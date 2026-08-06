import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const PDF_URL = 'https://psv4.vkuserphoto.ru/s/v1/d/MMmE-TeR6bPMu1hdn3N5p-Zqkr_biSz3JIcwUtiE_t4OuJt82gPMdjvkMaS4J3-ENLtaSUqYx5CoNgQOZWt1jkG6SkHdT8j_YgHxnvvXyWD1rNWG/Fantasmes_-_Tome_3_-_Les_Jeux_interdits.pdf';

const stage = document.getElementById('panelStage');
const canvas = document.getElementById('pdfCanvas');
const context = canvas.getContext('2d');
const emptyState = document.getElementById('emptyState');
const previousButton = document.getElementById('previousButton');
const nextButton = document.getElementById('nextButton');
const pageNumber = document.getElementById('pageNumber');
const pageCount = document.getElementById('pageCount');
const zoomRange = document.getElementById('zoomRange');
const zoomValue = document.getElementById('zoomValue');
const zoomInButton = document.getElementById('zoomInButton');
const zoomOutButton = document.getElementById('zoomOutButton');
const fitButton = document.getElementById('fitButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const helpButton = document.getElementById('helpButton');
const helpPanel = document.getElementById('helpPanel');
const comicTitle = document.getElementById('comicTitle');

let pdf = null;
let currentPage = 1;
let zoom = 1;
let renderTask = null;

function titleFromUrl(url) {
  const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Bande dessinée');
  return filename.replace(/\.pdf$/i, '').replace(/_+-_+/g, ' – ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function updateControls() {
  previousButton.disabled = !pdf || currentPage <= 1;
  nextButton.disabled = !pdf || currentPage >= pdf.numPages;
  pageNumber.value = String(currentPage);
  pageNumber.max = pdf ? String(pdf.numPages) : '1';
  pageCount.textContent = pdf ? String(pdf.numPages) : '0';
  zoomRange.value = String(Math.round(zoom * 100));
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
}

async function renderPage() {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: zoom });
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  if (renderTask) renderTask.cancel();
  renderTask = page.render({
    canvasContext: context,
    viewport,
    transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0]
  });

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

async function fitPage() {
  if (!pdf) return;
  const page = await pdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(stage.clientWidth - 24, 100);
  const availableHeight = Math.max(stage.clientHeight - 24, 100);
  zoom = Math.min(availableWidth / viewport.width, availableHeight / viewport.height);
  zoom = Math.max(0.5, Math.min(3, zoom));
  await renderPage();
}

async function goToPage(page) {
  if (!pdf) return;
  currentPage = Math.max(1, Math.min(pdf.numPages, Number(page) || 1));
  await renderPage();
}

async function loadPdf() {
  try {
    const title = titleFromUrl(PDF_URL);
    comicTitle.textContent = title;
    document.title = title;
    emptyState.innerHTML = '<strong>Chargement du PDF…</strong>';
    emptyState.hidden = false;
    pdf = await pdfjsLib.getDocument({ url: PDF_URL }).promise;
    currentPage = 1;
    await fitPage();
  } catch (error) {
    console.error(error);
    emptyState.hidden = false;
    emptyState.innerHTML = '<strong>Impossible de charger le PDF</strong><span>Le serveur distant bloque peut-être le téléchargement depuis ce site.</span>';
    canvas.hidden = true;
  }
}

previousButton.addEventListener('click', () => goToPage(currentPage - 1));
nextButton.addEventListener('click', () => goToPage(currentPage + 1));
pageNumber.addEventListener('change', () => goToPage(pageNumber.value));
zoomRange.addEventListener('input', () => {
  zoom = Number(zoomRange.value) / 100;
  renderPage();
});
zoomInButton.addEventListener('click', () => {
  zoom = Math.min(3, zoom + 0.2);
  renderPage();
});
zoomOutButton.addEventListener('click', () => {
  zoom = Math.max(0.5, zoom - 0.2);
  renderPage();
});
fitButton.addEventListener('click', fitPage);

fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenElement) await stage.requestFullscreen();
  else await document.exitFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran';
  fitPage();
});

helpButton.addEventListener('click', () => {
  const open = helpPanel.hidden;
  helpPanel.hidden = !open;
  helpButton.setAttribute('aria-expanded', String(open));
});

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault();
    goToPage(currentPage + 1);
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    goToPage(currentPage - 1);
  } else if (event.key === '+' || event.key === '=') {
    zoomInButton.click();
  } else if (event.key === '-') {
    zoomOutButton.click();
  } else if (event.key.toLowerCase() === 'f') {
    fullscreenButton.click();
  }
});

window.addEventListener('resize', () => {
  clearTimeout(window.__pdfResizeTimer);
  window.__pdfResizeTimer = setTimeout(fitPage, 150);
});

updateControls();
loadPdf();
