(() => {
  fetch('./catalog.json', { cache: 'force-cache' })
    .then(response => response.ok ? response.json() : [])
    .then(catalog => sessionStorage.setItem('comics_catalog_snapshot', JSON.stringify(Array.isArray(catalog) ? catalog : [])))
    .catch(() => {});
})();
