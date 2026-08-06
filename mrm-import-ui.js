(() => {
  const panel = document.querySelector('.kindle-source-panel');
  if (!panel || document.getElementById('mrmImporter')) return;

  let extensionReady = false;
  const section = document.createElement('section');
  section.id = 'mrmImporter';
  section.className = 'mrm-importer';
  section.innerHTML = `
    <h3>Importer depuis MyReadingManga</h3>
    <p>Colle l’adresse d’une de tes publications puis lance l’import automatique vers Drive et la bibliothèque Comics.</p>
    <div class="mrm-row">
      <input id="mrmUrl" type="url" inputmode="url" placeholder="https://myreadingmanga.info/…" autocomplete="url">
      <button id="mrmImport" type="button">Importer</button>
    </div>
    <div class="mrm-progress" hidden><i></i></div>
    <p id="mrmMessage" class="mrm-message" role="status">Recherche de l’extension…</p>
    <div class="mrm-actions">
      <a class="mrm-install" href="https://github.com/pharmaexport/Comics/tree/main/extension" target="_blank" rel="noopener">Installer l’extension</a>
    </div>
    <small>L’import crée un PDF, l’enregistre dans ton dossier Drive Bibliothèque, puis met à jour catalog.json sur main.</small>`;
  panel.appendChild(section);

  const input = section.querySelector('#mrmUrl');
  const button = section.querySelector('#mrmImport');
  const message = section.querySelector('#mrmMessage');
  const progress = section.querySelector('.mrm-progress');
  const progressBar = progress.querySelector('i');

  const setMessage = (text, type = '') => {
    message.textContent = text;
    message.dataset.type = type;
  };

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
    try { url = new URL(input.value.trim()); }
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
    .mrm-importer{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line);display:grid;gap:.7rem}
    .mrm-importer h3,.mrm-importer p{margin:0}.mrm-importer p,.mrm-importer small{color:var(--muted)}
    .mrm-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem}.mrm-row input{min-height:46px;width:100%}
    .mrm-row button,.mrm-install{min-height:46px;padding:.7rem 1rem;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:800}
    .mrm-install{background:var(--text);color:var(--bg)}.mrm-actions{display:flex;gap:.6rem;flex-wrap:wrap}.mrm-message{min-height:1.2em;font-size:.84rem}
    .mrm-message[data-type="error"]{color:#fb7185}.mrm-message[data-type="success"]{color:#4ade80}
    .mrm-progress{height:8px;border-radius:999px;background:var(--line);overflow:hidden}.mrm-progress i{display:block;height:100%;width:12%;background:var(--accent2);transition:width .25s ease}
    @media(max-width:620px){.mrm-row{grid-template-columns:1fr}.mrm-actions>*{width:100%}}
  `;
  document.head.appendChild(style);
})();
