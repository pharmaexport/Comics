(() => {
  const panel = document.querySelector('.kindle-source-panel');
  if (!panel || document.getElementById('mrmImporter')) return;

  let extensionReady = false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const section = document.createElement('section');
  section.id = 'mrmImporter';
  section.className = 'mrm-importer';
  section.innerHTML = `
    <h3>Importer depuis MyReadingManga</h3>
    <p>${isIOS
      ? 'Sur iPhone, colle l’adresse puis ouvre la publication. L’import automatique nécessite encore l’installation initiale d’un raccourci iOS.'
      : 'Colle l’adresse d’une de tes publications puis lance l’import automatique vers Drive et la bibliothèque Comics.'}</p>
    <div class="mrm-input-line">
      <input id="mrmUrl" type="text" inputmode="url" enterkeyhint="go" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://myreadingmanga.info/…" aria-label="Adresse MyReadingManga">
      <button id="mrmPaste" type="button">Coller</button>
    </div>
    <button id="mrmImport" class="mrm-import-button" type="button">${isIOS ? 'Ouvrir la publication' : 'Importer'}</button>
    <div class="mrm-progress" hidden><i></i></div>
    <p id="mrmMessage" class="mrm-message" role="status">${isIOS
      ? 'Le raccourci iOS n’est pas encore installé sur cet iPhone.'
      : 'Recherche de l’extension…'}</p>
    <div class="mrm-actions">
      ${isIOS
        ? '<button class="mrm-install" id="mrmIOSHelp" type="button">Configurer l’import iPhone</button>'
        : '<a class="mrm-install" href="https://github.com/pharmaexport/Comics/tree/main/extension" target="_blank" rel="noopener">Installer l’extension</a>'}
    </div>
    <small>Les fichiers importés sont destinés au dossier Drive « Imports MyReadingManga ».</small>`;
  panel.appendChild(section);

  const input = section.querySelector('#mrmUrl');
  const pasteButton = section.querySelector('#mrmPaste');
  const button = section.querySelector('#mrmImport');
  const message = section.querySelector('#mrmMessage');
  const progress = section.querySelector('.mrm-progress');
  const progressBar = progress.querySelector('i');
  const iosHelp = section.querySelector('#mrmIOSHelp');

  const setMessage = (text, type = '') => {
    message.textContent = text;
    message.dataset.type = type;
  };

  const normalizePastedValue = value => String(value || '').trim().replace(/^['\"]|['\"]$/g, '');

  pasteButton.addEventListener('click', async () => {
    input.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error('Presse-papiers vide');
      input.value = normalizePastedValue(text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setMessage('Adresse collée.', 'success');
    } catch {
      input.focus();
      input.setSelectionRange(0, input.value.length);
      setMessage('Maintiens le doigt dans le champ puis choisis « Coller ».');
    }
  });

  input.addEventListener('focus', () => {
    if (input.value) setTimeout(() => input.setSelectionRange(0, input.value.length), 30);
  });

  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text');
    if (text) {
      event.preventDefault();
      input.value = normalizePastedValue(text);
      setMessage('Adresse collée.', 'success');
    }
  });

  iosHelp?.addEventListener('click', () => {
    setMessage('Je ne peux pas installer un raccourci iOS à distance. Il doit être ajouté une fois sur cet iPhone avant qu’un import en un clic soit possible.', 'error');
  });

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.type === 'COMICS_EXTENSION_READY') {
      extensionReady = true;
      setMessage('Extension prête. Tu peux importer en un clic.', 'success');
    }
    if (event.data?.type === 'COMICS_IMPORT_MRM_RESULT') {
      button.disabled = false;
      progress.hidden = true;
      setMessage(event.data.message || (event.data.ok ? 'Import terminé.' : 'Échec de l’import.'), event.data.ok ? 'success' : 'error');
      if (event.data.ok) setTimeout(() => location.reload(), 1800);
    }
  });

  button.addEventListener('click', () => {
    let url;
    try { url = new URL(normalizePastedValue(input.value)); }
    catch {
      setMessage('Adresse invalide.', 'error');
      input.focus();
      return;
    }
    if (!/(^|\.)myreadingmanga\.info$/i.test(url.hostname)) {
      setMessage('Utilise une adresse myreadingmanga.info.', 'error');
      input.focus();
      return;
    }
    if (isIOS) {
      localStorage.setItem('comics_pending_mrm_url', url.href);
      setMessage('Publication ouverte. Aucun import Drive ne démarrera tant que le raccourci iOS n’est pas installé.', 'error');
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!extensionReady) {
      setMessage('L’extension Comics Importer n’est pas installée ou n’est pas active.', 'error');
      return;
    }
    button.disabled = true;
    progress.hidden = false;
    progressBar.style.width = '12%';
    setMessage('Ouverture de la page et préparation de l’import…');
    window.postMessage({ type: 'COMICS_IMPORT_MRM', url: url.href }, '*');
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      button.click();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    .mrm-importer{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line);display:grid;gap:.8rem}
    .mrm-importer h3,.mrm-importer p{margin:0}.mrm-importer p,.mrm-importer small{color:var(--muted)}
    .mrm-input-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;min-width:0}
    .mrm-input-line input{display:block;min-width:0;width:100%;min-height:52px;font-size:16px!important;line-height:1.25;-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important;touch-action:manipulation;appearance:none}
    .mrm-input-line button,.mrm-import-button,.mrm-install{min-height:52px;padding:.75rem 1rem;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:800}
    .mrm-import-button{width:100%}.mrm-install{background:var(--text);color:var(--bg);border:0}.mrm-actions{display:flex;gap:.6rem;flex-wrap:wrap}.mrm-message{min-height:1.2em;font-size:.84rem}
    .mrm-message[data-type="error"]{color:#fb7185}.mrm-message[data-type="success"]{color:#4ade80}
    .mrm-progress{height:8px;border-radius:999px;background:var(--line);overflow:hidden}.mrm-progress i{display:block;height:100%;width:12%;background:var(--accent2);transition:width .25s ease}
    @media(max-width:620px){.mrm-input-line{grid-template-columns:minmax(0,1fr) auto}.mrm-input-line button{padding-inline:.85rem}.mrm-actions>*{width:100%}}
  `;
  document.head.appendChild(style);
})();
