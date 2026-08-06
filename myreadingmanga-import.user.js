// ==UserScript==
// @name         Comics - Import MyReadingManga
// @namespace    https://github.com/pharmaexport/Comics
// @version      1.1.0
// @description  Exporte en PDF les images déjà accessibles dans une page MyReadingManga ouverte dans le navigateur.
// @match        https://myreadingmanga.info/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js
// ==/UserScript==

(() => {
  'use strict';

  const button = document.createElement('button');
  button.textContent = 'Exporter vers Comics';
  button.style.cssText = 'position:fixed;right:16px;bottom:18px;z-index:2147483647;padding:12px 16px;border:0;border-radius:999px;background:#ff9900;color:#111;font:700 14px system-ui;box-shadow:0 8px 24px #0008;cursor:pointer';
  document.body.appendChild(button);

  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;right:16px;bottom:72px;z-index:2147483647;max-width:320px;padding:10px 12px;border-radius:10px;background:#111;color:#fff;font:13px/1.4 system-ui;display:none;box-shadow:0 8px 24px #0008';
  document.body.appendChild(status);

  const setStatus = message => {
    status.textContent = message;
    status.style.display = 'block';
  };

  const cleanName = value => (value || 'manga')
    .replace(/\s+[|–-]\s+MyReadingManga.*$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const imageUrls = () => {
    const candidates = [...document.images]
      .filter(img => (img.naturalWidth || img.width) >= 450 && (img.naturalHeight || img.height) >= 450)
      .map(img => img.currentSrc || img.src || img.dataset.src || img.dataset.lazySrc)
      .filter(Boolean)
      .map(url => new URL(url, location.href).href)
      .filter(url => /^https?:/i.test(url))
      .filter(url => !/logo|avatar|emoji|icon|banner|advert|gravatar/i.test(url));
    return [...new Set(candidates)];
  };

  const fetchBlob = url => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      headers: { Referer: location.href },
      onload: response => response.status >= 200 && response.status < 300
        ? resolve(response.response)
        : reject(new Error(`HTTP ${response.status}`)),
      onerror: () => reject(new Error('Téléchargement impossible'))
    });
  });

  const blobToImage = blob => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    image.src = url;
  });

  const imageToJpeg = image => {
    const maxWidth = 1800;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height };
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 2500));
      const urls = imageUrls();
      if (!urls.length) throw new Error('Aucune grande image détectée. Fais défiler toute la page puis réessaie.');

      let pdf = null;
      let saved = 0;
      for (let index = 0; index < urls.length; index += 1) {
        setStatus(`Préparation de la page ${index + 1}/${urls.length}…`);
        try {
          const blob = await fetchBlob(urls[index]);
          const image = await blobToImage(blob);
          const page = imageToJpeg(image);
          const orientation = page.width > page.height ? 'landscape' : 'portrait';
          if (!pdf) {
            pdf = new window.jspdf.jsPDF({ orientation, unit: 'px', format: [page.width, page.height], compress: true, hotfixes: ['px_scaling'] });
          } else {
            pdf.addPage([page.width, page.height], orientation);
          }
          pdf.addImage(page.data, 'JPEG', 0, 0, page.width, page.height, undefined, 'FAST');
          saved += 1;
        } catch (error) {
          console.warn('Image ignorée', urls[index], error);
        }
      }
      if (!pdf || !saved) throw new Error('Aucune page n’a pu être enregistrée.');

      setStatus('Création du PDF…');
      pdf.save(`${cleanName(document.title)}.pdf`);
      setStatus(`${saved} pages exportées. Importe maintenant ce PDF dans Comics.`);
    } catch (error) {
      setStatus(error.message || 'Échec de l’export.');
    } finally {
      button.disabled = false;
    }
  });
})();
