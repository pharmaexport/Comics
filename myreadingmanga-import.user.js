// ==UserScript==
// @name         Comics - Import MyReadingManga
// @namespace    https://github.com/pharmaexport/Comics
// @version      1.0.0
// @description  Exporte en CBZ les images déjà accessibles dans une page MyReadingManga ouverte dans le navigateur.
// @match        https://myreadingmanga.info/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
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

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 2500));
      const urls = imageUrls();
      if (!urls.length) throw new Error('Aucune image détectée. Fais défiler toute la page puis réessaie.');

      const zip = new JSZip();
      let saved = 0;
      for (let index = 0; index < urls.length; index += 1) {
        setStatus(`Téléchargement ${index + 1}/${urls.length}…`);
        try {
          const blob = await fetchBlob(urls[index]);
          const type = blob.type || '';
          const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
          zip.file(`${String(saved + 1).padStart(4, '0')}.${extension}`, blob);
          saved += 1;
        } catch (error) {
          console.warn('Image ignorée', urls[index], error);
        }
      }
      if (!saved) throw new Error('Aucune image n’a pu être enregistrée.');

      setStatus('Création du CBZ…');
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanName(document.title)}.cbz`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus(`${saved} pages exportées. Importe maintenant le fichier CBZ dans Comics.`);
    } catch (error) {
      setStatus(error.message || 'Échec de l’export.');
    } finally {
      button.disabled = false;
    }
  });
})();
