(() => {
  const data = window.COMIC_DATA || { panels: [] };
  const panels = Array.isArray(data.panels) ? data.panels : [];

  const stage = document.getElementById('panelStage');
  const image = document.getElementById('panelImage');
  const pdfFrame = document.getElementById('pdfFrame');
  const readerMode = document.getElementById('readerMode');
  const pdfControls = document.getElementById('pdfControls');
  const pdfUrl = document.getElementById('pdfUrl');
  const loadPdfButton = document.getElementById('loadPdfButton');
  const comicProgress = document.getElementById('comicProgress');
  const comicControls = document.getElementById('comicControls');
  const zoomPanel = document.getElementById('zoomPanel');
  const emptyState = document.getElementById('emptyState');
  const previousButton = document.getElementById('previousButton');
  const nextButton = document.getElementById('nextButton');
  const progressLabel = document.getElementById('progressLabel');
  const progressBar = document.getElementById('progressBar');
  const zoomRange = document.getElementById('zoomRange');
  const zoomValue = document.getElementById('zoomValue');
  const zoomInButton = document.getElementById('zoomInButton');
  const zoomOutButton = document.getElementById('zoomOutButton');
  const fitButton = document.getElementById('fitButton');
  const pageButton = document.getElementById('pageButton');
  const fullscreenButton = document.getElementById('fullscreenButton');
  const helpButton = document.getElementById('helpButton');
  const helpPanel = document.getElementById('helpPanel');

  let currentIndex = 0;
  let userZoom = 1;
  let panX = 0;
  let panY = 0;
  let showWholePage = false;
  let imageReady = false;
  let baseScale = 1;
  let baseX = 0;
  let baseY = 0;
  let startDistance = 0;
  let startZoom = 1;
  let dragStart = null;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function updateZoomUI() {
    const percent = Math.round(userZoom * 100);
    zoomRange.value = String(percent);
    if (zoomValue) zoomValue.textContent = `${percent}%`;
  }

  function setZoom(value, preserveCenter = true) {
    const previous = userZoom;
    userZoom = clamp(value, 1, 4);
    if (!preserveCenter || previous === 0) {
      panX = 0;
      panY = 0;
    } else {
      const ratio = userZoom / previous;
      panX *= ratio;
      panY *= ratio;
    }
    updateZoomUI();
    applyTransform();
  }

  function getTargetRect(panel) {
    if (showWholePage || !panel.crop) return { x: 0, y: 0, width: 100, height: 100 };
    return panel.crop;
  }

  function computeBaseTransform() {
    if (!imageReady || !panels.length) return;
    const panel = panels[currentIndex];
    const crop = getTargetRect(panel);
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    const cropX = (crop.x / 100) * iw;
    const cropY = (crop.y / 100) * ih;
    const cropW = (crop.width / 100) * iw;
    const cropH = (crop.height / 100) * ih;
    const padding = 16;
    baseScale = Math.min(Math.max(sw - padding * 2, 1) / cropW, Math.max(sh - padding * 2, 1) / cropH);
    baseX = (sw - cropW * baseScale) / 2 - cropX * baseScale;
    baseY = (sh - cropH * baseScale) / 2 - cropY * baseScale;
  }

  function applyTransform() {
    if (!imageReady) return;
    image.style.width = `${image.naturalWidth}px`;
    image.style.height = `${image.naturalHeight}px`;
    image.style.transform = `translate3d(${baseX + panX}px, ${baseY + panY}px, 0) scale(${baseScale * userZoom})`;
  }

  function resetView() {
    userZoom = 1;
    panX = 0;
    panY = 0;
    updateZoomUI();
    computeBaseTransform();
    applyTransform();
  }

  function render() {
    const hasPanels = panels.length > 0;
    emptyState.hidden = hasPanels;
    image.hidden = !hasPanels;
    previousButton.disabled = !hasPanels || currentIndex === 0;
    nextButton.disabled = !hasPanels || currentIndex >= panels.length - 1;
    progressBar.max = Math.max(panels.length, 1);
    progressBar.value = hasPanels ? currentIndex + 1 : 0;
    progressLabel.textContent = hasPanels ? `Case ${currentIndex + 1} sur ${panels.length}` : 'Case 0 sur 0';
    if (!hasPanels) return;

    const panel = panels[currentIndex];
    imageReady = false;
    image.alt = panel.alt || `Case ${currentIndex + 1}`;
    image.onload = () => {
      imageReady = true;
      emptyState.hidden = true;
      resetView();
    };
    image.onerror = () => {
      imageReady = false;
      emptyState.hidden = false;
      emptyState.innerHTML = '<strong>Image introuvable</strong><span>Vérifiez le chemin de la planche.</span>';
    };
    image.src = panel.image;
    pageButton.querySelector('span').textContent = showWholePage ? 'Voir la case' : 'Voir la planche';
  }

  function goTo(index) {
    if (!panels.length) return;
    currentIndex = clamp(index, 0, panels.length - 1);
    showWholePage = false;
    render();
  }

  function normalizedPdfUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function loadPdf() {
    const url = normalizedPdfUrl(pdfUrl.value);
    if (!url) {
      pdfUrl.setCustomValidity('Saisissez une adresse PDF HTTP ou HTTPS valide.');
      pdfUrl.reportValidity();
      return;
    }
    pdfUrl.setCustomValidity('');
    pdfFrame.src = url;
  }

  function setReaderMode(mode) {
    const pdfMode = mode === 'pdf';
    readerMode.value = pdfMode ? 'pdf' : 'comic';
    pdfControls.hidden = !pdfMode;
    pdfFrame.hidden = !pdfMode;
    image.hidden = pdfMode || panels.length === 0;
    comicProgress.hidden = pdfMode;
    comicControls.hidden = pdfMode;
    zoomPanel.hidden = pdfMode;
    emptyState.hidden = pdfMode || panels.length > 0;
    stage.classList.toggle('pdf-mode', pdfMode);
    if (pdfMode && !pdfFrame.src) loadPdf();
    if (!pdfMode) render();
  }

  readerMode.addEventListener('change', event => setReaderMode(event.target.value));
  loadPdfButton.addEventListener('click', loadPdf);
  pdfUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') loadPdf();
  });
  previousButton.addEventListener('click', () => goTo(currentIndex - 1));
  nextButton.addEventListener('click', () => goTo(currentIndex + 1));
  zoomRange.addEventListener('input', event => setZoom(Number(event.target.value) / 100));
  zoomInButton?.addEventListener('click', () => setZoom(userZoom + 0.2));
  zoomOutButton?.addEventListener('click', () => setZoom(userZoom - 0.2));
  fitButton.addEventListener('click', resetView);
  pageButton.addEventListener('click', () => {
    showWholePage = !showWholePage;
    resetView();
    pageButton.querySelector('span').textContent = showWholePage ? 'Voir la case' : 'Voir la planche';
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await stage.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.error('Mode plein écran indisponible', error);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran';
  });

  helpButton.addEventListener('click', () => {
    const open = helpPanel.hidden;
    helpPanel.hidden = !open;
    helpButton.setAttribute('aria-expanded', String(open));
  });

  function distance(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  stage.addEventListener('touchstart', event => {
    if (readerMode.value === 'pdf') return;
    if (event.touches.length === 2) {
      startDistance = distance(event.touches);
      startZoom = userZoom;
      dragStart = null;
      event.preventDefault();
    } else if (event.touches.length === 1) {
      dragStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, panX, panY };
    }
  }, { passive: false });

  stage.addEventListener('touchmove', event => {
    if (readerMode.value === 'pdf') return;
    if (event.touches.length === 2 && startDistance > 0) {
      setZoom(startZoom * (distance(event.touches) / startDistance));
      event.preventDefault();
    } else if (event.touches.length === 1 && dragStart && userZoom > 1) {
      panX = dragStart.panX + event.touches[0].clientX - dragStart.x;
      panY = dragStart.panY + event.touches[0].clientY - dragStart.y;
      applyTransform();
      event.preventDefault();
    }
  }, { passive: false });

  stage.addEventListener('touchend', event => {
    if (event.touches.length < 2) startDistance = 0;
    if (event.touches.length === 0) dragStart = null;
  });

  stage.addEventListener('dblclick', () => {
    if (readerMode.value !== 'pdf') resetView();
  });
  window.addEventListener('resize', () => {
    if (readerMode.value !== 'pdf') resetView();
  });

  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key.toLowerCase() === 'f') {
      fullscreenButton.click();
      return;
    }
    if (readerMode.value === 'pdf') return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      goTo(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(currentIndex - 1);
    } else if (event.key === '+' || event.key === '=') {
      setZoom(userZoom + 0.2);
    } else if (event.key === '-') {
      setZoom(userZoom - 0.2);
    }
  });

  setReaderMode('pdf');
})();
