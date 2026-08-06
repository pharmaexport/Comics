(() => {
  const data = window.COMIC_DATA || { panels: [] };
  const panels = Array.isArray(data.panels) ? data.panels : [];

  const stage = document.getElementById('panelStage');
  const image = document.getElementById('panelImage');
  const emptyState = document.getElementById('emptyState');
  const previousButton = document.getElementById('previousButton');
  const nextButton = document.getElementById('nextButton');
  const progressLabel = document.getElementById('progressLabel');
  const progressBar = document.getElementById('progressBar');
  const zoomRange = document.getElementById('zoomRange');
  const fitButton = document.getElementById('fitButton');
  const pageButton = document.getElementById('pageButton');
  const fullscreenButton = document.getElementById('fullscreenButton');
  const helpButton = document.getElementById('helpButton');
  const helpPanel = document.getElementById('helpPanel');

  let currentIndex = 0;
  let zoom = 1;
  let showWholePage = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setZoom(value) {
    zoom = clamp(value, 1, 2.2);
    zoomRange.value = String(Math.round(zoom * 100));
    render();
  }

  function render() {
    const hasPanels = panels.length > 0;
    emptyState.hidden = hasPanels;
    image.hidden = !hasPanels;
    previousButton.disabled = !hasPanels || currentIndex === 0;
    nextButton.disabled = !hasPanels || currentIndex >= panels.length - 1;
    progressBar.max = Math.max(panels.length, 1);
    progressBar.value = hasPanels ? currentIndex + 1 : 0;
    progressLabel.textContent = hasPanels
      ? `Case ${currentIndex + 1} sur ${panels.length}`
      : 'Case 0 sur 0';

    if (!hasPanels) return;

    const panel = panels[currentIndex];
    image.src = panel.image;
    image.alt = panel.alt || `Case ${currentIndex + 1}`;

    if (showWholePage || !panel.crop) {
      image.style.width = `${100 * zoom}%`;
      image.style.height = 'auto';
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center';
      image.style.clipPath = 'none';
    } else {
      const { x, y, width, height } = panel.crop;
      const scaleX = 100 / width;
      const scaleY = 100 / height;
      const scale = Math.max(scaleX, scaleY) * zoom;
      image.style.width = `${scale * 100}%`;
      image.style.height = 'auto';
      image.style.objectFit = 'contain';
      image.style.objectPosition = `${x + width / 2}% ${y + height / 2}%`;
      image.style.clipPath = `inset(${y}% ${100 - x - width}% ${100 - y - height}% ${x}%)`;
    }

    stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    pageButton.textContent = showWholePage ? 'Voir la case seule' : 'Voir la planche entière';
  }

  function goTo(index) {
    if (!panels.length) return;
    currentIndex = clamp(index, 0, panels.length - 1);
    showWholePage = false;
    render();
  }

  previousButton.addEventListener('click', () => goTo(currentIndex - 1));
  nextButton.addEventListener('click', () => goTo(currentIndex + 1));
  zoomRange.addEventListener('input', event => setZoom(Number(event.target.value) / 100));
  fitButton.addEventListener('click', () => setZoom(1));
  pageButton.addEventListener('click', () => {
    showWholePage = !showWholePage;
    render();
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await stage.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Mode plein écran indisponible', error);
    }
  });

  helpButton.addEventListener('click', () => {
    const isOpen = helpPanel.hidden;
    helpPanel.hidden = !isOpen;
    helpButton.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      goTo(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(currentIndex - 1);
    } else if (event.key.toLowerCase() === 'f') {
      fullscreenButton.click();
    } else if (event.key === '+' || event.key === '=') {
      setZoom(zoom + 0.1);
    } else if (event.key === '-') {
      setZoom(zoom - 0.1);
    }
  });

  render();
})();
