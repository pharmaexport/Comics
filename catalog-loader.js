(() => {
  const grid = document.querySelector('.comic-grid');
  const sourceUrl = document.getElementById('sourceUrl');
  const openUrlButton = document.getElementById('openUrlButton');
  if (!grid || !sourceUrl || !openUrlButton) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  async function loadCatalog() {
    try {
      const response = await fetch('./catalog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
      const catalog = await response.json();
      if (!Array.isArray(catalog) || !catalog.length) return;

      grid.innerHTML = '';
      catalog.forEach(item => {
        const card = document.createElement('article');
        card.className = 'comic-card catalog-card';
        card.tabIndex = 0;
        card.dataset.url = item.url;
        card.dataset.id = item.id;
        card.innerHTML = `
          <div class="cover-preview catalog-cover">
            <div class="catalog-monogram">${escapeHtml((item.title || '?').slice(0, 2).toUpperCase())}</div>
            <span class="badge">${escapeHtml((item.format || 'pdf').toUpperCase())}</span>
          </div>
          <div class="comic-info">
            <h2>${escapeHtml(item.title)}${item.volume ? ` — ${escapeHtml(item.volume)}` : ''}</h2>
            <p>${escapeHtml(item.subtitle || item.authors || '')}</p>
            ${item.authors ? `<small>${escapeHtml(item.authors)}</small>` : ''}
            <button type="button" class="catalog-open">Lire</button>
          </div>`;

        const open = () => {
          sourceUrl.value = item.url;
          localStorage.setItem('comics_last_catalog_id', item.id);
          openUrlButton.click();
        };
        card.addEventListener('click', event => {
          if (event.target.closest('button') || event.currentTarget === event.target) open();
          else open();
        });
        card.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
        grid.appendChild(card);
      });
    } catch (error) {
      console.error('Impossible de charger le catalogue', error);
    }
  }

  loadCatalog();
})();
