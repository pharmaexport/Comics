(() => {
  const grid = document.getElementById('libraryGrid');
  const continueRow = document.getElementById('continueReading');
  const search = document.getElementById('librarySearch');
  const filters = document.getElementById('libraryFilters');
  const sourceUrl = document.getElementById('sourceUrl');
  const openUrlButton = document.getElementById('openUrlButton');
  if (!grid || !continueRow || !search || !sourceUrl || !openUrlButton) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  let catalog = [];
  let activeFilter = 'all';

  const progressFor = id => {
    try {
      const all = JSON.parse(localStorage.getItem('comics_catalog_progress') || '{}');
      return all[id] || { page: 0, total: 0, percent: 0 };
    } catch { return { page: 0, total: 0, percent: 0 }; }
  };

  function openItem(item) {
    sourceUrl.value = item.url;
    localStorage.setItem('comics_last_catalog_id', item.id);
    openUrlButton.click();
  }

  function coverMarkup(item) {
    const initials = (item.title || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    return `<div class="kindle-cover-art" data-seed="${escapeHtml(item.id)}"><span>${escapeHtml(initials)}</span><small>${escapeHtml(item.volume ? `TOME ${item.volume}` : item.format.toUpperCase())}</small></div>`;
  }

  function cardMarkup(item, compact = false) {
    const progress = progressFor(item.id);
    const label = progress.percent > 0 ? `Reprendre à ${Math.round(progress.percent)} %` : 'Lire';
    return `
      <article class="kindle-book-card${compact ? ' compact' : ''}" tabindex="0" data-id="${escapeHtml(item.id)}">
        <div class="kindle-cover-wrap">
          ${coverMarkup(item)}
          <span class="kindle-format">${escapeHtml((item.format || 'pdf').toUpperCase())}</span>
          ${progress.percent > 0 ? `<div class="cover-progress"><i style="width:${Math.min(100, progress.percent)}%"></i></div>` : ''}
        </div>
        <div class="kindle-book-meta">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.volume ? `Tome ${item.volume} · ${item.subtitle || ''}` : item.subtitle || '')}</p>
          ${item.authors ? `<small>${escapeHtml(item.authors)}</small>` : ''}
          <button type="button" class="kindle-read-button">${label}</button>
        </div>
      </article>`;
  }

  function bindCards(container) {
    container.querySelectorAll('.kindle-book-card').forEach(card => {
      const item = catalog.find(entry => entry.id === card.dataset.id);
      if (!item) return;
      card.addEventListener('click', () => openItem(item));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openItem(item);
        }
      });
    });
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase('fr');
    const filtered = catalog.filter(item => {
      const text = `${item.title} ${item.subtitle || ''} ${item.authors || ''} ${item.volume || ''}`.toLocaleLowerCase('fr');
      const matchesSearch = !query || text.includes(query);
      const progress = progressFor(item.id);
      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'reading' && progress.percent > 0 && progress.percent < 100)
        || (activeFilter === 'unread' && !progress.percent)
        || (activeFilter === 'finished' && progress.percent >= 100);
      return matchesSearch && matchesFilter;
    });

    const inProgress = catalog.filter(item => {
      const progress = progressFor(item.id);
      return progress.percent > 0 && progress.percent < 100;
    });

    continueRow.innerHTML = inProgress.length
      ? inProgress.map(item => cardMarkup(item, true)).join('')
      : '<div class="kindle-empty"><strong>Aucune lecture en cours</strong><span>Ouvrez un album pour le retrouver ici.</span></div>';

    grid.innerHTML = filtered.length
      ? filtered.map(item => cardMarkup(item)).join('')
      : '<div class="kindle-empty"><strong>Aucun livre trouvé</strong><span>Essayez une autre recherche ou un autre filtre.</span></div>';

    bindCards(continueRow);
    bindCards(grid);
    document.getElementById('libraryCount').textContent = `${catalog.length} livre${catalog.length > 1 ? 's' : ''}`;
  }

  search.addEventListener('input', render);
  filters?.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  });

  fetch('./catalog.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
      return response.json();
    })
    .then(data => {
      catalog = Array.isArray(data) ? data : [];
      render();
    })
    .catch(error => {
      console.error('Impossible de charger le catalogue', error);
      grid.innerHTML = '<div class="kindle-empty"><strong>Catalogue indisponible</strong><span>Rechargez la page pour réessayer.</span></div>';
    });
})();
