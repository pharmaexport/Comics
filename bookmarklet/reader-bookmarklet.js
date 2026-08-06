(() => {
  'use strict';

  const MIN_WIDTH = 500;
  const MIN_HEIGHT = 500;
  const existing = document.getElementById('bd-reader-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const images = [...document.images]
    .filter(img => (img.naturalWidth || img.width) >= MIN_WIDTH && (img.naturalHeight || img.height) >= MIN_HEIGHT)
    .filter(img => !img.closest('header, nav, footer'));

  if (!images.length) {
    alert('Aucune grande image de planche détectée sur cette page.');
    return;
  }

  let pageIndex = 0;
  let panelIndex = 0;
  let panels = [];
  let zoom = 1;

  const overlay = document.createElement('div');
  overlay.id = 'bd-reader-overlay';
  overlay.innerHTML = `
    <style>
      #bd-reader-overlay{position:fixed;inset:0;z-index:2147483647;background:#111;color:#fff;font-family:system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr auto}
      #bd-reader-overlay .bar{display:flex;gap:.5rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.65rem;background:#1d1d1d}
      #bd-reader-overlay button,#bd-reader-overlay select{font:inherit;padding:.55rem .8rem;border-radius:.55rem;border:1px solid #555;background:#292929;color:#fff}
      #bd-reader-overlay button:focus-visible,#bd-reader-overlay select:focus-visible{outline:3px solid #fff;outline-offset:2px}
      #bd-reader-stage{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:0}
      #bd-reader-stage img{position:absolute;max-width:none;max-height:none;transform-origin:top left;user-select:none;-webkit-user-drag:none}
      #bd-reader-status{min-width:12rem;text-align:center}
      @media(max-width:700px){#bd-reader-overlay .bar{padding:.4rem}#bd-reader-overlay button,#bd-reader-overlay select{padding:.5rem .6rem}}
    </style>
    <div class="bar">
      <select id="bd-page-select" aria-label="Choisir une planche"></select>
      <button id="bd-prev-panel">← Case</button>
      <span id="bd-reader-status"></span>
      <button id="bd-next-panel">Case →</button>
      <button id="bd-zoom-out">−</button>
      <button id="bd-zoom-in">+</button>
      <button id="bd-full-page">Planche entière</button>
      <button id="bd-close">Fermer</button>
    </div>
    <div id="bd-reader-stage"><img id="bd-reader-image" alt="Planche de bande dessinée"></div>
    <div class="bar">Flèches : naviguer · +/− : zoom · Échap : fermer</div>`;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector('#bd-reader-stage');
  const display = overlay.querySelector('#bd-reader-image');
  const status = overlay.querySelector('#bd-reader-status');
  const select = overlay.querySelector('#bd-page-select');

  images.forEach((img, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `Planche ${i + 1}`;
    select.appendChild(option);
  });

  function fallbackPanels(width, height) {
    const rows = height > width * 1.25 ? 3 : 2;
    const cols = width > height * 1.15 ? 3 : 2;
    const result = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        result.push({
          x: x / cols,
          y: y / rows,
          w: 1 / cols,
          h: 1 / rows
        });
      }
    }
    return result;
  }

  function detectPanels(img) {
    // Détection volontairement légère : grille adaptative locale, sans serveur ni modèle IA.
    // Les coordonnées restent calculées dans le navigateur et ne sont jamais envoyées.
    return fallbackPanels(img.naturalWidth, img.naturalHeight);
  }

  function showPanel() {
    const panel = panels[panelIndex];
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const iw = display.naturalWidth;
    const ih = display.naturalHeight;
    if (!iw || !ih || !panel) return;

    const cropW = iw * panel.w;
    const cropH = ih * panel.h;
    const scale = Math.min(sw / cropW, sh / cropH) * zoom;
    display.style.width = `${iw * scale}px`;
    display.style.height = `${ih * scale}px`;
    display.style.left = `${(sw - cropW * scale) / 2 - panel.x * iw * scale}px`;
    display.style.top = `${(sh - cropH * scale) / 2 - panel.y * ih * scale}px`;
    status.textContent = `Planche ${pageIndex + 1}/${images.length} · Case ${panelIndex + 1}/${panels.length}`;
  }

  function loadPage(index) {
    pageIndex = Math.max(0, Math.min(images.length - 1, index));
    panelIndex = 0;
    zoom = 1;
    select.value = String(pageIndex);
    display.onload = () => {
      panels = detectPanels(display);
      showPanel();
    };
    display.src = images[pageIndex].currentSrc || images[pageIndex].src;
  }

  function nextPanel() {
    if (panelIndex < panels.length - 1) panelIndex++;
    else if (pageIndex < images.length - 1) return loadPage(pageIndex + 1);
    showPanel();
  }

  function previousPanel() {
    if (panelIndex > 0) panelIndex--;
    else if (pageIndex > 0) {
      pageIndex--;
      select.value = String(pageIndex);
      display.onload = () => {
        panels = detectPanels(display);
        panelIndex = panels.length - 1;
        zoom = 1;
        showPanel();
      };
      display.src = images[pageIndex].currentSrc || images[pageIndex].src;
      return;
    }
    showPanel();
  }

  overlay.querySelector('#bd-next-panel').onclick = nextPanel;
  overlay.querySelector('#bd-prev-panel').onclick = previousPanel;
  overlay.querySelector('#bd-zoom-in').onclick = () => { zoom = Math.min(3, zoom + .2); showPanel(); };
  overlay.querySelector('#bd-zoom-out').onclick = () => { zoom = Math.max(.6, zoom - .2); showPanel(); };
  overlay.querySelector('#bd-full-page').onclick = () => {
    panels = [{x:0,y:0,w:1,h:1}];
    panelIndex = 0;
    zoom = 1;
    showPanel();
  };
  overlay.querySelector('#bd-close').onclick = () => overlay.remove();
  select.onchange = () => loadPage(Number(select.value));
  addEventListener('resize', showPanel);
  addEventListener('keydown', event => {
    if (!document.getElementById('bd-reader-overlay')) return;
    if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); nextPanel(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previousPanel(); }
    if (event.key === '+' || event.key === '=') { zoom = Math.min(3, zoom + .2); showPanel(); }
    if (event.key === '-') { zoom = Math.max(.6, zoom - .2); showPanel(); }
    if (event.key === 'Escape') overlay.remove();
  });

  loadPage(0);
})();