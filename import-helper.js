(() => {
  const input = document.getElementById('mrmUrl');
  const button = document.getElementById('mrmValidate');
  const message = document.getElementById('mrmMessage');
  const install = document.getElementById('mrmInstall');
  if (!input || !button || !message || !install) return;

  install.href = './myreadingmanga-import.user.js';

  const setMessage = (text, type = '') => {
    message.textContent = text;
    message.dataset.type = type;
  };

  button.addEventListener('click', () => {
    let url;
    try {
      url = new URL(input.value.trim());
    } catch {
      setMessage('Adresse invalide.', 'error');
      input.focus();
      return;
    }

    if (!/(^|\.)myreadingmanga\.info$/i.test(url.hostname)) {
      setMessage('Cette zone accepte uniquement une adresse myreadingmanga.info.', 'error');
      input.focus();
      return;
    }

    localStorage.setItem('comics_pending_mrm_url', url.href);
    setMessage('Adresse validée. La page va s’ouvrir : utilise ensuite le bouton « Exporter vers Comics ».', 'success');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      button.click();
    }
  });
})();
