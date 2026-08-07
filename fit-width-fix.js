(() => {
  const stage = document.getElementById('panelStage');
  const canvas = document.getElementById('pdfCanvas');
  const epubViewer = document.getElementById('epubViewer');
  const fitButton = document.getElementById('fitButton');
  if (!stage || !fitButton) return;

  let fitted = true;
  let timer = null;
  let styleWrites = 0;
  let noopSkips = 0;

  function rememberMetrics() {
    try {
      localStorage.setItem('comics_last_fit_style_writes', String(styleWrites));
      localStorage.setItem('comics_last_fit_noop_skips', String(noopSkips));
    } catch {}
  }

  function setStyle(element, property, value, priority = '') {
    if (!element) return false;
    const currentValue = element.style.getPropertyValue(property);
    const currentPriority = element.style.getPropertyPriority(property);
    if (currentValue === value && currentPriority === priority) {
      noopSkips += 1;
      return false;
    }
    element.style.setProperty(property, value, priority);
    styleWrites += 1;
    return true;
  }

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
    setStyle(canvas, 'width', `${width}px`, 'important');
    setStyle(canvas, 'height', `${width * ratio}px`, 'important');
    setStyle(canvas, 'max-width', '100%', 'important');
    setStyle(canvas, 'margin', '0');
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    rememberMetrics();
    return true;
  }

  function fitEpub() {
    if (!epubViewer || epubViewer.hidden) return false;
    const width = innerWidth();
    const height = Math.max(1, stage.clientHeight);
    setStyle(epubViewer, 'width', `${width}px`, 'important');
    setStyle(epubViewer, 'max-width', '100%', 'important');
    setStyle(epubViewer, 'height', `${height}px`, 'important');
    setStyle(epubViewer, 'margin', '0');

    const iframe = epubViewer.querySelector('iframe');
    if (iframe) {
      setStyle(iframe, 'width', '100%', 'important');
      setStyle(iframe, 'max-width', '100%', 'important');
      setStyle(iframe, 'height', '100%', 'important');
      setStyle(iframe, 'margin', '0');
      setStyle(iframe, 'border', '0');
      try {
        const doc = iframe.contentDocument;
        if (doc?.documentElement) {
          setStyle(doc.documentElement, 'width', '100%', 'important');
          setStyle(doc.documentElement, 'max-width', '100%', 'important');
          setStyle(doc.documentElement, 'margin', '0', 'important');
          setStyle(doc.documentElement, 'padding', '0', 'important');
        }
        if (doc?.body) {
          setStyle(doc.body, 'width', 'auto', 'important');
          setStyle(doc.body, 'max-width', 'none', 'important');
          setStyle(doc.body, 'margin', '0', 'important');
          setStyle(doc.body, 'padding-left', '16px', 'important');
          setStyle(doc.body, 'padding-right', '16px', 'important');
          doc.querySelectorAll('img,svg,video,table').forEach(node => {
            setStyle(node, 'max-width', '100%', 'important');
            setStyle(node, 'height', 'auto', 'important');
          });
        }
      } catch {
        // Les EPUB locaux chargés par EPUB.js restent normalement de même origine.
      }
    }
    stage.scrollLeft = 0;
    rememberMetrics();
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
