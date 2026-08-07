(() => {
  const stage = document.getElementById('panelStage');
  const canvas = document.getElementById('pdfCanvas');
  const zoomRange = document.getElementById('zoomRange');
  const zoomValue = document.getElementById('zoomValue');
  const zoomInButton = document.getElementById('zoomInButton');
  const zoomOutButton = document.getElementById('zoomOutButton');
  const fitButton = document.getElementById('fitButton');
  if (!stage || !canvas || !zoomRange) return;

  let gesture = null;
  let commitTimer = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = touches => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );
  const midpoint = touches => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  });

  function displayedScale() {
    const value = Number(zoomRange.value || 100) / 100;
    return clamp(value, .25, 4);
  }

  function updateLabel(scale) {
    zoomRange.value = String(Math.round(scale * 100));
    if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;
  }

  function previewScale(scale, anchor, geometry = null) {
    const baseScale = geometry?.startScale || displayedScale();
    const factor = scale / baseScale;
    const rect = stage.getBoundingClientRect();
    const contentX = geometry?.contentX ?? (anchor.x - rect.left + stage.scrollLeft);
    const contentY = geometry?.contentY ?? (anchor.y - rect.top + stage.scrollTop);

    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `scale(${factor})`;
    canvas.dataset.previewScale = String(scale);
    updateLabel(scale);

    try {
      localStorage.setItem('comics_last_zoom_preview_factor', String(factor));
      localStorage.setItem('comics_last_zoom_anchor_mode', geometry ? 'gesture-origin' : 'live');
    } catch {}

    requestAnimationFrame(() => {
      stage.scrollLeft = Math.max(0, contentX * factor - (anchor.x - rect.left));
      stage.scrollTop = Math.max(0, contentY * factor - (anchor.y - rect.top));
    });
  }

  function clearPreview() {
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    delete canvas.dataset.previewScale;
  }

  function commitScale(scale) {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      clearPreview();
      zoomRange.value = String(Math.round(scale * 100));
      zoomRange.dispatchEvent(new Event('input', { bubbles: true }));
    }, 70);
  }

  stage.addEventListener('touchstart', event => {
    if (event.touches.length !== 2 || canvas.hidden) return;
    const center = midpoint(event.touches);
    const rect = stage.getBoundingClientRect();
    gesture = {
      startDistance: distance(event.touches),
      startScale: displayedScale(),
      contentX: center.x - rect.left + stage.scrollLeft,
      contentY: center.y - rect.top + stage.scrollTop
    };
    canvas.style.willChange = 'transform';
    event.preventDefault();
  }, { passive: false, capture: true });

  stage.addEventListener('touchmove', event => {
    if (!gesture || event.touches.length !== 2) return;
    const factor = distance(event.touches) / gesture.startDistance;
    const scale = clamp(gesture.startScale * factor, .25, 4);
    previewScale(scale, midpoint(event.touches), gesture);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  stage.addEventListener('touchend', event => {
    if (!gesture) return;
    if (event.touches.length >= 2) return;
    const finalScale = clamp(Number(canvas.dataset.previewScale || displayedScale()), .25, 4);
    canvas.style.willChange = '';
    gesture = null;
    commitScale(finalScale);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  function stepZoom(direction) {
    const current = displayedScale();
    const steps = [.25, .5, .75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
    const target = direction > 0
      ? (steps.find(value => value > current + .01) || 4)
      : ([...steps].reverse().find(value => value < current - .01) || .25);
    updateLabel(target);
    commitScale(target);
  }

  if (zoomInButton) zoomInButton.addEventListener('click', event => {
    event.stopImmediatePropagation();
    stepZoom(1);
  }, true);

  if (zoomOutButton) zoomOutButton.addEventListener('click', event => {
    event.stopImmediatePropagation();
    stepZoom(-1);
  }, true);

  if (fitButton) fitButton.addEventListener('click', () => {
    clearPreview();
  }, true);

  stage.addEventListener('dblclick', event => {
    if (canvas.hidden) return;
    event.preventDefault();
    const current = displayedScale();
    const next = current < 1.5 ? 2 : 1;
    previewScale(next, { x: event.clientX, y: event.clientY }, { startScale: current });
    commitScale(next);
  });
})();
