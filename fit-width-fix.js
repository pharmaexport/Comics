(() => {
  const stage = document.getElementById('panelStage');
  const canvas = document.getElementById('pdfCanvas');
  const epubViewer = document.getElementById('epubViewer');
  const fitButton = document.getElementById('fitButton');
  if (!stage || !fitButton) return;

  let fitted = true;
  let timer = null;

  function innerWidth() {
    const style = getComputedStyle(stage);
    return Math.max(1,
      stage.getBoundingClientRect().width
      - parseFloat(style.paddingLeft || 0)
      - parseFloat(style.paddingRight || 0)
      - parseFloat(style.borderLeftWidth || 0)
      - parseFloat(style.borderRightWidth || 0)
    );
  }

  function fitPdf() {
    if (!canvas || canvas.hidden || !canvas.width || !canvas.height) return false;
    const width = innerWidth();
    const cssWidth = parseFloat(canvas.style.width) || canvas.getBoundingClientRect().width || width;
    const cssHeight = parseFloat(canvas.style.height) || canvas.getBoundingClientRect().height || 1;
    const ratio = cssHeight / Math.max(cssWidth, 1);
    canvas.style.setProperty('width', `${width}px`, 'important');
    canvas.style.setProperty('height', `${width * ratio}px`, 'important');
    canvas.style.setProperty('max-width', '100%', 'important');
    canvas.style.margin = '0';
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    return true;
  }

  function fitEpub() {
    if (!epubViewer || epubViewer.hidden) return false;
    const width = innerWidth();
    const height = Math.max(1, stage.clientHeight);
    epubViewer.style.setProperty('width', `${width}px`, 'important');
    epubViewer.style.setProperty('max-width', '100%', 'important');
    epubViewer.style.setProperty('height', `${height}px`, 'important');
    epubViewer.style.margin = '0';

    const iframe = epubViewer.querySelector('iframe');
    if (iframe) {
      iframe.style.setProperty('width', '100%', 'important');
      iframe.style.setProperty('max-width', '100%', 'important');
      iframe.style.setProperty('height', '100%', 'important');
      iframe.style.margin = '0';
      iframe.style.border = '0';
      try {
        const doc = iframe.contentDocument;
        if (doc?.documentElement) {
          doc.documentElement.style.setProperty('width', '100%', 'important');
          doc.documentElement.style.setProperty('max-width', '100%', 'important');
          doc.documentElement.style.setProperty('margin', '0', 'important');
          doc.documentElement.style.setProperty('padding', '0', 'important');
        }
        if (doc?.body) {
          doc.body.style.setProperty('width', 'auto', 'important');
          doc.body.style.setProperty('max-width', 'none', 'important');
          doc.body.style.setProperty('margin', '0', 'important');
          doc.body.style.setProperty('padding-left', '16px', 'important');
          doc.body.style.setProperty('padding-right', '16px', 'important');
          doc.querySelectorAll('img,svg,video,table').forEach(node => {
            node.style.setProperty('max-width', '100%', 'important');
            node.style.setProperty('height', 'auto', 'important');
          });
        }
      } catch {
        // Les EPUB locaux chargés par EPUB.js restent normalement de même origine.
      }
    }
    stage.scrollLeft = 0;
    return true;
  }

  function applyFit() {
    if (!fitted) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitPdf() || fitEpub();
    }));
  }

  function scheduleFit(delay = 80) {
    clearTimeout(timer);
    timer = setTimeout(applyFit, delay);
  }

  fitButton.addEventListener('click', () => {
    fitted = true;
    scheduleFit(30);
    scheduleFit(180);
    scheduleFit(500);
  });

  document.getElementById('zoomInButton')?.addEventListener('click', () => { fitted = false; });
  document.getElementById('zoomOutButton')?.addEventListener('click', () => { fitted = false; });
  document.getElementById('zoomRange')?.addEventListener('input', () => { fitted = false; });

  new MutationObserver(() => scheduleFit(60)).observe(stage, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'src']
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => scheduleFit(80)).observe(stage);
  }
  window.addEventListener('resize', () => scheduleFit(120));
  window.addEventListener('orientationchange', () => scheduleFit(250));
  document.addEventListener('fullscreenchange', () => scheduleFit(150));

  scheduleFit(300);
})();
