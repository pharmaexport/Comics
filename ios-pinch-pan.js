(() => {
  const stage = document.getElementById('panelStage');
  const canvas = document.getElementById('pdfCanvas');
  if (!stage || !canvas) return;

  const state = {
    pointers: new Map(),
    scale: 1,
    x: 0,
    y: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    startDistance: 0,
    anchorX: 0,
    anchorY: 0,
    dragging: false,
    lastTap: 0,
    tapCycle: 0
  };

  stage.style.touchAction = 'none';
  canvas.style.transformOrigin = '0 0';
  canvas.style.willChange = 'transform';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function bounds(scale = state.scale) {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const cw = canvas.offsetWidth * scale;
    const ch = canvas.offsetHeight * scale;
    return {
      minX: cw > sw ? sw - cw : (sw - cw) / 2,
      maxX: cw > sw ? 0 : (sw - cw) / 2,
      minY: ch > sh ? sh - ch : (sh - ch) / 2,
      maxY: ch > sh ? 0 : (sh - ch) / 2
    };
  }

  function constrain() {
    const b = bounds();
    state.x = clamp(state.x, b.minX, b.maxX);
    state.y = clamp(state.y, b.minY, b.maxY);
  }

  function apply(animate = false) {
    canvas.style.transition = animate ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none';
    canvas.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
    document.body.classList.toggle('pdf-pan-zoomed', state.scale > 1.01);
  }

  function reset(animate = true) {
    state.scale = 1;
    const b = bounds(1);
    state.x = b.maxX;
    state.y = b.maxY;
    constrain();
    apply(animate);
  }

  function zoomAt(targetScale, clientX, clientY, animate = true) {
    const rect = stage.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const oldScale = state.scale;
    const contentX = (px - state.x) / oldScale;
    const contentY = (py - state.y) / oldScale;
    state.scale = clamp(targetScale, 1, 4);
    state.x = px - contentX * state.scale;
    state.y = py - contentY * state.scale;
    constrain();
    apply(animate);
  }

  function midpoint(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  stage.addEventListener('pointerdown', event => {
    if (canvas.hidden) return;
    stage.setPointerCapture?.(event.pointerId);
    state.pointers.set(event.pointerId, event);
    canvas.style.transition = 'none';

    if (state.pointers.size === 1) {
      state.dragging = true;
      state.startX = state.x;
      state.startY = state.y;
      state.anchorX = event.clientX;
      state.anchorY = event.clientY;
    } else if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const mid = midpoint(a, b);
      state.startDistance = distance(a, b);
      state.startScale = state.scale;
      state.startX = state.x;
      state.startY = state.y;
      state.anchorX = mid.x;
      state.anchorY = mid.y;
      state.dragging = false;
    }
  }, { passive: false });

  stage.addEventListener('pointermove', event => {
    if (!state.pointers.has(event.pointerId) || canvas.hidden) return;
    state.pointers.set(event.pointerId, event);

    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const mid = midpoint(a, b);
      const rect = stage.getBoundingClientRect();
      const px = state.anchorX - rect.left;
      const py = state.anchorY - rect.top;
      const contentX = (px - state.startX) / state.startScale;
      const contentY = (py - state.startY) / state.startScale;
      state.scale = clamp(state.startScale * distance(a, b) / Math.max(1, state.startDistance), 1, 4);
      state.x = (mid.x - rect.left) - contentX * state.scale;
      state.y = (mid.y - rect.top) - contentY * state.scale;
      constrain();
      apply(false);
      event.preventDefault();
    } else if (state.pointers.size === 1 && state.scale > 1.01 && state.dragging) {
      state.x = state.startX + event.clientX - state.anchorX;
      state.y = state.startY + event.clientY - state.anchorY;
      constrain();
      apply(false);
      event.preventDefault();
    }
  }, { passive: false });

  function endPointer(event) {
    state.pointers.delete(event.pointerId);
    if (state.pointers.size === 1) {
      const remaining = [...state.pointers.values()][0];
      state.startX = state.x;
      state.startY = state.y;
      state.anchorX = remaining.clientX;
      state.anchorY = remaining.clientY;
      state.dragging = true;
    } else if (!state.pointers.size) {
      state.dragging = false;
      if (state.scale < 1.03) reset(true);
      else { constrain(); apply(true); }
    }
  }

  stage.addEventListener('pointerup', endPointer, { passive: true });
  stage.addEventListener('pointercancel', endPointer, { passive: true });

  stage.addEventListener('dblclick', event => {
    if (canvas.hidden) return;
    event.preventDefault();
    const now = Date.now();
    if (now - state.lastTap > 900) state.tapCycle = 0;
    state.lastTap = now;
    state.tapCycle = (state.tapCycle + 1) % 3;
    if (state.tapCycle === 1) zoomAt(2, event.clientX, event.clientY, true);
    else if (state.tapCycle === 2) zoomAt(3, event.clientX, event.clientY, true);
    else reset(true);
  });

  const observer = new MutationObserver(() => {
    if (!canvas.hidden && !canvas.dataset.panZoomReady) {
      canvas.dataset.panZoomReady = '1';
      requestAnimationFrame(() => reset(false));
    }
  });
  observer.observe(canvas, { attributes: true, attributeFilter: ['hidden', 'style', 'width', 'height'] });

  window.addEventListener('resize', () => {
    clearTimeout(window.__iosPanResize);
    window.__iosPanResize = setTimeout(() => { constrain(); apply(false); }, 120);
  });

  window.addEventListener('comics-page-changed', () => reset(false));
  setTimeout(() => { if (!canvas.hidden) reset(false); }, 600);
})();
