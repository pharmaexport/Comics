(() => {
  const panel = document.querySelector('.kindle-source-panel');
  if (!panel || document.getElementById('mrmImporter')) return;

  const section = document.createElement('section');
  section.id = 'mrmImporter';
  section.className = 'mrm-importer';
  section.innerHTML = `
    <h3>Importer mes pages MyReadingManga</h3>
    <p>Colle l’adresse d’une de tes publications. Le bouton valide l’adresse et ouvre la page dans ton navigateur.</p>
    <div class="mrm-row">
      <input id="mrmUrl" type="url" inputmode="url" placeholder="https://myreadingmanga.info/…" autocomplete="url">
      <button id="mrmValidate" type="button">Valider</button>
    </div>
    <p id="mrmMessage" class="mrm-message" role="status"></p>
    <div class="mrm-actions">
      <a id="mrmInstall" class="mrm-install" href="./myreadingmanga-import.user.js">Installer le script navigateur</a>
      <button id="mrmChoosePdf" type="button">Importer le PDF obtenu</button>
    </div>
    <small>Le script ne contourne pas l’accès au site : il exporte uniquement les grandes images déjà affichées dans ta session en un PDF compatible avec Comics.</small>`;
  panel.appendChild(section);

  const input = section.querySelector('#mrmUrl');
  const validate = section.querySelector('#mrmValidate');
  const message = section.querySelector('#mrmMessage');
  const choosePdf = section.querySelector('#mrmChoosePdf');

  const setMessage = (text, type = '') => {
    message.textContent = text;
    message.dataset.type = type;
  };

  validate.addEventListener('click', () => {
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
    localStorage.setItem('comics_pending_mrm_url', url.href);
    setMessage('Adresse validée. La page est ouverte dans un nouvel onglet.', 'success');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      validate.click();
    }
  });

  choosePdf.addEventListener('click', () => document.getElementById('sourceFile')?.click());

  const style = document.createElement('style');
  style.textContent = `
    .mrm-importer{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line);display:grid;gap:.7rem}
    .mrm-importer h3,.mrm-importer p{margin:0}.mrm-importer p,.mrm-importer small{color:var(--muted)}
    .mrm-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem}.mrm-row input{min-height:46px;width:100%}
    .mrm-row button,.mrm-actions button,.mrm-install{min-height:46px;padding:.7rem 1rem;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:800}
    .mrm-install{background:var(--text);color:var(--bg)}.mrm-actions{display:flex;gap:.6rem;flex-wrap:wrap}.mrm-message{min-height:1.2em;font-size:.84rem}
    .mrm-message[data-type="error"]{color:#fb7185}.mrm-message[data-type="success"]{color:#4ade80}
    @media(max-width:620px){.mrm-row{grid-template-columns:1fr}.mrm-actions>*{width:100%}}
  `;
  document.head.appendChild(style);
})();
